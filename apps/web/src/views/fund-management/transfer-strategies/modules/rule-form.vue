<script setup lang="ts">
import { computed } from 'vue';
import type { Payee, TransferStrategyRule } from '@/service/api';
import {
  addAllocation, allocationMode, conditionLabel, metricNames, operatorNames,
  removeAllocation, ruleError, updateAllocationPercentage
} from './workspace-model';
const model = defineModel<TransferStrategyRule>({ required: true });
const props = defineProps<{ payees: Payee[]; readonly?: boolean }>();
const error = computed(() => ruleError(model.value, props.payees));
const percentage = computed(() => model.value.allocations.reduce((sum, row) => sum + row.basisPoints, 0) / 100);
function isSelectedPayee(id: string, index: number) {
  return model.value.allocations.some((row, rowIndex) =>
    rowIndex !== index && row.kind === 'PAYEE' && row.targetId === id
  );
}
function changeTargetKind(index: number, kind: 'PAYEE' | 'AUTO') {
  model.value.allocations[index].kind = kind;
  model.value.allocations[index].targetId = '';
}
</script>

<template>
  <ElForm label-position="top" :disabled="readonly" class="transfer-rule-form">
    <div class="rule-identity">
      <ElFormItem label="规则名称" required><ElInput v-model.trim="model.name" maxlength="100" /></ElFormItem>
      <ElFormItem label="规则启用"><ElSwitch v-model="model.enabled" aria-label="规则启用" /></ElFormItem>
    </div>
    <section class="rule-section">
      <div class="section-heading">
        <div>
          <strong>判断条件</strong>
          <p>以下条件全部满足时才执行。可添加同一指标的上下限，形成金额区间。</p>
        </div>
      </div>
      <div v-for="(condition, index) in model.conditions" :key="index" class="condition-card">
        <div class="condition-heading">
          <span>条件 {{ index + 1 }}{{ index ? ' · 且' : '' }}</span>
          <ElButton
            link
            type="danger"
            :disabled="model.conditions.length <= 1"
            :aria-label="`删除条件 ${index + 1}`"
            @click="model.conditions.splice(index, 1)"
            >删除</ElButton
          >
        </div>
        <div class="condition-fields">
          <ElFormItem label="判断指标"
            ><ElSelect v-model="condition.metric"
              ><ElOption v-for="(label, value) in metricNames" :key="value" :label="label" :value="value" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="比较方式"
            ><ElSelect v-model="condition.operator"
              ><ElOption v-for="(label, value) in operatorNames" :key="value" :label="label" :value="value" /></ElSelect
          ></ElFormItem>
          <ElFormItem label="金额阈值（元）"><ElInput v-model="condition.value" inputmode="decimal" /></ElFormItem>
        </div>
      </div>
      <ElButton
        type="primary"
        plain
        class="condition-add"
        :disabled="model.conditions.length >= 20"
        @click="
          model.conditions.push({
            metric: 'PENDING_BALANCE',
            operator: 'LTE',
            value: '0.00'
          })
        "
        >＋ 添加判断条件</ElButton
      >
      <p class="section-note">余额以最近采集为准，未采集的指标不命中；当日已转出金额按上海自然日累计成功转账。</p>
    </section>
    <section class="rule-section">
      <div class="section-heading">
        <strong>执行动作 · 自动转账</strong>
        <span class="section-caption">全部条件满足后执行</span>
      </div>
      <ElFormItem label="本次转账总额上限（元）" required class="amount-field"
        ><ElInput v-model="model.maxAmount" inputmode="decimal"
      /></ElFormItem>
      <div class="condition-heading">
        <span>收款分配</span><ElTag :type="percentage === 100 ? 'success' : 'warning'">合计 {{ percentage }}%</ElTag>
      </div>
      <p class="allocation-note">
        {{ allocationMode(model) === 'EQUAL' ? '增删分配时自动均分，合计保持 100%。' : '比例已手动调整，增删分配保留已有比例，保存前合计须为 100%。' }}
        自动抽取仅使用启用账号，并排除本规则的固定账号和已抽取账号。
      </p>
      <div v-for="(allocation, index) in model.allocations" :key="index" class="allocation-card">
        <div class="allocation-fields">
          <ElFormItem label="收款方式">
            <ElSelect :model-value="allocation.kind" @change="changeTargetKind(index, $event)">
              <ElOption label="固定账号" value="PAYEE" />
              <ElOption label="自动抽取" value="AUTO" />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="收款目标">
            <span v-if="allocation.kind === 'AUTO'" class="automatic-target">执行时随机抽取一个账号</span>
            <ElSelect v-else v-model="allocation.targetId" filterable placeholder="选择收款账号">
              <ElOption
                v-for="payee in payees"
                :key="payee.id"
                :value="payee.id"
                :label="payee.name + ' ' + payee.accountMasked"
                :disabled="payee.status !== 'ACTIVE' || isSelectedPayee(payee.id, index)"
              /> </ElSelect
          ></ElFormItem>
          <ElFormItem label="比例（%）"
            ><ElInputNumber
              :model-value="allocation.basisPoints / 100"
              :precision="2"
              :min="0"
              :max="100"
              :controls="false"
              @update:model-value="updateAllocationPercentage(model, index, $event)"
          /></ElFormItem>
        </div>
        <ElButton link type="danger" :aria-label="`删除分配 ${index + 1}`" @click="removeAllocation(model, index)"
          >删除分配</ElButton
        >
      </div>
      <ElButton
        type="primary"
        plain
        class="condition-add"
        :disabled="model.allocations.length >= 20"
        @click="addAllocation(model)"
        >＋ 添加收款分配</ElButton
      >
      <p class="section-note">
        本次金额受余额、保留金额和每日限额约束；任一账号额度不足则本次不执行，不改用后续规则。
      </p>
    </section>
    <section class="rule-preview">
      <strong>规则预览</strong>
      <p class="preview-expression">{{ model.conditions.map(conditionLabel).join(' 且 ') }}</p>
      <ElAlert v-if="error" :title="error" type="warning" :closable="false" />
      <p v-else class="preview-action">
        满足以上全部条件 → 自动转账，总额上限 {{ model.maxAmount }} 元，按比例分配至 {{ model.allocations.length }} 个收款目标
      </p>
    </section>
  </ElForm>
