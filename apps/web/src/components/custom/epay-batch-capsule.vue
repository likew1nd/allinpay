<script setup lang="ts">
import { onActivated, onDeactivated, onMounted, ref } from 'vue';
import { $t } from '@/locales';

// 公共批量操作胶囊：勾选后悬浮在工作区底部居中，样式与环境列表的批量胶囊一致；操作按钮通过默认插槽传入。
defineOptions({ name: 'EpayBatchCapsule' });
defineProps<{ visible: boolean; count: number; busy?: boolean }>();
const emit = defineEmits<{ clear: [] }>();

// 胶囊挂在滚动区之外，保持相对工作区居中，并避开路由过渡的位移。
const target = ref<HTMLElement | 'body'>('body');
// 页面被 KeepAlive 缓存后隐藏，避免切走页面后胶囊残留。
const active = ref(true);
onMounted(() => {
  target.value = document.querySelector<HTMLElement>('.epay-workspace-shell') ?? 'body';
});
onActivated(() => {
  active.value = true;
});
onDeactivated(() => {
  active.value = false;
});
</script>

<template>
  <Teleport :to="target">
    <Transition name="epay-batch-capsule">
      <div
        v-if="visible && active"
        class="epay-batch-capsule"
        role="toolbar"
        :aria-label="$t('common.action')"
        :aria-busy="busy"
      >
        <span class="epay-batch-capsule__count" role="status" :aria-label="$t('page.collector.selectedCount', { count })">{{ count }}</span>
        <span class="epay-batch-capsule__divider" aria-hidden="true" />
        <div class="epay-batch-capsule__actions"><slot /></div>
        <span class="epay-batch-capsule__divider" aria-hidden="true" />
        <ElTooltip :content="$t('page.collector.clearSelection')">
          <ElButton text circle type="info" :aria-label="$t('page.collector.clearSelection')" :disabled="busy" @click="emit('clear')">
            <SvgIcon icon="tabler:x" class="text-18px" aria-hidden="true" />
          </ElButton>
        </ElTooltip>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.epay-batch-capsule {
  position: fixed;
  z-index: 30;
  bottom: calc(56px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  display: flex;
  width: max-content;
  max-width: calc(100% - 32px);
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--epay-blue) 22%, var(--epay-glass-edge));
  border-radius: 28px;
  color: var(--epay-text);
  background: var(--epay-glass);
  box-shadow:
    inset 0 1px var(--epay-glass-edge),
    0 0 0 4px color-mix(in srgb, var(--epay-blue) 6%, transparent),
    0 10px 28px color-mix(in srgb, var(--epay-blue) 18%, transparent),
    var(--epay-float-shadow);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  transform: translateX(-50%);
}

.epay-workspace-shell > .epay-batch-capsule {
  position: absolute;
}

.epay-batch-capsule__count {
  display: inline-flex;
  min-width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding-inline: 8px;
  border-radius: 16px;
  color: var(--epay-action-ink);
  background: var(--epay-soft);
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.epay-batch-capsule__divider {
  width: 1px;
  height: 20px;
  flex: none;
  background: var(--epay-edge);
  opacity: .7;
}

.epay-batch-capsule__actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
}

.epay-batch-capsule[role='toolbar'] .el-button {
  height: 36px;
  min-height: 36px;
  flex: none;
  margin: 0;
  padding-inline: 12px;
}

.epay-batch-capsule[role='toolbar'] .el-button.is-circle {
  width: 36px;
  padding: 0;
}

.epay-batch-capsule-enter-active,
.epay-batch-capsule-leave-active {
  transition: opacity 180ms ease, transform 180ms var(--epay-ease);
}

.epay-batch-capsule-enter-from,
.epay-batch-capsule-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px) scale(.98);
}

@media (max-width: 639px) {
  .epay-batch-capsule {
    max-width: calc(100% - 24px);
    gap: 6px;
  }

  .epay-batch-capsule[role='toolbar'] .el-button {
    padding-inline: 8px;
  }

  .epay-batch-capsule[role='toolbar'] .el-button.is-circle {
    padding: 0;
  }
}

@media (pointer: coarse) {
  .epay-batch-capsule[role='toolbar'] .el-button {
    min-width: 44px;
    min-height: 44px;
  }
}

/* 页面明确选择完整动效时优先于系统偏好。 */
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .epay-batch-capsule-enter-active,
  html:not([data-motion='full']) .epay-batch-capsule-leave-active {
    transition: none;
  }
}
</style>
