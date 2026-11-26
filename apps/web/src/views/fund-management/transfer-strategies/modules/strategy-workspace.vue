<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import {
  createTransferRule,
  fetchAllPayees,
  fetchAllTransferRules,
  updateTransferRule
} from '@/service/api';
import type { Payee, TransferRule, TransferStrategyRule } from '@/service/api';
import { useAuth } from '@/hooks/business/auth';
import EpayStatusSwitch from '@/components/custom/epay-status-switch.vue';
import TreeContextMenu from '@/views/strategy-center/modules/tree-context-menu.vue';
import type { MenuItem } from '@/views/strategy-center/modules/tree-context-menu.vue';
import RuleForm from './rule-form.vue';
import EditableGroupLabel from '@/views/strategy-center/modules/editable-group-label.vue';
import {
  asDraft,
  clone,
  conditionLabel,
  defaultRule,
  defaultStrategy,
  ruleError,
  strategyError,
  toInput
} from './workspace-model';

interface TreeNode {
  id: string;
  label: string;
  kind: 'payee' | 'rule' | 'condition' | 'action' | 'constraints';
  index?: number;
  enabled?: boolean;
  children?: TreeNode[];
}
const props = defineProps<{ strategyId: string }>();
const emit = defineEmits<{ back: []; saved: [id: string]; createTemplate: [] }>();
const { hasAuth } = useAuth();
const payees = ref<Payee[]>([]);
const strategies = ref<TransferRule[]>([]);
const selectedId = ref('');
const loading = ref(false);
const saving = ref(false);
const form = ref(defaultStrategy());
const saved = ref(JSON.stringify(form.value));
const dirty = computed(() => JSON.stringify(form.value) !== saved.value);
const objectSearch = ref('');
const templateSearch = ref('');
const selectedObject = ref('');
const previewId = ref('');
const menu = ref<InstanceType<typeof TreeContextMenu>>();
const templates = computed(() =>
  strategies.value.filter(
    rule => rule.isTemplate && rule.name.toLowerCase().includes(templateSearch.value.toLowerCase())
  )
);
const preview = computed(() => strategies.value.find(rule => rule.id === previewId.value));
const displayed = computed(() => (preview.value ? asDraft(preview.value) : form.value));
const canSave = computed(() => hasAuth(selectedId.value ? 'transfer-rule:update' : 'transfer-rule:create'));
const editable = computed(() => canSave.value && !saving.value && !preview.value);
const payeeNode = (payee: Payee): TreeNode => ({
  id: `payee:${payee.id}`,
  kind: 'payee',
  label: `${payee.name} · ${payee.accountMasked}`,
  enabled: payee.status === 'ACTIVE'
});
const objectNodes = computed<TreeNode[]>(() => {
  const keyword = objectSearch.value.trim().toLowerCase();
  return payees.value
    .filter(payee => !keyword || `${payee.name} ${payee.accountMasked}`.toLowerCase().includes(keyword))
    .map(payeeNode);
});
const activePayee = computed(() => payees.value.find(row => `payee:${row.id}` === selectedObject.value));
function allocationLabel(row: TransferStrategyRule['allocations'][number]) {
  if (row.kind === 'AUTO') return `自动抽取收款账号 · ${row.basisPoints / 100}%`;
  const legacyPool = row.kind === 'POOL';
  const target = legacyPool ? '需重新选择收款账号' : payees.value.find(payee => payee.id === row.targetId)?.name;
  return `${legacyPool ? '历史配置' : '收款账号'}：${target || '未选择 / 已失效'} · ${row.basisPoints / 100}%`;
}
const strategyNodes = computed<TreeNode[]>(() => [
  ...displayed.value.rules.map(
    (rule, index): TreeNode => ({
      id: `rule:${index}`,
      kind: 'rule',
      index,
      label: `${index + 1}. ${rule.name}`,
      enabled: rule.enabled,
      children: [
        ...rule.conditions.map(
          (condition, ci): TreeNode => ({
            id: `condition:${index}:${ci}`,
            kind: 'condition',
            index,
            label: `${ci ? '且 ' : ''}${conditionLabel(condition)}`
          })
        ),
        {
          id: `action:${index}`,
          kind: 'action',
          index,
          label: `自动转账 · 本次总额上限 ${rule.maxAmount} 元`,
          children: rule.allocations.map(
            (row, ai): TreeNode => ({
              id: `allocation:${index}:${ai}`,
              kind: 'action',
              index,
              label: allocationLabel(row)
            })
          )
        }
      ]
    })
  ),
  {
    id: 'constraints',
    kind: 'constraints',
    label: '执行约束与通知',
    children: [
      {
        id: 'reserve',
        kind: 'constraints',
        label: `保留 ${displayed.value.reserveAmount} 元 · 手续费预留 ${displayed.value.feeBuffer} 元`
      },
      {
        id: 'limits',
        kind: 'constraints',
        label: `最小 ${displayed.value.minAmount} 元 · 每日限额 ${displayed.value.dailyLimit || '不限'}`
      }
    ]
  }
]);
let sequence = 0;
async function load() {
  const current = ++sequence;
  loading.value = true;
  try {
    const [payeeResult, ruleResult] = await Promise.all([fetchAllPayees(), fetchAllTransferRules()]);
    if (
      current !== sequence ||
      payeeResult.error ||
      ruleResult.error ||
      !payeeResult.data ||
      !ruleResult.data
    )
      return;
    payees.value = payeeResult.data;
    strategies.value = ruleResult.data;
    return true;
  } finally {
    if (current === sequence) loading.value = false;
  }
}
async function allowDiscard() {
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm('当前修改尚未保存，是否放弃修改？', '未保存修改', {
      type: 'warning',
      confirmButtonText: '放弃修改',
      cancelButtonText: '继续编辑'
    });
    return true;
  } catch {
    return false;
  }
}
const canLeave = async () => !saving.value && (await allowDiscard());
onBeforeRouteLeave(canLeave);
onBeforeRouteUpdate(canLeave);
async function selectStrategy(id = '', isTemplate = false) {
  if (saving.value || !(await allowDiscard())) return;
  const row = strategies.value.find(item => item.id === id);
  selectedId.value = row?.id || '';
  previewId.value = '';
  form.value = row ? asDraft(row) : { ...defaultStrategy(), isTemplate };
  saved.value = JSON.stringify(form.value);
}
async function saveStrategy() {
  if (!editable.value) return;
  const error = strategyError(form.value, payees.value);
  if (error) {
    window.$message?.warning(error);
    return;
  }
  let savedId = '';
  saving.value = true;
  try {
    const input = toInput(form.value);
    const result = selectedId.value
      ? await updateTransferRule(selectedId.value, input)
      : await createTransferRule(input);
    if (!result.error) {
      savedId = result.data.id;
      selectedId.value = result.data.id;
      form.value = asDraft(result.data);
      saved.value = JSON.stringify(form.value);
      await load();
      window.$message?.success(form.value.isTemplate ? '模板已保存' : '策略已保存，下次触发时使用新配置');
    }
  } finally {
    saving.value = false;
  }
  if (savedId) emit('saved', savedId);
}
function applyTemplate() {
  if (!preview.value || !canSave.value || saving.value) return;
  const template = asDraft(preview.value);
  form.value = {
    ...form.value,
    name: form.value.name || template.name + ' 副本',
    rules: clone(template.rules),
    reserveAmount: template.reserveAmount,
    feeBuffer: template.feeBuffer,
    minAmount: template.minAmount,
    dailyLimit: template.dailyLimit
  };
  previewId.value = '';
}
async function saveAsTemplate() {
  if (!hasAuth('transfer-rule:create') || saving.value) return;
  const copy = clone(form.value);
  selectedId.value = '';
  previewId.value = '';
  form.value = { ...copy, name: copy.name + ' 模板', isTemplate: true };
  saved.value = '';
}
function resetDraft() {
  form.value = saved.value ? JSON.parse(saved.value) : defaultStrategy();
  previewId.value = '';
}
const ruleDialog = ref(false);
const ruleIndex = ref(-1);
const ruleDraft = ref(defaultRule());
const ruleReadonly = ref(false);
function editRule(index = -1) {
  if (index < 0 && (!editable.value || form.value.rules.length >= 20)) return;
  ruleIndex.value = index;
  ruleReadonly.value = !editable.value;
  ruleDraft.value = index < 0 ? defaultRule() : clone(displayed.value.rules[index]);
  ruleDialog.value = true;
}
function confirmRule() {
  const error = ruleError(ruleDraft.value, payees.value);
  if (error) {
    window.$message?.warning(error);
    return;
  }
  if (!editable.value) return;
  if (ruleIndex.value < 0) form.value.rules.push(clone(ruleDraft.value));
  else form.value.rules[ruleIndex.value] = clone(ruleDraft.value);
  ruleDialog.value = false;
}
function moveRule(index: number, offset: number) {
  if (!editable.value) return;
  const [rule] = form.value.rules.splice(index, 1);
  form.value.rules.splice(index + offset, 0, rule);
}
function strategyMenu(event: MouseEvent, node?: TreeNode) {
  const index = node?.index;
  const items: MenuItem[] = [
    {
      label: '新增规则',
      disabled: !editable.value || form.value.rules.length >= 20,
      run: () => editRule()
    }
  ];
  if (index !== undefined)
    items.unshift(
      {
        label: editable.value ? '编辑规则条件与动作' : '查看规则',
        run: () => editRule(index)
      },
      {
        label: '复制规则',
        disabled: !editable.value || form.value.rules.length >= 20,
        run: () => {
          const copy = clone(form.value.rules[index]);
          copy.name += ' 副本';
          form.value.rules.splice(index + 1, 0, copy);
          editRule(index + 1);
        }
      },
      {
        label: '上移规则',
        disabled: !editable.value || index === 0,
        run: () => moveRule(index, -1)
      },
      {
        label: '下移规则',
        disabled: !editable.value || index === form.value.rules.length - 1,
        run: () => moveRule(index, 1)
      },
      {
        label: displayed.value.rules[index].enabled ? '停用规则' : '启用规则',
        disabled: !editable.value,
        run: () => {
          form.value.rules[index].enabled = !form.value.rules[index].enabled;
        }
      },
      {
        label: '删除规则',
        danger: true,
        disabled: !editable.value || form.value.rules.length <= 1,
        run: () => {
          form.value.rules.splice(index, 1);
        }
      }
    );
  items.push({ label: '执行约束与通知', run: openConstraints });
  menu.value?.open(event, items);
}
function openNode(node: TreeNode) {
  if (node.index !== undefined) editRule(node.index);
  else openConstraints();
}
const constraintsDialog = ref(false);
const constraintsDraft = ref(defaultStrategy());
function openConstraints() {
  constraintsDraft.value = clone(displayed.value);
  constraintsDialog.value = true;
}
function confirmConstraints() {
  if (!editable.value) return;
  const { reserveAmount, feeBuffer, minAmount, dailyLimit } = constraintsDraft.value;
  Object.assign(form.value, {
    reserveAmount,
    feeBuffer,
    minAmount,
    dailyLimit
  });
  constraintsDialog.value = false;
}
onMounted(async () => {
  if (!(await load())) return;
  if (strategies.value.some(rule => rule.id === props.strategyId)) {
    await selectStrategy(props.strategyId);
  } else {
    window.$message?.warning('转账策略不存在，请从列表重新选择');
    emit('back');
  }
});
</script>

