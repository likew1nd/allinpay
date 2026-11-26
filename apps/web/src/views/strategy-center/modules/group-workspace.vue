<script setup lang="ts">
import EpayKeywordSearch from '@/components/custom/epay-keyword-search.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate } from "vue-router";
import { ElMessageBox } from "element-plus";
import type { TreeInstance } from "element-plus";
import { deleteStrategyTemplate, evaluateStrategyGroup, fetchStrategyGroupConfiguration, fetchStrategyObjectCatalog, fetchStrategyTemplates, saveStrategyGroupConfiguration, updateStrategyGroup } from "@/service/api";
import type { StrategyConfiguration, StrategyEvaluation, StrategyGroupBinding, StrategyGroupRecord, StrategyObjectCatalog, StrategyTemplate, TemplateInput, TemplateRule, WorkspaceGroupInput, WorkspaceTarget } from "@/service/api";
import { showSwitchMessage } from "@/utils/message";
import { useAuth } from "@/hooks/business/auth";
import EpayStatusSwitch from "@/components/custom/epay-status-switch.vue";
import ConstraintsForm from "./constraints-form.vue";
import EditableGroupLabel from "./editable-group-label.vue";
import ResultTable from "./result-table.vue";
import RuleForm from "./rule-form.vue";
import StrategyTemplatePanel from "./strategy-template-panel.vue";
import TemplateEditor from "./template-editor.vue";
import TreeContextMenu from "./tree-context-menu.vue";
import type { MenuItem } from "./tree-context-menu.vue";
import {
  actionLabel,
  asTemplate,
  conditionLabel,
  copyConfiguration,
  copyRule,
  defaultConfiguration,
  defaultRule,
  isMembershipAction,
  isWeightAction,
  ruleConditionError,
  ruleConditions,
  ruleKey,
  singleConditionLabel,
  successRateLabel,
  targetKey,
} from "./workspace-model";

const props = defineProps<{ groupId: string }>();

interface ObjectNode {
  id: string;
  label: string;
  kind: "site" | "polling" | "channel";
  children?: ObjectNode[];
  disabled: boolean;
  target?: WorkspaceTarget;
  owner?: string;
  weight?: number;
  status?: string;
  successRate?: number | null;
  allChannel?: boolean;
  note?: string;
  search: string;
}
interface StrategyNode {
  id: string;
  label: string;
  kind: "rule" | "condition" | "action" | "constraints" | "property";
  groupId: string;
  ruleIndex?: number;
  children?: StrategyNode[];
}
const { hasAuth } = useAuth();
const canEditIdentity = computed(() => hasAuth("strategy:update"));
const activeGroup = ref<StrategyGroupRecord>();
const templates = ref<StrategyTemplate[]>([]);
const catalog = ref<StrategyObjectCatalog>({ sites: [], owners: [] });
const bindings = ref<StrategyGroupBinding[]>([]);
const loading = ref(false);
const saving = ref(false);
const working = ref(false);
const activeId = ref(props.groupId);
const draft = ref<WorkspaceGroupInput | null>(null);
const baseline = ref("");
const objectTree = ref<TreeInstance>();
const strategyTree = ref<TreeInstance>();
const menu = ref<InstanceType<typeof TreeContextMenu>>();
const objectSearch = ref("");
const selectedObject = ref<ObjectNode | null>(null);
const selectedTemplate = ref("");
const result = ref<StrategyEvaluation | null>(null);
const resultDialog = ref(false);
const ruleDialog = ref(false);
const ruleIndex = ref(-1);
const ruleDraft = ref<TemplateRule>(defaultRule());
const constraintsDialog = ref(false);
const constraintsDraft = ref<StrategyConfiguration>(defaultConfiguration());
const templateDialog = ref(false);
const templateInitial = ref<TemplateInput>();
const templateEditingId = ref<string>();