</template>

<style scoped>
.transfer-rule-form {
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.rule-identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
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
.section-note {
  margin: 12px 0 0;
}
.condition-card,
.allocation-card {
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
}
.condition-heading {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 10px;
}
.condition-card + .condition-card,
.allocation-card + .allocation-card {
  margin-top: 12px;
}
.condition-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 12px;
}
.condition-add {
  width: 100%;
  margin-top: 12px;
  border-style: dashed;
}
.allocation-fields {
  display: grid;
  grid-template-columns: 130px minmax(0, 1fr) 110px;
  gap: 12px;
  margin-bottom: 10px;
}
.allocation-note {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.7;
}
.automatic-target {
  color: var(--el-text-color-secondary);
  font-size: 12px;
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
:deep(.el-form-item__content) {
  min-width: 0;
}
.transfer-rule-form :deep(.amount-field) {
  margin-bottom: 14px;
}
.transfer-rule-form :deep(.el-input-number),
.transfer-rule-form :deep(.el-select) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.transfer-rule-form :deep(.el-input-number.is-without-controls .el-input__wrapper) {
  padding-inline: 12px;
}
@container (max-width: 560px) {
  .allocation-fields {
    grid-template-columns: minmax(0, 1fr) 110px;
  }
  .allocation-fields > :first-child {
    grid-column: 1 / -1;
  }
  .condition-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .condition-fields > :last-child {
    grid-column: 1 / -1;
  }
}
@container (max-width: 360px) {
  .condition-fields,
  .allocation-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
