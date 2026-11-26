<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { saveStrategyTemplate } from '@/service/api';
import type { TemplateInput } from '@/service/api';
import ConstraintsForm from './constraints-form.vue';
import RuleForm from './rule-form.vue';
import StrategyTemplateDialog from './strategy-template-dialog.vue';
import {
  actionLabel,
  asTemplate,
  conditionLabel,
  defaultConfiguration,
  defaultRule,
  ruleConditionError,
  ruleConditions,
  ruleKey,
  singleConditionLabel
} from './workspace-model';

interface TemplateNode {
  id: string;
  label: string;
  index?: number;
  children?: TemplateNode[];
}
const visible = defineModel<boolean>({ required: true });
const props = defineProps<{
  initial?: TemplateInput;
  templateId?: string;
  templates: { id: string; name: string }[];
}>();
const emit = defineEmits<{ saved: [] }>();
const model = ref<TemplateInput>(asTemplate(defaultConfiguration(), ''));
const saving = ref(false);
watch(visible, value => {
  if (!value) return;
  model.value = props.initial
    ? asTemplate(props.initial, props.initial.name, props.initial.description)
    : asTemplate(defaultConfiguration(), '');
});
const treeNodes = computed<TemplateNode[]>(() => [
  ...model.value.rules.map((rule, index) => ({
    id: `rule:${index}`,
    index,
    label: `${index + 1}. ${rule.conditions?.length ? `全部满足（${ruleConditions(rule).length} 个条件）` : conditionLabel(rule)}`,
    children: [
      ...(rule.conditions?.length
        ? ruleConditions(rule).map((condition, conditionIndex) => ({
            id: `condition:${index}:${conditionIndex}`,
            index,
            label: `${conditionIndex ? '且 ' : ''}${singleConditionLabel(condition)}`
          }))
        : []),
      { id: `action:${index}`, index, label: actionLabel(rule) }
    ]
  })),
  {
    id: 'constraints',
    label: '执行约束',
    children: [
      { id: 'window', label: `近 ${model.value.windowMinutes} 分钟 · 最低 ${model.value.minSamples} 笔` },
      { id: 'cooldown', label: `冷却 ${model.value.cooldownSeconds} 秒` }
    ]
  }
]);
async function save() {
  if (saving.value) return;
  if (!model.value.name.trim()) {
    window.$message?.warning('请填写模板名称');
    return;
  }
  const error = model.value.rules.map(ruleConditionError).find(Boolean);
  if (error) {
    window.$message?.warning(error);
    return;
  }
  const predicates = model.value.rules.map(ruleKey);
  if (new Set(predicates).size !== predicates.length) {
    window.$message?.warning('已有相同判断条件，请修改原规则');
    return;
  }
  saving.value = true;
  try {
    const response = await saveStrategyTemplate(model.value, props.templateId);
    if (!response.error) {
      visible.value = false;
      window.$message?.success('模板已保存，已应用的策略组保持各自规则');
      emit('saved');
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <StrategyTemplateDialog
    v-model="visible"
    v-model:name="model.name"
    v-model:description="model.description"
    v-model:rules="model.rules"
    :template-id="templateId"
    :templates="templates"
    :tree-nodes="treeNodes"
    :new-rule="defaultRule"
    :saving="saving"
    @save="save"
  >
    <template #rule="{ index }">
      <RuleForm v-model="model.rules[index]" :min-weight="model.minWeight" :max-weight="model.maxWeight" />
    </template>
    <template #constraints>
      <ConstraintsForm :model-value="model" @update:model-value="Object.assign(model, $event)" />
    </template>
    <template #note>应用模板会复制规则到策略组。修改模板不影响已应用的策略组；备用通道由各策略组独立配置。</template>
  </StrategyTemplateDialog>
</template>