<template>
  <div v-loading="loading" class="transfer-workspace">
    <section class="strategy-heading epay-page-heading epay-page-intro" aria-label="转账策略概览">
      <div class="workspace-toolbar">
        <div class="strategy-overview">
          <div class="epay-page-heading-main">
            <span class="epay-page-heading-icon" aria-hidden="true"><SvgIcon icon="tabler:arrows-split" /></span>
            <div class="strategy-identity">
              <div class="strategy-eyebrow">
                <span>{{ form.isTemplate ? '转账模板配置' : '转账策略配置' }}</span>
                <ElTag v-if="dirty" type="warning" size="small" effect="plain">未保存修改</ElTag>
              </div>
              <div class="identity-labels" :class="{ 'identity-readonly': !editable }" :inert="!editable">
                <h1><EditableGroupLabel v-model="form.name" required :max-length="100" placeholder="策略名称" /></h1>
                <EditableGroupLabel v-model="form.description" class="identity-description" :max-length="500" />
              </div>
            </div>
          </div>
          <div class="strategy-status">
            <div class="strategy-status-copy">
              <span>{{ form.isTemplate ? '配置类型' : '策略启用' }}</span>
              <strong>{{ form.isTemplate ? '策略模板' : form.enabled ? '启用' : '停用' }}</strong>
            </div>
            <span v-if="form.isTemplate" class="status-note">模板不直接执行</span>
            <EpayStatusSwitch
              v-else
              :checked="form.enabled"
              :label="form.enabled ? '停用策略' : '启用策略'"
              :loading="saving"
              :disabled="!editable"
              @change="form.enabled = $event"
            />
          </div>
        </div>
      </div>
    </section>
    <ElCard class="workspace-card" shadow="never">
      <div class="workspace-columns">
        <section class="tree-panel object-panel">
          <div class="panel-heading">
            <div>
              <strong>收款列表</strong><span class="panel-count">{{ payees.length }} 个账号</span>
            </div>
          </div>
          <div class="panel-search">
            <ElInput v-model="objectSearch" clearable placeholder="搜索姓名、账号" aria-label="搜索收款账号" />
          </div>
          <div class="panel-hint">规则动作直接选择账号；状态与额度在收款列表维护。</div>
          <div class="tree-scroll">
            <ElTree
              :data="objectNodes"
              node-key="id"
              highlight-current
              default-expand-all
              :expand-on-click-node="false"
              :current-node-key="selectedObject"
              @node-click="selectedObject = $event.id"
            >
              <template #default="{ data }"
                ><div class="tree-row">
                  <SvgIcon icon="mdi:account-outline" class="shrink-0" />
                  <span class="node-label" :title="data.label">{{ data.label }}</span>
                  <ElTag v-if="data.enabled === false" type="info" size="small">停用</ElTag>
                </div></template
              >
            </ElTree>
          </div>
          <div v-if="activePayee" class="object-detail">
            <strong>{{ activePayee.name }}</strong>
            <p>{{ activePayee.accountMasked }}</p>
            <p>每日限额：{{ activePayee.dailyLimit ?? '不限' }}</p>
            <p>累计限额：{{ activePayee.totalLimit ?? '不限' }}</p>
          </div>
        </section>
        <section class="tree-panel strategy-panel" @contextmenu.prevent="strategyMenu($event)">
          <div class="panel-heading">
            <div>
              <strong>策略与规则</strong><span class="panel-count">{{ displayed.rules.length }} 条规则</span>
            </div>
            <div class="panel-heading-actions">
              <ElTag v-if="preview" type="warning" size="small">模板预览</ElTag>
              <ElButton
                v-if="hasAuth('transfer-rule:create')"
                size="small"
                :disabled="saving || !!preview"
                @click="saveAsTemplate"
              >
                另存为模板
              </ElButton>
            </div>
          </div>
          <div v-if="preview" class="preview-banner">
            <strong>预览模板：{{ preview.name }}</strong>
            <p>当前编辑内容保持不变，应用并保存后生效。</p>
            <div class="summary-actions">
              <ElButton size="small" type="primary" :disabled="!canSave || saving" @click="applyTemplate">应用模板</ElButton>
              <ElButton size="small" @click="previewId = ''">返回当前策略</ElButton>
            </div>
          </div>
          <div v-else class="panel-hint">
            按顺序判断，只执行首条命中规则。规则内条件全部满足；双击或点击 ⋯ 编辑、复制、排序。
          </div>
          <div class="tree-scroll">
            <ElTree
              :key="previewId || 'draft'"
              :data="strategyNodes"
              node-key="id"
              highlight-current
              default-expand-all
              :expand-on-click-node="false"
              @node-contextmenu="(event: Event, node: TreeNode) => strategyMenu(event as MouseEvent, node)"
            >
              <template #default="{ data }"
                ><div class="tree-row" @dblclick.stop="openNode(data)">
                  <SvgIcon
                    :icon="
                      data.kind === 'rule'
                        ? 'mdi:source-branch'
                        : data.kind === 'constraints'
                          ? 'mdi:cog-outline'
                          : data.kind === 'condition'
                            ? 'mdi:filter-outline'
                            : 'mdi:arrow-right'
                    "
                    class="shrink-0"
                  />
                  <span class="node-label" :title="data.label">{{ data.label }}</span>
                  <ElTag v-if="data.enabled === false" size="small" type="info">停用</ElTag>
                  <button
                    type="button"
                    class="node-more"
                    :aria-label="`${data.label} 操作`"
                    @click.stop="strategyMenu($event, data)"
                  >
                    ⋯
                  </button>
                </div></template
              >
            </ElTree>
          </div>
          <div class="panel-hint">本次任务金额和分配在触发时固定；策略修改从下次触发生效。失败分笔不补转。</div>
        </section>
        <section class="tree-panel template-panel">
          <div class="panel-heading">
            <div>
              <strong>策略模板</strong>
              <span class="panel-count">{{ templates.length }} 个</span>
            </div>
            <ElButton
              v-if="hasAuth('transfer-rule:create')"
              size="small"
              :disabled="saving"
              @click="emit('createTemplate')"
            >
              新增模板
            </ElButton>
          </div>
          <div class="panel-search">
            <ElInput v-model="templateSearch" clearable placeholder="搜索模板" aria-label="搜索策略模板" />
          </div>
          <div class="panel-hint">点击模板在中栏预览；应用后可继续编辑。修改模板不会改变已有策略。</div>
          <div class="tree-scroll template-list">
            <div
              v-for="template in templates"
              :key="template.id"
              class="template-card"
              :class="{ selected: previewId === template.id }"
              tabindex="0"
              role="button"
              :aria-pressed="previewId === template.id"
              @click="previewId = template.id"
              @keydown.enter.self.prevent="previewId = template.id"
              @keydown.space.self.prevent="previewId = template.id"
            >
              <div class="template-title">
                <strong>{{ template.name }}</strong>
                <ElButton link size="small" :disabled="saving" @click.stop="selectStrategy(template.id)">编辑</ElButton>
              </div>
              <p v-if="template.description" class="template-description">{{ template.description }}</p>
              <div class="template-constraints">
                {{ template.rules?.length ?? 1 }} 条规则 · 保留 {{ template.reserveAmount }} 元
              </div>
            </div>
            <ElEmpty v-if="!templates.length" :image-size="70" description="暂无模板，可新增或将当前配置另存为模板" />
          </div>
        </section>
      </div>
      <div class="workspace-footer">
        <div>
          <span v-if="dirty" class="draft-mark">有未保存修改</span>
          <span v-else>{{ selectedId ? '配置已保存' : '新建配置' }}</span>
          <span class="footer-note">保存后从下一次触发生效。</span>
        </div>
        <div class="footer-buttons">
          <ElButton :disabled="!dirty || saving" @click="resetDraft">撤销修改</ElButton
          ><ElButton
            type="primary"
            :disabled="!editable || (!dirty && !!selectedId)"
            :loading="saving"
            @click="saveStrategy"
            >保存{{ form.isTemplate ? '模板' : '策略' }}</ElButton
          >
        </div>
      </div>
    </ElCard>
    <TreeContextMenu ref="menu" />
    <ElDialog
      v-model="ruleDialog"
      :title="ruleReadonly ? '查看规则' : ruleIndex < 0 ? '新增规则' : '编辑规则'"
      width="min(840px, 95vw)"
      top="5vh"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div class="rule-editor-body">
        <RuleForm v-model="ruleDraft" :payees="payees" :readonly="ruleReadonly" />
      </div>
      <template #footer
        ><ElButton @click="ruleDialog = false">{{ ruleReadonly ? '关闭' : '取消' }}</ElButton
        ><ElButton v-if="!ruleReadonly" type="primary" @click="confirmRule"
          >确定</ElButton
        ></template
      >
    </ElDialog>
    <ElDialog v-model="constraintsDialog" title="执行约束与通知" width="min(520px, 95vw)" :close-on-click-modal="false">
      <ElForm label-position="top" :disabled="!editable">
        <ElFormItem label="保留余额（元）"
          ><ElInput v-model="constraintsDraft.reserveAmount" inputmode="decimal"
        /></ElFormItem>
        <ElFormItem label="手续费预留（元）"
          ><ElInput v-model="constraintsDraft.feeBuffer" inputmode="decimal"
        /></ElFormItem>
        <ElFormItem label="每次最小转账金额（元）"
          ><ElInput v-model="constraintsDraft.minAmount" inputmode="decimal"
        /></ElFormItem>
        <ElFormItem label="每个环境每日转出限额（元）"
          ><ElInput v-model="constraintsDraft.dailyLimit" clearable placeholder="留空不限" inputmode="decimal"
        /></ElFormItem>
        <p class="text-muted text-12px">在 Telegram 设置 → 通知发送设置中选择转账结果和扫码二维码的接收群。接收群的业务范围需包含付款环境。</p>
      </ElForm>
      <template #footer
        ><ElButton @click="constraintsDialog = false">取消</ElButton
        ><ElButton v-if="editable" type="primary" @click="confirmConstraints">确定</ElButton></template
      >
    </ElDialog>
  </div>
