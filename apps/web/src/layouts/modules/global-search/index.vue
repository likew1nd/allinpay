<script lang="ts" setup>
import { onKeyStroke } from '@vueuse/core';
import { useBoolean } from '@sa/hooks';
import SearchModal from './components/search-modal.vue';
defineOptions({ name: 'GlobalSearch' });
const { bool: show, toggle, setTrue } = useBoolean();
onKeyStroke('k', event => {
  if (event.ctrlKey || event.metaKey) { event.preventDefault(); setTrue(); }
});
</script>

<template>
  <button class="epay-global-search" aria-label="搜索菜单与页面（Ctrl K）" @click="toggle">
    <icon-uil-search /><span>搜索功能、菜单与页面</span><kbd>Ctrl K</kbd>
  </button>
  <SearchModal v-model:show="show" />
</template>