function serialized(value: WorkspaceGroupInput | null) {
  return value
    ? JSON.stringify({
        ...value,
        targets: [...value.targets].sort((a, b) => targetKey(a).localeCompare(targetKey(b))),
        reserveChannels: [...(value.reserveChannels ?? [])].sort((a, b) => `${a.siteId}:${a.channelCode}`.localeCompare(`${b.siteId}:${b.channelCode}`)),
      })
    : "";
}
const dirty = computed(() => Boolean(draft.value && serialized(draft.value) !== baseline.value));
const needsWeight = computed(() => draft.value?.configuration.rules.some(isWeightAction) ?? true);
const needsMembership = computed(() => draft.value?.configuration.rules.some(isMembershipAction) ?? false);
const needsPolling = computed(() => needsWeight.value || needsMembership.value || (draft.value?.configuration.rules.some((rule) => ruleConditions(rule).some((condition) => condition.metric === "CHANNEL_COUNT")) ?? false));
const needsStatus = computed(() => draft.value?.configuration.rules.some((rule) => rule.action.type === "SET_CHANNEL_STATUS") ?? false);
const activeRuleCount = computed(() => draft.value?.configuration.rules.length ?? 0);
const previewTemplate = computed(() => templates.value.find((template) => template.id === selectedTemplate.value));
const displayedConfiguration = computed(() => previewTemplate.value ?? draft.value?.configuration);
async function loadTemplates() {
  const records: StrategyTemplate[] = [];
  for (let current = 1; ; current += 1) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetchStrategyTemplates({ current, size: 100 });
    if (response.error) return;
    records.push(...response.data.records);
    if (records.length >= response.data.total || !response.data.records.length) break;
  }
  templates.value = records;
}
async function loadCatalog() {
  const response = await fetchStrategyObjectCatalog(draft.value?.configuration.windowMinutes ?? 10);
  if (!response.error) catalog.value = response.data;
}
async function readGroup(id: string) {
  const response = await fetchStrategyGroupConfiguration(id);
  if (response.error) return false;
  const group = response.data;
  activeGroup.value = group;
  activeId.value = id;
  bindings.value = group.bindings;
  draft.value = {
    name: group.name,
    description: group.description ?? "",
    templateId: group.templateId,
    expectedVersion: group.currentVersion,
    configuration: group.configuration ? copyConfiguration(group.configuration) : defaultConfiguration(),
    reserveChannels: (group.reserveChannels ?? []).map((row) => ({ ...row })),
    targets: group.bindings.map((binding) => ({
      siteId: binding.siteId,
      pollingGroupCode: binding.pollingGroupCode,
      channelCode: binding.channelCode,
    })),
  };
  baseline.value = group.configuration ? serialized(draft.value) : "";
  selectedObject.value = null;
  selectedTemplate.value = "";
  return true;
}
async function discardCheck() {
  if (saving.value || working.value) {
    window.$message?.warning("操作正在提交，请稍后再离开");
    return false;
  }
  if (!dirty.value) return true;
  try {
    await ElMessageBox.confirm("当前策略组有未保存修改。放弃这些修改并继续？", "未保存修改", {
      type: "warning",
      confirmButtonText: "放弃修改",
      cancelButtonText: "继续编辑",
    });
    return true;
  } catch {
    return false;
  }
}
async function refresh() {
  if (!(await discardCheck())) return;
  loading.value = true;
  try {
    await readGroup(props.groupId);
    await Promise.all([loadTemplates(), loadCatalog()]);
  } finally {
    loading.value = false;
  }
}

