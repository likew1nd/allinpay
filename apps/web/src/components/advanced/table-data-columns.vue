<script setup lang="ts" generic="T extends object">
import { computed } from 'vue';
import TableColumnSetting from './table-column-setting.vue';

const props = defineProps<{
  columns: UI.TableColumn<T>[];
  unpin?: boolean;
}>();
const checks = defineModel<UI.TableColumnCheck[]>('checks', { required: true });

const lastField = computed(() => {
  const fields = props.columns.filter(column => !column.type || column.type === 'default').reverse();
  const right = props.unpin ? undefined : fields.find(column => column.fixed === 'right');
  const normal = fields.find(column => props.unpin || !column.fixed);
  return right ?? normal ?? fields[0];
});

function columnProps(column: UI.TableColumn<T>) {
  const { renderHeader, ...bindings } = column;
  const fixed = props.unpin ? false : bindings.fixed;
  if (column === lastField.value && bindings.width && Number(bindings.width) < 92) {
    return { ...bindings, fixed, width: 92 };
  }
  return { ...bindings, fixed };
}

function renderHeader(column: UI.TableColumn<T>, scope: Parameters<NonNullable<UI.TableColumn<T>['renderHeader']>>[0]) {
  return column.renderHeader?.(scope);
}
</script>

<template>
  <ElTableColumn
    v-for="column in columns"
    :key="column.prop ?? column.type"
    v-bind="columnProps(column)"
  >
    <template v-if="!column.type || column.type === 'default'" #header="scope">
      <div v-if="column === lastField" class="epay-column-header">
        <span v-if="column.renderHeader"><component :is="() => renderHeader(column, scope)" /></span>
        <span v-else>{{ column.label }}</span>
        <TableColumnSetting v-model:columns="checks" />
      </div>
      <component :is="() => renderHeader(column, scope)" v-else-if="column.renderHeader" />
      <template v-else>{{ column.label }}</template>
    </template>
    <template v-if="$slots.default" #default="scope">
      <slot v-bind="scope" :field="column.prop" />
    </template>
  </ElTableColumn>
</template>

<style scoped>
.epay-column-header {
  display: flex;
  align-items: center;
  gap: 4px;
}

.epay-column-header > span {
  flex: 1;
  min-width: 0;
}
</style>
