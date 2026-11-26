<script setup lang="ts">
defineProps<{
  checked: boolean;
  label: string;
  loading?: boolean;
  disabled?: boolean;
}>();
const emit = defineEmits<{ change: [checked: boolean] }>();
</script>

<template>
  <button
    type="button"
    class="epay-status-switch"
    :class="{ 'is-checked': checked, 'is-loading': loading }"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    :aria-busy="Boolean(loading)"
    :disabled="disabled || loading"
    @click="emit('change', !checked)"
  >
    <span class="epay-status-switch__track" aria-hidden="true">
      <span class="epay-status-switch__thumb">
        <span class="epay-status-switch__face">{{ checked ? 'ON' : 'OFF' }}</span>
        <span v-if="loading" class="epay-status-switch__spinner" aria-hidden="true"></span>
      </span>
    </span>
  </button>
</template>

<style scoped>
/* 滑钮动效参考 Uiverse.io / JulioCodesSM，颜色沿用后台主题。 */
.epay-status-switch {
  --switch-color: var(--epay-danger);
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: middle;
  width: 64px;
  height: 44px;
  padding: 7px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  transition:
    background-color 180ms ease,
    opacity 180ms ease;
}
.epay-status-switch.is-checked {
  --switch-color: var(--epay-success);
}
.epay-status-switch__track {
  position: relative;
  display: block;
  flex-shrink: 0;
  width: 50px;
  height: 20px;
  border-radius: 30px;
  background: color-mix(in srgb, var(--switch-color) 18%, var(--epay-surface));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--switch-color) 42%, var(--epay-edge));
  transition:
    background-color 250ms ease,
    box-shadow 180ms ease;
}
.epay-status-switch__thumb {
  box-sizing: border-box;
  position: absolute;
  top: -4px;
  left: 0;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 2px solid var(--epay-surface);
  border-radius: 50%;
  color: var(--epay-surface);
  background: var(--switch-color);
  box-shadow: 0 2px 5px color-mix(in srgb, var(--switch-color) 28%, transparent);
  transition:
    background-color 250ms ease,
    transform 250ms ease-in-out;
}
.epay-status-switch.is-checked .epay-status-switch__thumb {
  transform: translateX(22px);
}
.epay-status-switch__face {
  font:
    600 9px/1 system-ui,
    sans-serif;
  transition: transform 250ms ease-in-out;
}
.epay-status-switch.is-checked .epay-status-switch__face {
  transform: rotate(360deg);
}
@media (hover: hover) {
  .epay-status-switch:not(:disabled):hover {
    background: color-mix(in srgb, var(--switch-color) 8%, transparent);
  }
}
.epay-status-switch:not(:disabled):active .epay-status-switch__track {
  box-shadow: inset 0 0 0 2px var(--switch-color);
}
.epay-status-switch:focus-visible {
  outline: 2px solid var(--epay-blue);
  outline-offset: -2px;
}
.epay-status-switch:disabled:not(.is-loading) {
  opacity: 0.5;
  cursor: not-allowed;
}
.epay-status-switch.is-loading {
  cursor: progress;
}
.epay-status-switch__spinner {
  box-sizing: border-box;
  position: absolute;
  top: -3px;
  right: -2px;
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: epay-switch-spin 700ms linear infinite;
}
@keyframes epay-switch-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
