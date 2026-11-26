<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { AdminLayoutProps } from '@sa/materials';

defineOptions({ inheritAttrs: false });
const props = defineProps<AdminLayoutProps>();
const emit = defineEmits<{ 'update:siderCollapse': [value: boolean] }>();
const route = useRoute();
const scrolled = ref(false);

const mobileOpen = computed({
  get: () => !props.siderCollapse,
  set: value => emit('update:siderCollapse', !value)
});
watch(
  () => route.fullPath,
  () => {
    if (props.isMobile) mobileOpen.value = false;
  }
);
watch(
  () => props.isMobile,
  value => {
    if (value) emit('update:siderCollapse', true);
  },
  { immediate: true }
);
</script>

<template>
  <div
    class="epay-layout epay-workspace"
    :class="{
      'is-collapsed': siderCollapse,
      'is-mobile': isMobile,
      'is-full': fullContent,
      'has-tabs': tabVisible,
      'is-scrolled': scrolled
    }"
    :style="{ '--epay-sidebar-width': `${siderCollapse ? siderCollapsedWidth : siderWidth}px` }"
  >
    <aside v-if="!isMobile && !fullContent && siderVisible" class="epay-workspace-sider">
      <slot name="sider" />
    </aside>
    <ElDrawer
      v-if="isMobile && !fullContent && siderVisible"
      v-model="mobileOpen"
      class="epay-mobile-navigation"
      direction="ltr"
      :size="260"
      :with-header="false"
      :close-on-press-escape="true"
      :destroy-on-close="false"
      aria-label="主导航"
    >
      <slot name="sider" />
    </ElDrawer>
    <section class="epay-workspace-shell" aria-label="运营工作区">
      <header v-if="!fullContent" class="epay-workspace-header"><slot name="header" /></header>
      <div v-if="tabVisible" class="epay-workspace-tabs"><slot name="tab" /></div>
      <main
        :id="scrollElId"
        class="epay-workspace-scroll"
        @scroll="scrolled = ($event.target as HTMLElement).scrollTop > 8"
      >
        <slot />
        <footer v-if="footerVisible"><slot name="footer" /></footer>
      </main>
    </section>
  </div>
</template>
