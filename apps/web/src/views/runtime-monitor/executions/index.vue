<script setup lang="ts">
import { useAutoRefresh } from '@/hooks/common/auto-refresh';
import { useTableQuery } from '@/hooks/common/table-query';
import { useUITable } from '@/hooks/common/table';
import { computed, onMounted, reactive, ref } from 'vue';
import type { TableInstance } from 'element-plus';
import { fetchOperationLogs } from '@/service/api';
import { formatTime } from '@/views/site-management/modules/shared';
import { levelLabel, levelType, presentOperationLog, requestDetails, statusLabel } from './modules/log-presentation';

const displayRows = computed(() =>
  rows.value.map(row => {
    const display = presentOperationLog(row);
    return {
      ...row,
      display,
      changeCount: display.changes.length + (display.targetChanges?.details.length ?? 0)
    };
  })
);
const table = ref<TableInstance>();
const current = ref(1);
const size = ref(20);
const total = ref(0);
const filters = reactive({
  username: '',
  source: '',
  levels: [] as string[],
  status: '',
  keyword: '',
  startAt: '',
  endAt: ''
});
const levelOptions = [
  { label: '普通记录', value: 'INFO' },
  { label: '需要关注', value: 'WARN' },
  { label: '异常记录', value: 'ERROR' }
];
const { query, applyQuery } = useTableQuery(filters);
const { data: rows, loading, getData: load, refreshData } = useUITable({
  immediate: false,
  columns: () => [],
  api: () => fetchOperationLogs({
      current: current.value,
      size: size.value,
      username: query.value.username || undefined,
      source: query.value.source || undefined,
      levels: query.value.levels.length ? query.value.levels.join(',') : undefined,
      status: query.value.status || undefined,
      keyword: query.value.keyword || undefined,
      startAt: query.value.startAt ? new Date(query.value.startAt).toISOString() : undefined,
      endAt: query.value.endAt ? new Date(query.value.endAt).toISOString() : undefined
    }),
  isResponseValid: result => !result.error,
  transform: result => {
    total.value = result.data!.total;
    return result.data!.records;
  },
  onFetched: () => {
    const lastPage = Math.max(1, Math.ceil(total.value / size.value));
    if (current.value > lastPage) { current.value = lastPage; void load(); }
  }
});
function search() {
  applyQuery();
  current.value = 1;
  load();
}
function resultType(status: string) {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  return 'warning';
}
onMounted(load);
useAutoRefresh(refreshData);
</script>

