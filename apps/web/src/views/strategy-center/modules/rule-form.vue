<script setup lang="ts">
import { computed, ref } from 'vue';
import type { TemplateCondition, TemplateRule } from '@/service/api';
import {
  actionLabel,
  conditionLabel,
  maxRuleConditions,
  metricNames,
  ruleConditionError,
  ruleConditions
} from './workspace-model';
const model = defineModel<TemplateRule>({ required: true });
const props = defineProps<{ minWeight: number; maxWeight: number }>();
const showSwitchbackExample = ref(false);
const actionChoice = computed({
  get: () => {
    if (['ADD_POLLING_MEMBER', 'REMOVE_POLLING_MEMBER', 'REMOVE_REPLACEMENT_MEMBER'].includes(model.value.action.type))
      return 'POLLING_MEMBERS';
    return model.value.action.type;
  },
  set: (value: string) => {
    if (value === model.value.action.type) return;
    if (
      value === 'POLLING_MEMBERS' &&
      ['ADD_POLLING_MEMBER', 'REMOVE_POLLING_MEMBER', 'REMOVE_REPLACEMENT_MEMBER'].includes(model.value.action.type)
    )
      return;
    if (value === 'POLLING_MEMBERS') model.value.action = { type: 'ADD_POLLING_MEMBER', value: props.maxWeight };
    if (value === 'SET_CHANNEL_STATUS') model.value.action = { type: 'SET_CHANNEL_STATUS', value: 0 };
    if (value === 'SET_MEMBER_WEIGHT') model.value.action = { type: 'SET_MEMBER_WEIGHT', value: props.minWeight };
    if (value === 'ADJUST_MEMBER_WEIGHT') model.value.action = { type: 'ADJUST_MEMBER_WEIGHT', value: -10 };
  }
});
const memberOperation = computed({
  get: () => model.value.action.type,
  set: (type: string) => {
    if (type === model.value.action.type) return;
    if (type === 'ADD_POLLING_MEMBER') model.value.action = { type, value: props.maxWeight };
    if (type === 'REMOVE_POLLING_MEMBER') model.value.action = { type, value: 0 };
    if (type === 'REMOVE_REPLACEMENT_MEMBER') model.value.action = { type, value: 0 };
  }
});
const channelStatus = computed({
  get: () => model.value.action.value,
  set: (value: number) => {
    model.value.action = { type: 'SET_CHANNEL_STATUS', value };
  }
});
const operators = { LT: '低于 <', LTE: '低于或等于 ≤', GT: '高于 >', GTE: '高于或等于 ≥', EQ: '等于 =' };
const conditions = computed(() => ruleConditions(model.value));
const conditionError = computed(() => ruleConditionError(model.value));
const hasChannelCount = computed(() => conditions.value.some(condition => condition.metric === 'CHANNEL_COUNT'));
const hasOrderCondition = computed(() => conditions.value.some(condition => condition.metric !== 'CHANNEL_COUNT'));
function isCountMetric(condition: TemplateCondition) {
  return ['ORDER_COUNT', 'CHANNEL_COUNT'].includes(condition.metric);
}
function thresholdLabel(condition: TemplateCondition) {
  return isCountMetric(condition) ? '数量阈值' : '比例阈值（%）';
}
function changeMetric(condition: TemplateCondition) {
  if (condition.metric === 'CHANNEL_COUNT') condition.value = 3;
  else condition.value = condition.metric === 'ORDER_COUNT' ? 30 : 0.7;
}
function setThreshold(condition: TemplateCondition, value: number | undefined) {
  condition.value = (value ?? 0) / (isCountMetric(condition) ? 1 : 100);
}
function addCondition() {
  if (conditions.value.length >= maxRuleConditions) return;
  const used = new Set(conditions.value.map(condition => condition.metric));
  const metrics: TemplateCondition['metric'][] = ['ORDER_COUNT', 'CHANNEL_COUNT', 'SUCCESS_RATE', 'FAILURE_RATE'];
  const metric = metrics.find(value => !used.has(value)) ?? 'SUCCESS_RATE';
  const condition: TemplateCondition = { metric, operator: metric === 'ORDER_COUNT' ? 'GTE' : 'LT', value: 0 };
  changeMetric(condition);
  (model.value.conditions ??= []).push(condition);
}
function removeCondition(index: number) {
  if (conditions.value.length <= 1) return;
  if (index === 0) {
    const next = model.value.conditions!.shift()!;
    Object.assign(model.value, { metric: next.metric, operator: next.operator, value: next.value });
  } else model.value.conditions!.splice(index - 1, 1);
  if (!model.value.conditions?.length) delete model.value.conditions;
}
</script>