const objectNodes = computed<ObjectNode[]>(() => {
  const owners = new Map(catalog.value.owners.map((owner) => [targetKey(owner), owner]));
  const known = new Set<string>();
  const makeLeaf = (
    target: WorkspaceTarget,
    channel: {
      name: string;
      code: string;
      status: string;
      successRate?: number | null;
    },
    options: {
      prefix: string;
      blocked: boolean;
      weight?: number;
      allChannel?: boolean;
    },
  ): ObjectNode => {
    const { prefix, blocked, weight } = options;
    const key = targetKey(target);
    known.add(key);
    const globalOwner = owners.get(targetKey({ ...target, pollingGroupCode: "" }));
    const structuralOwner = target.pollingGroupCode
      ? catalog.value.owners.find((row) => row.siteId === target.siteId && row.pollingGroupCode === target.pollingGroupCode && row.groupId !== activeId.value && (needsMembership.value || row.controlType === "POLLING_MEMBERS"))
      : undefined;
    const owner = structuralOwner ?? (needsStatus.value && globalOwner && globalOwner.groupId !== activeId.value ? globalOwner : owners.get(key));
    const occupied = owner && owner.groupId !== activeId.value;
    let note: string | undefined;
    if (blocked) note = target.pollingGroupCode ? "该轮询方式不支持调权或尚未同步" : "受控对象请从轮询组选择";
    return {
      id: `object:${key}`,
      kind: "channel",
      label: channel.name,
      target,
      weight,
      status: channel.status,
      successRate: channel.successRate ?? null,
      allChannel: options.allChannel,
      owner: occupied ? owner.group.name : undefined,
      disabled: !draft.value || blocked || Boolean(occupied),
      note,
      search: `${prefix} ${channel.name} ${channel.code}`,
    };
  };
  const nodes: ObjectNode[] = catalog.value.sites.map((site) => {
    const children: ObjectNode[] = site.pollingGroups.map((group) => {
      const blocked = (needsWeight.value && group.kind !== 1) || !group.published;
      const members = group.members.map((member) =>
        makeLeaf(
          {
            siteId: site.id,
            pollingGroupCode: group.code,
            channelCode: member.channel.code,
          },
          member.channel,
          {
            prefix: `${site.name} ${group.name} ${group.code}`,
            blocked,
            weight: member.weight,
          },
        ),
      );
      return {
        id: `polling:${site.id}:${group.code}`,
        label: group.name,
        kind: "polling" as const,
        disabled: !members.length || members.every((member) => member.disabled),
        children: members,
        status: group.status,
        note: ({ 1: "加权随机", 2: "优先顺序" } as Record<number, string>)[group.kind] ?? "顺序轮询",
        search: `${site.name} ${group.name} ${group.code}`,
      };
    });
    const channels = site.channels.map((channel) =>
      makeLeaf({ siteId: site.id, pollingGroupCode: "", channelCode: channel.code }, channel, {
        prefix: site.name,
        blocked: needsPolling.value,
        allChannel: true,
      }),
    );
    if (channels.length)
      children.push({
        id: `direct:${site.id}`,
        label: "全部通道",
        kind: "polling",
        children: channels,
        disabled: channels.every((channel) => channel.disabled),
        search: `${site.name} 全部通道 补充备用 复用`,
      });
    return {
      id: `site:${site.id}`,
      label: site.name,
      kind: "site" as const,
      disabled: !children.length || children.every((child) => child.disabled),
      children,
      note: site.connectionStatus === "ONLINE" ? undefined : "离线",
      search: site.name,
    };
  });
  const stale = (draft.value?.targets ?? [])
    .filter((target) => !known.has(targetKey(target)))
    .map((target) => ({
      id: `object:${targetKey(target)}`,
      kind: "channel" as const,
      label: `通道 ${target.channelCode}`,
      target,
      disabled: false,
      note: "对象已失效，可取消绑定",
      search: `${target.siteId} ${target.pollingGroupCode} ${target.channelCode}`,
    }));
  if (stale.length)
    nodes.push({
      id: "stale",
      label: "已失效绑定",
      kind: "site",
      disabled: false,
      children: stale,
      note: "请检查",
      search: "已失效绑定",
    });
  const staleReserves = (draft.value?.reserveChannels ?? []).filter((row) => !known.has(targetKey({ ...row, pollingGroupCode: "" })));
  if (staleReserves.length)
    nodes.push({
      id: "stale-reserves",
      label: "已失效备用",
      kind: "site",
      disabled: true,
      search: "已失效备用",
      children: staleReserves.map((row) => ({
        id: `reserve:${row.siteId}:${row.channelCode}`,
        label: `通道 ${row.channelCode}`,
        kind: "channel",
        allChannel: true,
        disabled: true,
        target: {
          siteId: row.siteId,
          channelCode: row.channelCode,
          pollingGroupCode: "",
        },
        note: "已失效，可取消备用",
        search: row.channelCode,
      })),
    });
  return nodes;
});
function reserveEntry(node: ObjectNode) {
  return draft.value?.reserveChannels?.find((row) => row.siteId === node.target?.siteId && row.channelCode === node.target?.channelCode);
}
function setReserve(node: ObjectNode, checked: boolean) {
  if (!draft.value || !node.target) return;
  const next = (draft.value.reserveChannels ?? []).filter((row) => row.siteId !== node.target!.siteId || row.channelCode !== node.target!.channelCode);
  if (checked)
    next.push({
      siteId: node.target.siteId,
      channelCode: node.target.channelCode,
      allowReuse: reserveEntry(node)?.allowReuse ?? false,
    });
  draft.value.reserveChannels = next;
}
function setReuse(node: ObjectNode, checked: boolean) {
  const reserve = reserveEntry(node);
  if (reserve) reserve.allowReuse = checked;
}
function leaves(nodes: ObjectNode[]): ObjectNode[] {
  return nodes.flatMap((node) => (node.kind === "channel" ? [node] : leaves(node.children ?? [])));
}
const objectLeaves = computed(() => leaves(objectNodes.value));
async function synchronizeChecks() {
  await nextTick();
  objectTree.value?.setCheckedKeys((draft.value?.targets ?? []).map((target) => `object:${targetKey(target)}`));
}
watch([objectNodes, () => draft.value?.targets], synchronizeChecks, {
  deep: true,
});
watch(objectSearch, (value) => objectTree.value?.filter(value));
function checkObjects(_node: ObjectNode, state: { checkedKeys: (string | number)[] }) {
  if (!draft.value) return;
  const keys = new Set(state.checkedKeys);
  draft.value.targets = objectLeaves.value.filter((leaf) => keys.has(leaf.id) && leaf.target).map((leaf) => ({ ...leaf.target! }));
}
function selectBranch(node: ObjectNode, checked: boolean) {
  if (!draft.value) return;
  const members = leaves([node]);
  const next = new Map(draft.value.targets.map((target) => [targetKey(target), target]));
  for (const member of members)
    if (member.target) {
      if (checked && !member.disabled) next.set(targetKey(member.target), { ...member.target });
      else if (!checked) next.delete(targetKey(member.target));
    }
  draft.value.targets = [...next.values()];
}
function objectMenu(event: MouseEvent, node: ObjectNode) {
  selectedObject.value = node;
  menu.value?.open(event, [
    {
      label: node.kind === "channel" ? "加入当前策略组" : "选择可用成员",
      disabled: !draft.value || node.disabled,
      run: () => selectBranch(node, true),
    },
    {
      label: node.kind === "channel" ? "移出当前策略组" : "取消该分支的绑定",
      disabled: !draft.value,
      run: () => selectBranch(node, false),
    },
  ]);
}

