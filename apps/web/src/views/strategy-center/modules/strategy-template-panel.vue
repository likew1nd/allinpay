<script setup lang="ts" generic="T extends { id: string; name: string; description?: string }">
import EpayKeywordSearch from '@/components/custom/epay-keyword-search.vue';
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  templates: T[];
  emptyText: string;
  canCreate?: boolean;
  busy?: boolean;
}>(), { canCreate: true });
const emit = defineEmits<{ create: []; menu: [event: MouseEvent, template?: T] }>();
const selected = defineModel<string>({ required: true });
const search = defineModel<string>('search', { default: '' });
const templateItems = computed(() => {
  const query = search.value.trim().toLowerCase();
  return props.templates.filter(item => `${item.name} ${item.description ?? ''}`.toLowerCase().includes(query));
});
</script>

<template>
  <section class="tree-panel template-panel" @contextmenu.prevent="emit('menu', $event)">
    <div class="panel-heading">
      <div>
        <strong>策略模板</strong>
        <span class="panel-count">{{ templates.length }} 个</span>
      </div>
      <ElButton v-if="canCreate" size="small" :disabled="busy" @click="emit('create')">新增模板</ElButton>
    </div>
    <div class="panel-search">
      <EpayKeywordSearch v-model="search" placeholder="搜索模板" />
    </div>
    <div class="panel-hint">点击模板，在中栏预览规则；应用并保存后生效。</div>
    <div class="tree-scroll template-list">
      <div
        v-for="template in templateItems"
        :key="template.id"
        class="template-card"
        :class="{ selected: selected === template.id }"
        tabindex="0"
        role="button"
        :aria-pressed="selected === template.id"
        @click="selected = template.id"
        @keydown.enter.self.prevent="selected = template.id"
        @keydown.space.self.prevent="selected = template.id"
        @contextmenu.prevent.stop="emit('menu', $event, template)"
      >
        <div class="template-title">
          <strong>{{ template.name }}</strong>
          <button type="button" class="node-more" aria-haspopup="menu" aria-label="模板操作" @click.stop="emit('menu', $event, template)">⋯</button>
        </div>
        <p v-if="template.description" class="template-description">
          {{ template.description }}
        </p>
        <div class="template-constraints"><slot name="summary" :template="template" /></div>
      </div>
      <ElEmpty v-if="!templateItems.length" :image-size="70" :description="emptyText" />
    </div>
  </section>
</template>

<style scoped src="./strategy-panel.css"></style>
<style scoped>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  overflow-wrap: anywhere;
  margin-bottom: 8px;
  font-size: 13px;
}
.template-description {
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.template-constraints {
  color: var(--el-text-color-secondary);
  font-size: 11px;
  margin-top: 12px;
  line-height: 1.7;
}

@container (max-width: 1050px) {
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
@container (max-width: 640px) {
  .template-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