<template>
  <ElForm label-position="top" class="rule-form">
    <section class="rule-section">
      <div class="section-heading">
        <div>
          <strong>判断条件</strong>
          <p>以下条件全部满足时，才执行动作。</p>
        </div>
      </div>
      <div class="condition-list">
        <template v-for="(condition, index) in conditions" :key="index">
          <div class="condition-card">
            <div class="condition-heading">
              <span>条件 {{ index + 1 }}</span>
              <ElButton
                type="danger"
                link
                size="small"
                :disabled="conditions.length <= 1"
                :aria-label="`删除条件 ${index + 1}`"
                @click="removeCondition(index)"
              >
                删除
              </ElButton>
            </div>
            <div class="condition-fields">
              <ElFormItem label="判断指标">
                <ElSelect v-model="condition.metric" @change="changeMetric(condition)">
                  <ElOption v-for="(label, value) in metricNames" :key="value" :label="label" :value="value" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem label="比较方式">
                <ElSelect v-model="condition.operator">
                  <ElOption v-for="(label, value) in operators" :key="value" :label="label" :value="value" />
                </ElSelect>
              </ElFormItem>
              <ElFormItem :label="thresholdLabel(condition)">
                <ElInputNumber
                  :model-value="isCountMetric(condition) ? condition.value : condition.value * 100"
                  :min="0"
                  :max="isCountMetric(condition) ? 10000000 : 100"
                  :precision="isCountMetric(condition) ? 0 : 2"
                  controls-position="right"
                  @update:model-value="value => setThreshold(condition, value)"
                />
              </ElFormItem>
            </div>
          </div>
        </template>
        <ElButton
          type="primary"
          plain
          class="condition-add"
          :disabled="conditions.length >= maxRuleConditions"
          @click="addCondition"
        >
          ＋ 添加判断条件
        </ElButton>
      </div>
      <p v-if="hasChannelCount" class="section-note">
        通道数量统计当前轮询组的全部成员，包含已停止或权重为 0 的通道。
        {{
          hasOrderCondition
            ? '本规则包含订单指标，仍需满足统计窗口和最低样本要求。'
            : '本规则不受订单统计窗口和最低样本限制。'
        }}
      </p>
      <ElAlert v-if="conditionError" :title="conditionError" type="error" :closable="false" class="condition-error" />
    </section>

    <section class="rule-section">
      <div class="section-heading">
        <strong>执行动作</strong>
        <span class="section-caption">全部条件满足后执行</span>
      </div>
      <div
        class="action-row"
        :class="model.action.type === 'ADD_POLLING_MEMBER' ? 'action-row--three' : 'action-row--two'"
      >
        <ElFormItem label="动作类型" class="action-field action-type">
          <ElSelect v-model="actionChoice">
            <ElOption label="设置指定权重" value="SET_MEMBER_WEIGHT" />
            <ElOption label="增加 / 减少权重" value="ADJUST_MEMBER_WEIGHT" />
            <ElOption label="移除 / 添加通道" value="POLLING_MEMBERS" />
            <ElOption label="启动 / 停止通道（影响全局，慎用）" value="SET_CHANNEL_STATUS" />
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-if="actionChoice === 'POLLING_MEMBERS'" label="通道操作" class="action-field">
          <ElRadioGroup v-model="memberOperation">
            <ElRadio value="ADD_POLLING_MEMBER">添加</ElRadio>
            <ElRadio value="REMOVE_POLLING_MEMBER">移除</ElRadio>
            <ElRadio value="REMOVE_REPLACEMENT_MEMBER">回切</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem v-if="actionChoice === 'SET_CHANNEL_STATUS'" label="全局通道状态" class="action-field">
          <ElRadioGroup v-model="channelStatus">
            <ElRadio :value="1">启动</ElRadio>
            <ElRadio :value="0">停止</ElRadio>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem
          v-if="!['SET_CHANNEL_STATUS', 'REMOVE_POLLING_MEMBER', 'REMOVE_REPLACEMENT_MEMBER'].includes(model.action.type)"
          class="action-field action-value"
          :label="
            model.action.type === 'SET_MEMBER_WEIGHT'
              ? '指定权重'
              : model.action.type === 'ADD_POLLING_MEMBER'
                ? '初始权重（每次添加 1 个）'
                : '变化值（负数降低，正数增加）'
          "
        >
          <ElInputNumber
            v-model="model.action.value"
            :min="model.action.type === 'ADJUST_MEMBER_WEIGHT' ? -100 : minWeight"
            :max="model.action.type === 'ADJUST_MEMBER_WEIGHT' ? 100 : maxWeight"
            :precision="0"
            controls-position="right"
          />
        </ElFormItem>
      </div>
      <ElAlert
        v-if="model.action.type === 'ADD_POLLING_MEMBER'"
        title="向当前轮询组补入 1 个备用通道。暂无成功率优先，其次成功率从高到低；仅选同站点、同支付方式且已启用的通道。"
        type="info"
        :closable="false"
      />
      <ElAlert
        v-else-if="model.action.type === 'REMOVE_REPLACEMENT_MEMBER'"
        title="回切：移出此前为当前通道补入、且仍在轮询组中的备用通道，不停止全局通道；至少保留一个成员。回切阈值请与补入阈值留出间隔，否则可能反复补入、移出。"
        type="warning"
        :closable="false"
      >
        <ElButton
          type="primary"
          link
          :aria-expanded="showSwitchbackExample"
          @click="showSwitchbackExample = !showSwitchbackExample"
        >
          {{ showSwitchbackExample ? '收起示例' : '查看示例' }}
        </ElButton>
        <span v-if="showSwitchbackExample" class="block">
          假设轮询组里只有 A，B 是备用通道。设两条规则：A 的成功率低于 80% 时补入 B，达到 90% 时回切。
          <span class="block">① A 降到 78%，B 加入，A 和 B 一起接单。</span>
          <span class="block">② A 回升到 85%，B 继续留在组里。</span>
          <span class="block">③ A 回升到 92%，B 退出这个组，A 继续接单。B 在其他组仍可使用。</span>
          <span class="block">④ A 再降到 85%，组里仍只有 A。两个阈值之间的波动不会触发补入或回切。</span>
        </span>
      </ElAlert>
      <ElAlert
        v-else-if="model.action.type === 'REMOVE_POLLING_MEMBER'"
        title="仅移出当前轮询组，不停止全局通道，也不会立即补入备用通道；至少保留一个成员。"
        type="info"
        :closable="false"
      />
      <ElAlert
        v-else-if="model.action.type === 'SET_CHANNEL_STATUS'"
        title="此操作影响通道的全局状态，所有使用此通道的轮询组均会受影响，请慎用。"
        type="error"
        :closable="false"
      />
    </section>

    <section class="rule-preview">
      <strong>规则预览</strong>
      <p class="preview-expression">{{ conditionLabel(model) }}</p>
      <p class="preview-action">满足以上全部条件 → {{ actionLabel(model) }}</p>
    </section>
  </ElForm>
