<script setup lang="ts">
import { $t } from '@/locales';

defineOptions({ name: 'TableHeaderOperation' });

interface Props {
  disabledDelete?: boolean;
  loading?: boolean;
  hideAdd?: boolean;
  hideDelete?: boolean;
}

defineProps<Props>();

interface Emits {
  (e: 'add'): void;
  (e: 'delete'): void;
}

const emit = defineEmits<Emits>();

const columns = defineModel<UI.TableColumnCheck[]>('columns', {
  default: () => []
});

function add() {
  emit('add');
}

function batchDelete() {
  emit('delete');
}


</script>

<template>
  <ElSpace direction="horizontal" wrap justify="end" class="lt-sm:w-200px">
    <slot name="prefix"></slot>
    <slot name="default">
      <ElButton v-if="!hideAdd" plain type="primary" @click="add">
        <template #icon>
          <icon-ic-round-plus class="text-icon" />
        </template>
        {{ $t('common.add') }}
      </ElButton>
      <ElPopconfirm v-if="!hideDelete" :title="$t('common.confirmDelete')" @confirm="batchDelete">
        <template #reference>
          <ElButton type="danger" plain :disabled="disabledDelete">
            <template #icon>
              <icon-ic-round-delete class="text-icon" />
            </template>
            {{ $t('common.batchDelete') }}
          </ElButton>
        </template>
      </ElPopconfirm>
    </slot>
    <TableColumnSetting v-model:columns="columns" />
    <slot name="suffix"></slot>
  </ElSpace>
</template>

<style scoped></style>
