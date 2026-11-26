<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAutoRefresh } from "@/hooks/common/auto-refresh";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  deleteStrategyGroup,
  fetchStrategyGroupDeleteCheck,
  fetchStrategyGroups,
  saveStrategyGroupConfiguration,
  updateStrategyGroup,
} from "@/service/api";
import type { StrategyGroupRecord } from "@/service/api";
import { showSwitchMessage } from "@/utils/message";
import EpayDeleteDialog from "@/components/custom/epay-delete-dialog.vue";
import EpayStatusSwitch from "@/components/custom/epay-status-switch.vue";
import { useAuth } from "@/hooks/business/auth";
import { defaultTransform, useUIPaginatedTable } from "@/hooks/common/table";
import { $t } from "@/locales";
import StrategyLogs from "../adjustments/index.vue";
import GroupWorkspace from "../modules/group-workspace.vue";
import { defaultConfiguration } from "../modules/workspace-model";

const route = useRoute();
const router = useRouter();
const selectedId = computed(() => (typeof route.query.group === "string" ? route.query.group : ""));
const { hasAuth } = useAuth();
const logVisible = ref(false);
const working = ref(false);
const params = ref({ current: 1, size: 20 });
const { columns, columnChecks, data: rows, loading, getData: load, refreshData, getDataByPage, pagination, mobilePagination } =
  useUIPaginatedTable({
    immediate: false,
    api: () => fetchStrategyGroups({ ...params.value, keyword: appliedKeyword.value }),
    transform: response => defaultTransform(response),
    paginationProps: { pageSize: 20 },
    onPaginationParamsChange: value => {
      params.value = { current: value.currentPage ?? 1, size: value.pageSize ?? 20 };
    },
    columns: () => [
      { prop: "name", label: "策略组名称", minWidth: 220 },
      { prop: "rules", label: "规则数", width: 90, align: "center" },
      { prop: "targets", label: "绑定对象", width: 100, align: "center" },
      { prop: "sites", label: "关联站点", minWidth: 170, showOverflowTooltip: true },
      { prop: "status", label: "状态", width: 110, align: "center" },
      { prop: "operate", label: "操作", width: 140, align: "center", fixed: "right" },
    ],
  });
const current = computed(() => pagination.currentPage ?? 1);
const pageSize = computed(() => pagination.pageSize ?? 20);
const keyword = ref("");
const appliedKeyword = ref("");
const createDialog = ref(false);
const creating = ref(false);
const form = ref({ name: "", description: "" });

function search() {
  appliedKeyword.value = keyword.value.trim();
  return getDataByPage(1);
}
function enterGroup(id: string) {
  return router.push({ query: { ...route.query, group: id } });
}
function openCreate() {
  form.value = { name: "", description: "" };
  createDialog.value = true;
}
async function createGroup() {
  if (creating.value) return;
  if (!form.value.name.trim()) {
    window.$message?.warning("请填写策略组名称");
    return;
  }
  creating.value = true;
  try {
    const response = await saveStrategyGroupConfiguration({
      name: form.value.name.trim(),
      description: form.value.description,
      configuration: defaultConfiguration(),
      targets: [],
    });
    if (!response.error) {
      createDialog.value = false;
      window.$message?.success("策略组已创建，请配置执行对象和规则");
      await enterGroup(response.data.id);
    }
  } finally {
    creating.value = false;
  }
}
async function toggleGroup(group: StrategyGroupRecord) {
  if (working.value) return;
  const { _count: counts } = group;
  if (group.status !== "RUNNING" && (!group.configuration || !counts?.targets)) {
    window.$message?.warning("请先进入策略组，配置规则并绑定执行对象");
    return;
  }
  working.value = true;
  try {
    const response = await updateStrategyGroup(group.id, {
      status: group.status === "RUNNING" ? "PAUSED" : "RUNNING",
    });
    if (!response.error) {
      const enabled = response.data.status === "RUNNING";
      showSwitchMessage(enabled, enabled ? "策略组已启用" : "策略组已停止");
      await load();
    }
  } finally {
    working.value = false;
  }
}
// 删除弹窗：先检查占用（是否运行中、仍绑定哪些执行对象），无占用才允许输入“删除”确认
const deleteVisible = ref(false);
const deleteTarget = ref({ id: "", name: "" });
function openDelete(group: StrategyGroupRecord) {
  deleteTarget.value = { id: group.id, name: group.name };
  deleteVisible.value = true;
}
async function afterDeleted() {
  if (rows.value.length === 1 && current.value > 1) {
    await getDataByPage(current.value - 1);
  } else {
    await load();
  }
}
watch(
  selectedId,
  (id) => {
    if (!id) load();
  },
  { immediate: true },
);
useAutoRefresh(refreshData, undefined, () => !selectedId.value && !working.value && !creating.value && !createDialog.value && !logVisible.value && !deleteVisible.value);
</script>