</template>

<style scoped>
.rule-form {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rule-section {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
}
.section-heading,
.condition-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.section-heading {
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.section-heading strong,
.rule-preview strong {
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.section-heading p,
.section-caption,
.section-note {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.section-heading p {
  margin: 4px 0 0;
}
.condition-card {
  padding: 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.condition-heading {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 10px;
}
.condition-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 12px;
}
.condition-card + .condition-card {
  margin-top: 12px;
}
.condition-add {
  width: 100%;
  margin-top: 12px;
  border-style: dashed;
}
.action-row {
  display: grid;
  gap: 12px;
  margin-bottom: 14px;
}
.action-row--two {
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
}
.action-row--three {
  grid-template-columns: minmax(0, 1.3fr) minmax(130px, 0.8fr) minmax(160px, 0.85fr);
}
.action-type {
  grid-column: auto;
}
.action-field {
  align-self: end;
}
.action-field :deep(.el-form-item__label) {
  padding-bottom: 6px;
}
.action-value {
  min-width: 140px;
}
.section-note {
  margin: 12px 0 0;
}
.condition-error {
  margin-top: 12px;
}
.rule-preview {
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  line-height: 1.8;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.preview-expression {
  margin: 8px 0 4px;
  color: var(--el-text-color-regular);
}
.preview-action {
  margin: 0;
  color: var(--el-color-primary);
}
:deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 0;
}
:deep(.el-input-number),
:deep(.el-select) {
  width: 100%;
}
@container (max-width: 560px) {
  .condition-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .condition-fields > :last-child {
    grid-column: 1 / -1;
  }
}
@container (max-width: 360px) {
  .condition-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
@container (max-width: 620px) {
  .action-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
