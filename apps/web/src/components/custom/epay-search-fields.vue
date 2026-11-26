<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { createReusableTemplate, useElementSize } from '@vueuse/core';
import { $t } from '@/locales';

interface SearchField {
  key: string;
  width: number;
  value?: unknown;
}
const props = withDefaults(defineProps<{
  fields?: SearchField[];
  disabled?: boolean;
  searchDisabled?: boolean;
  loading?: boolean;
}>(), { fields: () => [{ key: 'default', width: 210 }] });
const emit = defineEmits<{ search: []; reset: [] }>();
const expanded = defineModel<boolean>('expanded', { default: false });
const buttons = ref<HTMLElement>();
const actions = ref<HTMLElement>();
const { width: available } = useElementSize(() => actions.value?.parentElement);
const { width: buttonWidth } = useElementSize(buttons);
const { width: actionWidth } = useElementSize(actions);
const gap = 10;
const regionId = useId();
const inlineCount = computed(() => {
  const required = props.fields.reduce((total, field) => total + field.width + gap, buttonWidth.value);
  if (required <= available.value) return props.fields.length;
  let width = actionWidth.value;
  for (const [index, field] of props.fields.entries()) {
    width += field.width + gap;
    if (width > available.value) return Math.max(1, index);
  }
  return props.fields.length;
});
function inputWidth(field: SearchField) {
  if (inlineCount.value === 1 && props.fields[0]?.key === field.key && available.value) {
    return Math.max(100, Math.min(field.width, available.value - actionWidth.value - gap));
  }
  return field.width;
}
const inlineFields = computed(() => props.fields.slice(0, inlineCount.value));
const overflow = computed(() => props.fields.slice(inlineCount.value));
const selectedCount = computed(() => overflow.value.filter(({ value }) => {
  if (typeof value === 'string') return Boolean(value.trim());
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}).length);
const [DefineField, FieldControl] = createReusableTemplate<{ field: SearchField }>();

function isInline(key: string) {
  return inlineFields.value.some(field => field.key === key);
}
function reveal(key: string) {
  if (!isInline(key)) expanded.value = true;
}
defineExpose({ isInline, reveal });
</script>

<template>
  <ElForm
    class="epay-table-search"
    :class="{ 'epay-search-compact': fields.length <= 3 && !overflow.length }"
    :style="{ columnGap: gap + 'px' }"
    :disabled="disabled"
    role="search"
    @submit.prevent="!disabled && !searchDisabled && !loading && emit('search')"
  >
    <DefineField v-slot="{ field }">
      <div class="epay-search-field" :style="{ '--field-width': inputWidth(field) + 'px' }">
        <slot :name="field.key" />
      </div>
    </DefineField>
    <FieldControl v-for="field in inlineFields" :key="field.key" :field="field" />
    <div ref="actions" class="epay-search-actions">
      <div ref="buttons" class="epay-search-buttons">
        <ElButton type="primary" native-type="submit" :disabled="searchDisabled" :loading="loading">{{ $t('common.search') }}</ElButton>
        <ElButton native-type="button" @click="emit('reset')">{{ $t('common.reset') }}</ElButton>
      </div>
      <ElButton
        v-if="overflow.length"
        class="epay-search-toggle"
        type="primary"
        link
        native-type="button"
        :aria-expanded="expanded"
        :aria-controls="regionId"
        @click="expanded = !expanded"
      >
        {{ $t(expanded ? 'common.collapseFilters' : 'common.moreFilters') }}<span v-if="!expanded && selectedCount"> · {{ selectedCount }}</span>
        <icon-ic-round-expand-more class="ml-4px" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
      </ElButton>
    </div>
    <div v-if="overflow.length" v-show="expanded" :id="regionId" class="epay-search-advanced">
      <FieldControl v-for="field in overflow" :key="field.key" :field="field" />
    </div>
  </ElForm>
</template>

<style scoped>
.epay-search-field {
  flex: 1 1 var(--field-width);
  width: var(--field-width);
  min-width: 0;
  max-width: 100%;
}
.epay-search-compact .epay-search-field {
  max-width: min(100%, calc(var(--field-width) * 1.5));
}
.epay-search-field > :deep(:is(.el-input, .el-select, .el-date-editor, .el-button)) {
  width: 100%;
  min-width: 0;
  max-width: 100%;
}
.epay-search-actions,
.epay-search-buttons {
  flex: none;
  flex-wrap: nowrap;
}
.epay-search-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.epay-search-buttons > .el-button + .el-button {
  margin-left: 0;
}
</style>