</template>

<style scoped>
.transfer-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  container: transfer-workspace / inline-size;
}
.workspace-card {
  min-width: 0;
  border-radius: 12px;
}
.workspace-card :deep(.el-card__body) {
  padding: 0;
}
.workspace-footer,
.panel-heading,
.template-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.workspace-toolbar {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.strategy-heading {
  flex-shrink: 0;
  min-width: 0;
}
.strategy-overview {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.strategy-identity {
  display: flex;
  flex: 1 1 240px;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}
.strategy-eyebrow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.workspace-toolbar h1 {
  max-width: 100%;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.strategy-identity .identity-description {
  max-width: min(680px, 100%);
  color: var(--el-text-color-secondary);
  font-size: 13px;
  font-weight: normal;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
}
.strategy-status {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 16px;
  padding: 8px 0 8px 24px;
  border-left: 1px solid var(--el-border-color-lighter);
}
.strategy-status-copy {
  display: grid;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.strategy-status-copy strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.identity-labels {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.identity-readonly {
  pointer-events: none;
}
.status-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.panel-heading .panel-heading-actions {
  margin-left: auto;
}
.panel-heading-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.template-title strong,
.template-description {
  overflow-wrap: anywhere;
}
.rule-editor-body {
  max-height: 68vh;
  overflow: auto;
  padding-right: 8px;
}
.preview-banner {
  padding: 12px 14px;
  background: var(--el-color-warning-light-9);
  border-bottom: 1px solid var(--el-color-warning-light-7);
  font-size: 12px;
}
.preview-banner p {
  margin: 8px 0 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}

.workspace-columns {
  display: grid;
  grid-template-columns: minmax(300px, 1.05fr) minmax(340px, 1.4fr) minmax(240px, 0.85fr);
  height: clamp(480px, calc(100dvh - 370px), 760px);
  gap: 16px;
  padding: 16px;
  background: var(--el-fill-color-extra-light);
}
.tree-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}
.panel-heading {
  flex-shrink: 0;
  flex-wrap: wrap;
  min-height: 58px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.panel-heading > div {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.panel-heading strong {
  font-size: 14px;
}
.panel-count {
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.panel-search {
  padding: 12px 16px 0;
}
.panel-hint {
  padding: 12px 16px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.tree-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 8px 12px;
}
:deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 5px;
}
@media (pointer: coarse) {
  :deep(.el-tree-node__content) {
    height: 44px;
  }
}
.tree-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  padding-right: 4px;
}
.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.node-more {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 20px;
  cursor: pointer;
}
.node-more:hover,
.node-more:focus-visible {
  color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}
.object-detail {
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-extra-light);
  padding: 13px;
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.draft-mark {
  color: var(--el-color-warning);
  font-size: 12px;
}
.summary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.summary-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}
.template-list {
  padding: 3px 12px 12px;
}
.template-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 7px;
  padding: 12px;
  margin-bottom: 10px;
  cursor: pointer;
}
.template-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.template-card:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}
.template-card.selected {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.template-title {
  margin-bottom: 8px;
  font-size: 13px;
}
.template-description {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.template-constraints {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.workspace-footer {
  flex-wrap: wrap;
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  font-size: 12px;
  line-height: 1.7;
}
.footer-note {
  display: block;
  margin-top: 4px;
  color: var(--el-text-color-secondary);
}
.footer-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}
.footer-buttons :deep(.el-button + .el-button) {
  margin-left: 0;
}
@container transfer-workspace (max-width: 1050px) {
  .workspace-columns {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr);
    height: auto;
  }
  .tree-scroll {
    min-height: 280px;
    max-height: 440px;
  }
  .template-panel {
    grid-column: 1 / -1;
  }
  .template-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    align-items: start;
    gap: 12px;
    min-height: 120px;
    max-height: 300px;
  }
  .template-card {
    margin-bottom: 0;
  }
  .template-list :deep(.el-empty) {
    grid-column: 1 / -1;
  }
}
@container transfer-workspace (max-width: 640px) {
  .workspace-columns {
    grid-template-columns: minmax(0, 1fr);
    padding: 12px;
    gap: 12px;
  }
  .tree-scroll {
    min-height: 220px;
    max-height: 380px;
  }
  .template-list {
    grid-template-columns: minmax(0, 1fr);
    min-height: 120px;
  }
  .workspace-footer {
    padding: 14px 16px;
  }
  .footer-buttons {
    width: 100%;
  }
  .footer-buttons :deep(.el-button) {
    flex: 1 1 auto;
  }
}
@media (max-width: 640px) {
  .workspace-toolbar {
    gap: 16px;
  }
  .workspace-toolbar h1 {
    font-size: 22px;
  }
  .strategy-status {
    justify-content: space-between;
    width: 100%;
    padding: 12px 0 0;
    border-top: 1px solid var(--el-border-color-lighter);
    border-left: 0;
  }
  .strategy-status-copy {
    display: flex;
    align-items: center;
    gap: 12px;
  }
}
</style>