<template>
  <ElCard class="epay-table-card min-w-0 card-wrapper">
    <p class="mb-16px text-sm text-[var(--el-text-color-secondary)]">
      查看谁在什么站点、针对哪个策略做了什么，以及原本值、本次设置和执行结果。展开可查看全部改动。
    </p>
    <div class="mb-16px flex flex-wrap items-center gap-12px">
      <ElSelect
        v-model="filters.source"
        clearable
        placeholder="操作来源"
        aria-label="操作来源"
        class="w-140px lt-sm:w-full"
      >
        <ElOption label="人工操作" value="USER" />
        <ElOption label="系统自动" value="SYSTEM" />
      </ElSelect>
      <ElInput
        v-model="filters.username"
        clearable
        placeholder="操作账号"
        aria-label="操作账号"
        class="w-160px lt-sm:w-full"
        @keyup.enter="search"
      />
      <ElSelect
        v-model="filters.levels"
        multiple
        collapse-tags
        clearable
        placeholder="日志级别"
        aria-label="日志级别"
        class="w-180px lt-sm:w-full"
      >
        <ElOption v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
      </ElSelect>
      <ElSelect
        v-model="filters.status"
        clearable
        placeholder="执行结果"
        aria-label="执行结果"
        class="w-140px lt-sm:w-full"
      >
        <ElOption label="成功" value="SUCCEEDED" />
        <ElOption label="失败" value="FAILED" />
        <ElOption label="等待执行" value="PENDING" />
        <ElOption label="已跳过" value="SKIPPED" />
        <ElOption label="已过期" value="EXPIRED" />
        <ElOption label="结果未知" value="UNKNOWN" />
      </ElSelect>
      <ElInput
        v-model="filters.keyword"
        clearable
        placeholder="操作人、站点、策略或操作内容"
        aria-label="日志关键词"
        class="w-260px lt-sm:w-full"
        @keyup.enter="search"
      />
      <ElDatePicker
        v-model="filters.startAt"
        type="datetime"
        value-format="YYYY-MM-DDTHH:mm:ss"
        placeholder="开始时间"
        aria-label="开始时间"
        class="w-200px lt-sm:w-full"
      />
      <ElDatePicker
        v-model="filters.endAt"
        type="datetime"
        value-format="YYYY-MM-DDTHH:mm:ss"
        placeholder="结束时间"
        aria-label="结束时间"
        class="w-200px lt-sm:w-full"
      />
      <ElButton type="primary" :loading="loading" @click="search">查询</ElButton>
    </div>

    <ElTable
      ref="table"
      v-loading="loading"
      :data="displayRows"
      row-key="id"
      border
      empty-text="没有符合条件的操作记录"
    >
      <ElTableColumn type="expand">
        <template #default="{ row }">
          <div class="p-16px space-y-16px">
            <section aria-label="操作详情">
              <h3 class="mb-8px text-base font-semibold">这次操作做了什么</h3>
              <p class="break-words leading-7">{{ row.display.sentence }}</p>
              <p class="mt-4px break-words text-[var(--el-text-color-secondary)]">
                {{ row.display.result }}{{ row.display.reason ? `：${row.display.reason}` : '。' }}
              </p>
            </section>
            <section v-if="row.display.targetChanges" aria-label="执行对象变化">
              <h3 class="mb-8px text-base font-semibold">
                {{ row.status === 'SUCCEEDED' ? '这次增减了哪些执行对象' : '本次提交的执行对象变更' }}
              </h3>
              <p class="mb-8px leading-7">{{ row.display.targetChanges.summary }}</p>
              <p
                v-if="row.display.targetChanges.details.some((detail: { action: string }) => detail.action === '移除')"
                class="mb-8px text-sm text-[var(--el-text-color-secondary)]"
              >
                移除表示取消该策略组对通道的管理，站点通道仍保留。
              </p>
              <ElTable :data="row.display.targetChanges.details" border empty-text="执行对象没有增减">
                <ElTableColumn prop="action" label="本次操作" width="100" />
                <ElTableColumn prop="site" label="哪个站点" min-width="180" />
                <ElTableColumn prop="group" label="哪个轮询组" min-width="180" />
                <ElTableColumn prop="channel" label="哪个通道" min-width="220" />
              </ElTable>
            </section>
            <section v-if="row.display.changes.length || !row.display.targetChanges" aria-label="修改前后对照">
              <h3 class="mb-8px text-base font-semibold">具体改了哪些内容</h3>
              <ElTable v-if="row.display.changes.length" :data="row.display.changes" border>
                <ElTableColumn prop="field" label="修改项" min-width="170" />
                <ElTableColumn prop="before" label="原本值" min-width="200" />
                <ElTableColumn
                  prop="after"
                  :label="row.status === 'SUCCEEDED' ? '修改后 / 本次设置' : '本次想改成（不代表已生效）'"
                  min-width="220"
                />
                <ElTableColumn
                  v-if="row.display.changes.some((change: { actual?: string }) => change.actual !== undefined)"
                  label="执行后实际回读"
                  min-width="170"
                >
                  <template #default="{ row: change }">{{ change.actual ?? '未保存回读值' }}</template>
                </ElTableColumn>
              </ElTable>
              <p v-else class="text-[var(--el-text-color-secondary)]">{{ row.display.noChanges }}</p>
            </section>
            <details class="text-sm text-[var(--el-text-color-secondary)]">
              <summary class="cursor-pointer">查看接口记录</summary>
              <div class="mt-8px break-all space-y-4px">
                <p>记录时间：{{ formatTime(row.endTime) }}</p>
                <p>日志级别：{{ levelLabel(row.level) }}</p>
                <p v-if="row.duration > 0">处理耗时：{{ row.duration }} 毫秒</p>
                <p>接口：{{ row.method }} {{ row.url }}</p>
                <p v-for="(line, index) in requestDetails(row.params)" :key="`param-${index}`">{{ line }}</p>
                <p v-for="(line, index) in requestDetails(row.body)" :key="`body-${index}`">{{ line }}</p>
                <p v-for="(line, index) in requestDetails(row.response)" :key="`response-${index}`">{{ line }}</p>
              </div>
            </details>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="时间 / 谁操作" min-width="175">
        <template #default="{ row }">
          <div class="font-medium">{{ row.display.actor }}</div>
          <div class="mt-4px text-xs text-[var(--el-text-color-secondary)]">
            {{ row.source === 'SYSTEM' ? '系统自动执行' : '人工操作' }}
          </div>
          <div class="mt-4px text-xs text-[var(--el-text-color-secondary)]">{{ formatTime(row.endTime) }}</div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="哪个站点 / 哪个策略" min-width="235">
        <template #default="{ row }">
          <div class="break-words">{{ row.display.site }}</div>
          <div class="mt-4px break-words text-xs text-[var(--el-text-color-secondary)]">{{ row.display.strategy }}</div>
          <div class="mt-4px break-words text-xs text-[var(--el-text-color-secondary)]">
            操作对象：{{ row.display.target }}
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="做了什么 / 本次变化" min-width="390">
        <template #default="{ row }">
          <div class="font-medium">{{ row.display.operation }}</div>
          <template v-if="row.display.targetChanges">
            <p class="mt-4px font-medium leading-6">{{ row.display.targetChanges.summary }}</p>
            <p
              v-for="(detail, index) in row.display.targetChanges.details.slice(0, 2)"
              :key="`target-${index}`"
              class="mt-4px break-words leading-6"
            >
              {{ detail.sentence }}
            </p>
          </template>
          <div
            v-for="(change, index) in row.display.changes.slice(0, 2)"
            :key="index"
            class="mt-4px break-words leading-6"
          >
            {{ change.field }}：
            <span class="text-[var(--el-text-color-secondary)]">{{ change.before }}</span>
            <span class="mx-4px" aria-label="改为">→</span>
            <span>{{ change.after }}</span>
          </div>
          <p
            v-if="!row.display.changes.length && !row.display.targetChanges"
            class="mt-4px text-xs text-[var(--el-text-color-secondary)]"
          >
            {{ row.display.noChanges }}
          </p>
          <ElButton
            link
            type="primary"
            class="mt-4px"
            :aria-label="`查看${row.display.actor}的${row.display.operation}详情`"
            @click="table?.toggleRowExpansion(row)"
          >
            {{ row.changeCount > 2 ? `查看全部 ${row.changeCount} 项改动` : '查看详情' }}
          </ElButton>
        </template>
      </ElTableColumn>
      <ElTableColumn label="执行结果" min-width="210">
        <template #default="{ row }">
          <div class="flex flex-wrap gap-4px">
            <ElTag :type="resultType(row.status)">{{ statusLabel(row.status) }}</ElTag>
            <ElTag size="small" :type="levelType(row.level)">{{ levelLabel(row.level) }}</ElTag>
          </div>
          <p class="mt-8px break-words text-xs text-[var(--el-text-color-secondary)]">{{ row.display.result }}</p>
          <p v-if="row.display.reason" class="mt-4px break-words text-xs">原因：{{ row.display.reason }}</p>
        </template>
      </ElTableColumn>
    </ElTable>

    <div class="mt-16px overflow-x-auto">
      <ElPagination
        v-model:current-page="current"
        v-model:page-size="size"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        class="justify-end lt-sm:justify-start"
        @current-change="load"
        @size-change="search"
      />
    </div>
  </ElCard>
</template>
