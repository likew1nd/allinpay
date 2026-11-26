<script setup lang="ts">
defineOptions({ name: 'SettingItem' });

interface Props {
  /** Label */
  label: string;
}

defineProps<Props>();
</script>

<template>
  <div class="appearance-setting">
    <div class="appearance-setting-label">
      <span>{{ label }}</span>
      <slot name="suffix"></slot>
    </div>
    <div class="appearance-setting-control">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
.appearance-setting {
  display: grid;
  min-width: 0;
  min-height: 48px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.appearance-setting-label {
  min-width: 0;
  padding-block: 8px;
  color: var(--epay-text);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.appearance-setting-control {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
}
</style>
