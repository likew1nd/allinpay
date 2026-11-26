<script setup lang="ts">
import { nextTick, onActivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  label: string;
  options: { value: string; label: string; count?: number }[];
}>();
const model = defineModel<string>({ required: true });
const root = ref<HTMLElement>();
const ready = ref(false);
const indicator = ref<Record<string, string>>({ opacity: '0' });
let observer: ResizeObserver | undefined;

async function measure() {
  await nextTick();
  const active = root.value?.querySelector<HTMLElement>('[aria-pressed="true"]');
  if (!active) return;
  indicator.value = { transform: `translateX(${active.offsetLeft}px)`, width: `${active.offsetWidth}px`, opacity: '1' };
  requestAnimationFrame(() => {
    ready.value = true;
  });
}

watch([model, () => props.options], measure, { deep: true, flush: 'post' });
onMounted(() => {
  measure();
  observer = new ResizeObserver(measure);
  if (root.value) observer.observe(root.value);
});
onActivated(measure);
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="root" class="epay-segments" :class="{ 'is-ready': ready }" role="group" :aria-label="label">
    <span class="epay-segment-indicator" :style="indicator" aria-hidden="true"></span>
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="{ active: model === option.value }"
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
      <small v-if="option.count !== undefined">{{ option.count }}</small>
    </button>
  </div>
</template>
