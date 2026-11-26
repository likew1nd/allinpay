<script setup lang="ts">
import { computed } from 'vue';
import { VueDraggable } from 'vue-draggable-plus';
import { $t } from '@/locales';

defineOptions({ name: 'TableColumnSetting' });

const columns = defineModel<UI.TableColumnCheck[]>('columns', {
  required: true
});

const configurable = computed({
  get: () => columns.value.filter(item => item.visible),
  set: (items: UI.TableColumnCheck[]) => {
    let index = 0;
    columns.value = columns.value.map(item => item.visible ? items[index++] : item);
  }
});
const checkedCount = computed(() => configurable.value.filter(item => item.checked).length);
</script>

<template>
  <ElPopover placement="bottom-end" trigger="click" :width="220">
    <template #reference>
      <ElButton
        text
        size="small"
        class="epay-column-setting-button"
        :aria-label="$t('common.columnSetting')"
        :title="$t('common.columnSetting')"
        @click.stop
      >
        <template #icon>
          <icon-ant-design-setting-outlined class="text-icon" aria-hidden="true" />
        </template>
      </ElButton>
    </template>
    <div class="mb-4px font-medium">{{ $t('common.columnSetting') }}</div>
    <VueDraggable v-model="configurable" :animation="150" handle=".column-drag-handle" class="max-h-240px overflow-y-auto">
      <div
        v-for="item in configurable"
        :key="item.prop"
        class="h-36px flex-y-center rd-4px hover:(bg-primary bg-opacity-20)"
      >
        <icon-mdi-drag class="column-drag-handle mr-8px cursor-grab text-icon" aria-hidden="true" />
        <ElCheckbox
          v-model="item.checked"
          :disabled="item.checked && checkedCount === 1"
          :title="String(item.label)"
          class="min-w-0 flex-1"
        >
          {{ item.label }}
        </ElCheckbox>
      </div>
    </VueDraggable>
  </ElPopover>
</template>

<style scoped>
.epay-column-setting-button {
  width: 28px;
  height: 28px;
  padding: 0;
  flex: none;
}

:deep(.el-checkbox__label) {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
