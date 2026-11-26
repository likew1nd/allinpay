<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
export interface MenuItem {
  label: string;
  run: () => void | Promise<void>;
  disabled?: boolean;
  danger?: boolean;
}
const visible = ref(false);
const position = ref({ left: '0px', top: '0px' });
const items = ref<MenuItem[]>([]);
const root = ref<HTMLElement>();
async function open(event: MouseEvent, choices: MenuItem[]) {
  event.preventDefault();
  event.stopPropagation();
  items.value = choices;
  visible.value = true;
  position.value = {
    left: `${Math.max(8, Math.min(event.clientX, window.innerWidth - 230))}px`,
    top: `${Math.max(8, Math.min(event.clientY, window.innerHeight - choices.length * 35 - 24))}px`
  };
  await nextTick();
  root.value?.focus();
}
function close(event: Event) {
  if (!root.value?.contains(event.target as Node)) visible.value = false;
}
function choose(item: MenuItem) {
  if (!item.disabled) {
    visible.value = false;
    item.run();
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', close);
  window.addEventListener('blur', close);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', close);
  window.removeEventListener('blur', close);
});
defineExpose({ open });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="root"
      class="tree-context-menu"
      :style="position"
      role="menu"
      tabindex="-1"
      @keydown.esc="visible = false"
    >
      <button
        v-for="item in items"
        :key="item.label"
        type="button"
        role="menuitem"
        :disabled="item.disabled"
        :class="{ danger: item.danger }"
        @click="choose(item)"
      >
        {{ item.label }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.tree-context-menu {
  position: fixed;
  z-index: 4000;
  min-width: 218px;
  padding: 6px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color-overlay);
  box-shadow: var(--el-box-shadow-light);
  outline: none;
}
button {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  text-align: left;
  cursor: pointer;
  font-size: 13px;
}
button:hover,
button:focus-visible {
  background: var(--el-fill-color-light);
}
button:disabled {
  color: var(--el-text-color-disabled);
  cursor: not-allowed;
}
button.danger:not(:disabled) {
  color: var(--el-color-danger);
}
</style>
