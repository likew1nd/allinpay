<script setup lang="ts">
import { computed } from 'vue';
import type { AccountMode } from '@/service/api';
import { $t } from '@/locales';

const props = defineProps<{
  value: AccountMode | null;
  label: string;
  hint?: string;
  disabled?: boolean;
  pending?: AccountMode | null;
}>();
const emit = defineEmits<{ change: [mode: AccountMode] }>();
const modes: AccountMode[] = ['OFF', 'MONITOR', 'TRANSFER'];
// 提交目标只驱动动效，真实模式仍由接口确认；失败时自然滑回原位。
const visualMode = computed(() => props.pending ?? props.value);
const activeIndex = computed(() => visualMode.value === null ? -1 : modes.indexOf(visualMode.value));
const options = computed(() => [
  { value: 'OFF' as const, label: $t('page.collector.modeOff'), hint: $t('page.collector.modeOffHint') },
  { value: 'MONITOR' as const, label: $t('page.collector.modeMonitor'), hint: $t('page.collector.modeMonitorHint') },
  { value: 'TRANSFER' as const, label: $t('page.collector.modeTransfer'), hint: $t('page.collector.modeTransferHint') }
]);
</script>

<template>
  <div
    class="environment-mode-switch"
    :class="{ 'is-unset': visualMode === null, 'is-busy': Boolean(pending) }"
    :data-mode="visualMode"
    :style="{ '--mode-index': Math.max(0, activeIndex) }"
    role="group"
    :aria-label="hint ? label + '：' + hint : label"
    :aria-busy="Boolean(pending)"
    :title="hint"
  >
    <span class="environment-mode-switch__thumb" aria-hidden="true" />
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="environment-mode-switch__option"
      :class="{ 'is-selected': visualMode === option.value, 'is-pending': pending === option.value }"
      :aria-pressed="value === option.value"
      :aria-label="option.hint"
      :title="option.hint"
      :disabled="disabled || Boolean(pending)"
      @click="emit('change', option.value)"
    >
      <span class="environment-mode-switch__label">{{ option.label }}</span>
      <span class="environment-mode-switch__pending-indicator" :class="{ 'is-visible': pending === option.value }" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.environment-mode-switch {
  --mode-fill: color-mix(in srgb, var(--epay-blue) 84%, #000);
  position: relative;
  isolation: isolate;
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  min-width: 174px;
  box-sizing: border-box;
  overflow: hidden;
  border: 1px solid var(--epay-edge);
  border-radius: 100px;
  background: var(--epay-surface);
  vertical-align: middle;
}

.environment-mode-switch__thumb {
  position: absolute;
  z-index: 0;
  top: 0;
  bottom: 0;
  left: 0;
  width: calc(100% / 3);
  background: var(--mode-fill);
  transform: translateX(calc(var(--mode-index) * 100%));
  transition: transform 240ms var(--epay-ease, cubic-bezier(.22, 1, .36, 1)), opacity 160ms ease;
  pointer-events: none;
}

.environment-mode-switch.is-unset .environment-mode-switch__thumb { opacity: 0; }

.environment-mode-switch__option {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  min-height: 34px;
  place-items: center;
  padding: 0 10px;
  border: 0;
  border-radius: 0;
  color: var(--epay-text);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  transition: color 180ms, background 180ms;
}

.environment-mode-switch__option.is-selected {
  color: #fff;
  font-weight: 650;
}

.environment-mode-switch__option:not(:disabled):not(.is-selected):hover {
  color: var(--epay-text);
  background: color-mix(in srgb, var(--epay-track) 45%, transparent);
}

.environment-mode-switch__option:focus-visible {
  outline: 2px solid var(--mode-fill);
  outline-offset: -4px;
}

.environment-mode-switch__option.is-selected:focus-visible { outline-color: #fff; }
.environment-mode-switch__option:disabled { cursor: default; }
.environment-mode-switch.is-busy .environment-mode-switch__option { cursor: wait; }

.environment-mode-switch__pending-indicator {
  position: absolute;
  bottom: 2px;
  width: 16px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0;
  transition: opacity 160ms ease;
}

.environment-mode-switch__pending-indicator.is-visible {
  opacity: 1;
  animation: environment-mode-pending 900ms ease-in-out infinite;
}

@keyframes environment-mode-pending {
  50% { opacity: .35; transform: scaleX(.6); }
}

@media (pointer: coarse) {
  .environment-mode-switch__option { min-width: 44px; min-height: 44px; }
}

/* 页面明确选择完整动效时优先于系统偏好。 */
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .environment-mode-switch__thumb,
  html:not([data-motion='full']) .environment-mode-switch__option,
  html:not([data-motion='full']) .environment-mode-switch__pending-indicator { transition: none; }
  html:not([data-motion='full']) .environment-mode-switch__pending-indicator.is-visible { animation: none; }
}
</style>