function ruleNodes(groupId: string, configuration: StrategyConfiguration): StrategyNode[] {
  return [
    ...configuration.rules.map(
      (rule, index): StrategyNode => ({
        id: `rule:${groupId}:${index}`,
        kind: "rule",
        groupId,
        ruleIndex: index,
        label: `${index + 1}. ${rule.conditions?.length ? `全部满足（${ruleConditions(rule).length} 个条件）` : conditionLabel(rule)}`,
        children: [
          ...(rule.conditions?.length
            ? ruleConditions(rule).map((condition, conditionIndex) => ({
                id: `condition:${groupId}:${index}:${conditionIndex}`,
                kind: "condition" as const,
                groupId,
                ruleIndex: index,
                label: `${conditionIndex ? "且 " : ""}${singleConditionLabel(condition)}`,
              }))
            : []),
          {
            id: `action:${groupId}:${index}`,
            kind: "action",
            groupId,
            ruleIndex: index,
            label: actionLabel(rule),
          },
        ],
      }),
    ),
    {
      id: `constraints:${groupId}`,
      kind: "constraints",
      groupId,
      label: "执行约束",
      children: [
        {
          id: `window:${groupId}`,
          kind: "property",
          groupId,
          label: `统计窗口：${configuration.windowMinutes} 分钟 · 最低样本：${configuration.minSamples} 笔`,
        },
        {
          id: `cooldown:${groupId}`,
          kind: "property",
          groupId,
          label: `冷却：${configuration.cooldownSeconds} 秒${configuration.rules.some((rule) => isWeightAction(rule) || rule.action.type === "ADD_POLLING_MEMBER") ? ` · 权重：${configuration.minWeight}～${configuration.maxWeight}` : ""}`,
        },
      ],
    },
  ];
}
const strategyNodes = computed<StrategyNode[]>(() => {
  if (!draft.value || !displayedConfiguration.value) return [];
  const id = previewTemplate.value ? `template:${previewTemplate.value.id}` : activeId.value;
  return ruleNodes(id, displayedConfiguration.value);
});
function editRule(index = -1) {
  if (!draft.value || previewTemplate.value) return;
  ruleIndex.value = index;
  const source = draft.value.configuration.rules[index];
  ruleDraft.value = source ? copyRule(source) : defaultRule();
  ruleDialog.value = true;
}
function confirmRule() {
  if (!draft.value) return;
  const rules = draft.value.configuration.rules;
  const rule = ruleDraft.value;
  const error = ruleConditionError(rule);
  if (error) {
    window.$message?.warning(error);
    return;
  }
  if (rules.some((item, index) => index !== ruleIndex.value && ruleKey(item) === ruleKey(rule))) {
    window.$message?.warning("已有相同判断条件，请修改原规则");
    return;
  }
  if (ruleIndex.value < 0) rules.push(copyRule(rule));
  else rules.splice(ruleIndex.value, 1, copyRule(rule));
  ruleDialog.value = false;
}
function moveRule(index: number, offset: number) {
  if (!draft.value) return;
  const rules = draft.value.configuration.rules;
  const [rule] = rules.splice(index, 1);
  rules.splice(index + offset, 0, rule);
}
function duplicateRule(index: number) {
  editRule(index);
  ruleIndex.value = -1;
}
function removeRule(index: number) {
  draft.value?.configuration.rules.splice(index, 1);
}
function editConstraints() {
  if (!draft.value || previewTemplate.value) return;
  constraintsDraft.value = copyConfiguration(draft.value.configuration);
  constraintsDialog.value = true;
}
function confirmConstraints() {
  if (!draft.value) return;
  if (constraintsDraft.value.minWeight > constraintsDraft.value.maxWeight) {
    window.$message?.warning("权重下限不能大于上限");
    return;
  }
  draft.value.configuration = {
    ...constraintsDraft.value,
    rules: draft.value.configuration.rules,
  };
  constraintsDialog.value = false;
  loadCatalog();
}
async function save() {
  if (!draft.value || saving.value) return false;
  if (!draft.value.configuration.rules.length) {
    window.$message?.warning("请至少添加一条规则");
    return false;
  }
  saving.value = true;
  try {
    const response = await saveStrategyGroupConfiguration(draft.value, activeId.value);
    if (response.error) return false;
    await loadCatalog();
    await readGroup(response.data.id);
    showSwitchMessage(false, "规则和绑定已保存，策略组处于已停止状态");
    return true;
  } finally {
    saving.value = false;
  }
}
async function resetDraft() {
  if (!(await discardCheck())) return;
  await readGroup(activeId.value);
}
async function toggleGroup() {
  if (!draft.value || working.value) return;
  if (dirty.value) {
    window.$message?.warning("请先保存当前修改，再切换状态");
    return;
  }
  working.value = true;
  try {
    const response = await updateStrategyGroup(activeId.value, {
      status: activeGroup.value?.status === "RUNNING" ? "PAUSED" : "RUNNING",
    });
    if (!response.error) {
      const enabled = response.data.status === "RUNNING";
      showSwitchMessage(enabled, enabled ? "策略组已启用" : "策略组已停止");
      await readGroup(activeId.value);
    }
  } finally {
    working.value = false;
  }
}
async function simulate() {
  if (!draft.value || working.value) return;
  if (dirty.value) {
    window.$message?.warning("请先保存规则和绑定，再进行模拟");
    return;
  }
  working.value = true;
  try {
    const response = await evaluateStrategyGroup(activeId.value);
    if (!response.error) {
      result.value = response.data;
      resultDialog.value = true;
    }
  } finally {
    working.value = false;
  }
}
function strategyMenu(event: MouseEvent, node?: StrategyNode) {
  event.preventDefault();
  event.stopPropagation();
  if (previewTemplate.value) {
    const template = previewTemplate.value;
    menu.value?.open(event, [
      { label: "应用此模板", run: () => applyTemplate(template) },
      { label: "编辑源模板", run: () => openTemplate(template) },
      {
        label: "返回当前组规则",
        run: () => {
          selectedTemplate.value = "";
        },
      },
    ]);
    return;
  }
  const items: MenuItem[] = [];
  if (draft.value) {
    if (node?.ruleIndex !== undefined) {
      const index = node.ruleIndex;
      items.unshift(
        { label: "编辑规则条件与动作", run: () => editRule(index) },
        {
          label: "复制规则",
          disabled: activeRuleCount.value >= 20,
          run: () => duplicateRule(index),
        },
        {
          label: "上移规则",
          disabled: index === 0,
          run: () => moveRule(index, -1),
        },
        {
          label: "下移规则",
          disabled: index === activeRuleCount.value - 1,
          run: () => moveRule(index, 1),
        },
        { label: "删除规则", danger: true, run: () => removeRule(index) },
      );
    } else
      items.unshift(
        {
          label: "添加规则",
          disabled: activeRuleCount.value >= 20,
          run: () => editRule(),
        },
        { label: "编辑执行约束", run: editConstraints },
        { label: "保存为模板", run: saveAsTemplate },
        {
          label: activeGroup.value?.status === "RUNNING" ? "停止策略组" : "启用策略组",
          disabled: dirty.value,
          run: () => toggleGroup(),
        },
      );
  }
  menu.value?.open(event, items);
}
function doubleClickNode(node: StrategyNode) {
  if (!draft.value || previewTemplate.value) return;
  if (node.ruleIndex !== undefined) editRule(node.ruleIndex);
  else if (node.kind === "constraints" || node.kind === "property") editConstraints();
}
function openTemplate(template?: StrategyTemplate) {
  templateEditingId.value = template?.id;
  templateInitial.value = template ? asTemplate(template, template.name, template.description) : undefined;
  templateDialog.value = true;
}
function saveAsTemplate() {
  if (!draft.value) return;
  templateEditingId.value = undefined;
  templateInitial.value = asTemplate(draft.value.configuration, `${draft.value.name}模板`, draft.value.description);
  templateDialog.value = true;
}
async function applyTemplate(template: StrategyTemplate) {
  if (!draft.value) return;
  try {
    await ElMessageBox.confirm(`将“${template.name}”的规则应用到“${draft.value.name}”，替换当前编辑内容并保留已选对象。点击保存修改后生效；动作与绑定不兼容时，保存会提示。`, "应用模板", {
      confirmButtonText: "应用此模板",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  draft.value.configuration = copyConfiguration(template);
  draft.value.templateId = template.id;
  selectedTemplate.value = "";
  await loadCatalog();
  window.$message?.success("模板已应用到当前编辑内容，请保存修改");
}
async function removeTemplate(template: StrategyTemplate) {
  try {
    await ElMessageBox.confirm(`删除模板“${template.name}”？已应用的策略组保留各自的规则副本。`, "删除模板", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消",
    });
  } catch {
    return;
  }
  const response = await deleteStrategyTemplate(template.id);
  if (!response.error) {
    if (draft.value?.templateId === template.id) {
      const hadChanges = dirty.value;
      draft.value.templateId = null;
      if (!hadChanges) baseline.value = serialized(draft.value);
    }
    if (selectedTemplate.value === template.id) selectedTemplate.value = "";
    await loadTemplates();
  }
}
function templateMenu(event: MouseEvent, template?: StrategyTemplate) {
  const items: MenuItem[] = [{ label: "新增模板", run: () => openTemplate() }];
  if (template)
    items.unshift(
      {
        label: "预览模板规则",
        run: () => {
          selectedTemplate.value = template.id;
        },
      },
      {
        label: "应用到当前策略组",
        disabled: !draft.value,
        run: () => applyTemplate(template),
      },
      { label: "编辑模板", run: () => openTemplate(template) },
      {
        label: "复制模板",
        run: () => {
          templateEditingId.value = undefined;
          templateInitial.value = asTemplate(template, `${template.name}（副本）`, template.description);
          templateDialog.value = true;
        },
      },
      { label: "删除模板", danger: true, run: () => removeTemplate(template) },
    );
  menu.value?.open(event, items);
}
const selectedBinding = computed(() => (selectedObject.value?.target ? bindings.value.find((binding) => targetKey(binding) === targetKey(selectedObject.value!.target!)) : undefined));
function preventUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onBeforeRouteLeave(discardCheck);
onBeforeRouteUpdate((to, from) => to.query.group === from.query.group || discardCheck());
onMounted(() => {
  refresh();
  window.addEventListener("beforeunload", preventUnload);
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", preventUnload));
</script>

<template>
  <div v-loading="loading || saving || working" class="strategy-workspace">
    <section class="strategy-group-heading epay-page-heading epay-page-intro" aria-label="策略组概览">
      <div class="workspace-toolbar">
        <div class="group-overview">
          <div class="epay-page-heading-main">
            <span class="epay-page-heading-icon" aria-hidden="true"><SvgIcon icon="tabler:adjustments-horizontal" /></span>
            <div class="group-identity">
              <div class="group-eyebrow">
                <span>策略组配置</span>
                <ElTag v-if="dirty" type="warning" size="small" effect="plain">未保存修改</ElTag>
              </div>
              <template v-if="draft">
                <h1>
                  <EditableGroupLabel v-model="draft.name" label="策略组名称" :readonly="!canEditIdentity" show-hint required :max-length="100" />
                </h1>
                <EditableGroupLabel v-model="draft.description" label="策略组说明" :readonly="!canEditIdentity" class="group-description" :max-length="500" />
              </template>
              <h1 v-else>策略组配置</h1>
            </div>
          </div>
          <div v-if="activeGroup" class="group-status">
            <div class="group-status-copy">
              <span>运行状态</span>
              <strong>{{ activeGroup.status === "RUNNING" ? "运行中" : "已停止" }}</strong>
            </div>
            <EpayStatusSwitch :checked="activeGroup.status === 'RUNNING'" :label="activeGroup.status === 'RUNNING' ? '停止策略组' : '启用策略组'" :loading="saving || working" :disabled="dirty || saving || working" @change="toggleGroup" />
          </div>
        </div>
      </div>
    </section>
    <ElCard class="workspace-card" shadow="never">
      <div class="workspace-columns">
        <section class="tree-panel object-panel">
          <div class="panel-heading">
            <div>
              <strong>轮询组与通道</strong>
              <span class="panel-count">{{ draft?.targets.length ?? 0 }} 个已选</span>
            </div>
          </div>
          <div class="panel-search">
            <EpayKeywordSearch v-model="objectSearch" placeholder="搜索站点、轮询组、通道" />
          </div>
          <div class="panel-hint">
            勾选树节点选择受控对象；「全部通道」中的「备用」单独配置补充池，不会自动绑定。 成功率按近
            {{ catalog.windowMinutes ?? 10 }} 分钟统计。
          </div>
          <div class="tree-scroll">
            <ElTree
              ref="objectTree"
              :data="objectNodes"
              node-key="id"
              show-checkbox
              :props="{
                label: 'label',
                children: 'children',
                disabled: 'disabled',
              }"
              :expand-on-click-node="false"
              :filter-node-method="(value: string, data: Record<string, any>) => !value || String(data.search).toLowerCase().includes(value.toLowerCase())"
              default-expand-all
              empty-text="暂无已同步对象"
              @check="checkObjects"
              @node-click="(node: ObjectNode) => (selectedObject = node)"
              @node-contextmenu="(event: Event, data: ObjectNode) => objectMenu(event as MouseEvent, data)"
            >
              <template #default="{ data }">
                <div class="tree-row" :title="data.owner ? `已归属：${data.owner}` : data.note || data.label">
                  <span class="node-symbol">{{ data.kind === "site" ? "▣" : data.kind === "polling" ? "▤" : "●" }}</span>
                  <span class="node-label">{{ data.label }}</span>
                  <span v-if="data.kind === 'channel'" class="node-rate" :title="`当前成功率：${successRateLabel(data.successRate)}`">
                    {{ successRateLabel(data.successRate) }}
                  </span>
                  <span v-if="data.allChannel" class="reserve-options" @click.stop @dblclick.stop>
                    <ElCheckbox :model-value="Boolean(reserveEntry(data))" :disabled="!draft" title="作为补充备用" @change="setReserve(data, Boolean($event))"> 备用 </ElCheckbox>
                    <ElCheckbox :model-value="reserveEntry(data)?.allowReuse ?? false" :disabled="!reserveEntry(data)" title="允许此通道同时存在于本站点不同轮询组" @change="setReuse(data, Boolean($event))"> 复用 </ElCheckbox>
                  </span>
                  <span v-if="data.kind === 'channel' && data.weight !== undefined" class="node-meta">
                    {{ data.weight }}
                  </span>
                  <ElTag v-if="data.owner" size="small" type="info">{{ data.owner }}</ElTag>
                  <span v-else-if="data.note && !data.allChannel" class="node-meta">{{ data.note }}</span>
                  <span v-if="data.status" class="status-dot" :class="data.status === 'ENABLED' ? 'online' : 'stopped'" :title="data.status === 'ENABLED' ? '已启用' : '已停止'" />
                  <button class="node-more" aria-label="对象操作" @click.stop="objectMenu($event, data)">⋯</button>
                </div>
              </template>
            </ElTree>
          </div>
          <div v-if="selectedObject" class="object-detail">
            <strong>{{ selectedObject.label }}</strong>
            <div v-if="selectedObject.target">
              通道编号：{{ selectedObject.target.channelCode }}
              <template v-if="selectedObject.weight !== undefined">· 当前权重 {{ selectedObject.weight }}</template>
            </div>
            <div v-if="selectedObject.owner">归属：{{ selectedObject.owner }}</div>
            <div>
              {{ selectedBinding?.lastReason || selectedObject.note || "右键或点击 ⋯ 管理绑定" }}
            </div>
            <div v-if="selectedObject.allChannel">备用优先选「暂无」，再按成功率从高到低；不勾选复用时，只选择未加入本站点任何轮询组的通道。</div>
          </div>
        </section>

        <section class="tree-panel strategy-panel" @contextmenu.prevent="strategyMenu($event)">
          <div class="panel-heading">
            <div>
              <strong>策略与规则</strong>
              <span class="panel-count">{{ displayedConfiguration?.rules.length ?? 0 }} 条规则</span>
            </div>
            <ElTag v-if="previewTemplate" type="warning" size="small">模板预览</ElTag>
            <ElButton size="small" :disabled="!draft || Boolean(previewTemplate)" @click="saveAsTemplate"> 保存为模板 </ElButton>
          </div>
          <div v-if="previewTemplate" class="template-preview-banner">
            <strong>预览模板：{{ previewTemplate.name }}</strong>
            <p>当前组“{{ draft?.name }}”的配置未改变，应用后可继续编辑。</p>
            <div class="summary-actions">
              <ElButton size="small" type="primary" @click="applyTemplate(previewTemplate)">应用此模板</ElButton>
              <ElButton size="small" @click="selectedTemplate = ''">返回当前组规则</ElButton>
            </div>
          </div>
          <div v-else class="panel-hint">当前组规则：按顺序判断，只执行首条命中规则。右键或双击编辑。</div>
          <div class="tree-scroll">
            <ElTree
              ref="strategyTree"
              :key="previewTemplate?.id ?? 'current-group'"
              :data="strategyNodes"
              node-key="id"
              :props="{ label: 'label', children: 'children' }"
              highlight-current
              default-expand-all
              :expand-on-click-node="false"
              empty-text="暂无规则，右键添加规则"
              @node-contextmenu="(event: Event, data: StrategyNode) => strategyMenu(event as MouseEvent, data)"
            >
              <template #default="{ data }">
                <div class="tree-row" @dblclick.stop="doubleClickNode(data)">
                  <span class="node-symbol" :class="data.kind">
                    <template v-if="data.kind === 'condition'">·</template>
                    <template v-else>{{ data.kind === "rule" ? "◇" : data.kind === "action" ? "↳" : "⚙" }}</template>
                  </span>
                  <span class="node-label" :title="data.label">{{ data.label }}</span>
                  <button class="node-more" aria-label="策略操作" @click.stop="strategyMenu($event, data)">⋯</button>
                </div>
              </template>
            </ElTree>
          </div>
        </section>

        <StrategyTemplatePanel
          v-model="selectedTemplate"
          :templates="templates"
          empty-text="暂无模板，可新增或将策略组保存为模板"
          @create="openTemplate()"
          @menu="templateMenu"
        >
          <template #summary="{ template }">{{ template.rules.length }} 条规则 · 近 {{ template.windowMinutes }} 分钟 · 冷却 {{ template.cooldownSeconds }} 秒</template>
        </StrategyTemplatePanel>
      </div>
      <div class="workspace-footer">
        <div>
          <span v-if="dirty" class="draft-mark">有未保存修改</span>
          <span v-else>配置已保存</span>
          <span v-if="draft" class="footer-description">保存后策略组停止，确认后再启用。</span>
        </div>
        <div class="footer-buttons">
          <ElButton :disabled="!dirty || saving" @click="resetDraft">撤销修改</ElButton>
          <ElButton :disabled="!draft || dirty || Boolean(previewTemplate)" :loading="working" @click="simulate"> 模拟当前组 </ElButton>
          <ElButton type="primary" :disabled="!dirty || Boolean(previewTemplate)" :loading="saving" @click="save"> 保存修改 </ElButton>
        </div>
      </div>
    </ElCard>

    <TreeContextMenu ref="menu" />
    <ElDialog v-model="ruleDialog" :title="ruleIndex < 0 ? '添加规则' : '编辑规则'" width="min(840px, 95vw)" top="6vh" :close-on-click-modal="false" destroy-on-close>
      <div class="rule-editor-body">
        <RuleForm v-if="draft" v-model="ruleDraft" :min-weight="draft.configuration.minWeight" :max-weight="draft.configuration.maxWeight" />
      </div>
      <template #footer>
        <ElButton @click="ruleDialog = false">取消</ElButton>
        <ElButton type="primary" :disabled="Boolean(ruleConditionError(ruleDraft))" @click="confirmRule">确定</ElButton>
      </template>
    </ElDialog>
    <ElDialog v-model="constraintsDialog" title="执行约束" width="min(520px, 95vw)" :close-on-click-modal="false">
      <ConstraintsForm v-model="constraintsDraft" />
      <template #footer>
        <ElButton @click="constraintsDialog = false">取消</ElButton>
        <ElButton type="primary" @click="confirmConstraints">确定</ElButton>
      </template>
    </ElDialog>
    <TemplateEditor v-model="templateDialog" :initial="templateInitial" :template-id="templateEditingId" :templates="templates" @saved="loadTemplates" />
    <ElDialog v-model="resultDialog" title="策略模拟结果" width="min(1050px, 95vw)">
      <ResultTable v-if="result" :result="result" />
    </ElDialog>
  </div>
</template>

<style scoped src="./strategy-panel.css"></style>
<style scoped src="./group-workspace.css"></style>