<template>
  <GroupWorkspace v-if="selectedId" :key="selectedId" :group-id="selectedId" />
  <ElCard v-else class="epay-table-card card-wrapper">
    <div class="epay-table-toolbar">
      <ElForm class="epay-table-search" inline @submit.prevent="search">
        <ElFormItem label="策略组名称">
          <ElInput v-model="keyword" placeholder="搜索策略组名称" clearable @clear="search" />
        </ElFormItem>
        <ElFormItem>
          <ElButton type="primary" native-type="submit">搜索</ElButton>
        </ElFormItem>
      </ElForm>
      <div class="epay-table-actions">
        <ElButton type="primary" @click="openCreate">新增策略组</ElButton>
        <ElButton v-if="hasAuth('adjustment:read')" @click="logVisible = true">
          <template #icon><SvgIcon icon="tabler:history" /></template>
          {{ $t('route.strategy-center_adjustments') }}
        </ElButton>
        <TableColumnSetting v-model:columns="columnChecks" />
      </div>
    </div>

    <ElTable v-loading="loading || working" :data="rows" row-key="id" border>
      <ElTableColumn
        type="index"
        label="编号"
        width="70"
        align="center"
        :index="(index: number) => (current - 1) * pageSize + index + 1"
      />
      <ElTableColumn v-for="column in columns" :key="column.prop" v-bind="column">
        <template #default="{ row }">
          <RouterLink v-if="column.prop === 'name'" class="epay-site-cell" :to="{ query: { ...route.query, group: row.id } }">
            <span class="epay-color-icon"><SvgIcon icon="tabler:adjustments-horizontal" /></span>
            <div>
              <strong>{{ row.name }}</strong>
              <small v-if="row.description" :title="row.description">{{ row.description }}</small>
            </div>
          </RouterLink>
          <template v-else-if="column.prop === 'rules'">{{ row.configuration?.rules.length ?? 0 }}</template>
          <template v-else-if="column.prop === 'targets'">{{ row._count?.targets ?? 0 }}</template>
          <template v-else-if="column.prop === 'sites'">
            {{
              row.targets
                .map((target: StrategyGroupRecord["targets"][number]) => target.site.name)
                .join("、") || "尚未绑定"
            }}
          </template>
          <EpayStatusSwitch
            v-else-if="column.prop === 'status'"
            :checked="row.status === 'RUNNING'"
            :label="row.status === 'RUNNING' ? '停止策略组' : '启用策略组'"
            :loading="working"
            @change="toggleGroup(row)"
          />
          <template v-else-if="column.prop === 'operate'">
            <ElButton type="primary" link @click="enterGroup(row.id)">进入配置</ElButton>
            <ElButton
              type="danger"
              link
              :disabled="working"
              @click="openDelete(row)"
            >
              删除
            </ElButton>
          </template>
        </template>
      </ElTableColumn>
    </ElTable>
    <ElPagination
      v-bind="mobilePagination"
      layout="total, prev, pager, next"
      class="mt-16px justify-end"
      @current-change="getDataByPage"
    />
    <ElDrawer v-model="logVisible" :title="$t('route.strategy-center_adjustments')" size="min(1440px, 95vw)" destroy-on-close>
      <StrategyLogs />
    </ElDrawer>
    <ElDialog
      v-model="createDialog"
      title="新增策略组"
      width="min(460px, 95vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="!creating"
      :show-close="!creating"
    >
      <ElForm v-loading="creating" label-position="top">
        <ElFormItem label="策略组名称" required
          ><ElInput v-model.trim="form.name" maxlength="100"
        /></ElFormItem>
        <ElFormItem label="说明"
          ><ElInput v-model="form.description" type="textarea" maxlength="500"
        /></ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton :disabled="creating" @click="createDialog = false">取消</ElButton>
        <ElButton type="primary" :loading="creating" @click="createGroup">创建并进入配置</ElButton>
      </template>
    </ElDialog>
    <EpayDeleteDialog
      v-model:visible="deleteVisible"
      kind="站点策略"
      :target-id="deleteTarget.id"
      :target-name="deleteTarget.name"
      :check="fetchStrategyGroupDeleteCheck"
      :remove="deleteStrategyGroup"
      @deleted="afterDeleted"
    />
  </ElCard>
</template>
