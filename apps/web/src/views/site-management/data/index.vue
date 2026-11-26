<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SiteDataList from './modules/site-data-list.vue';
import SiteWorkspace from './modules/site-workspace.vue';
const route = useRoute();
const siteId = computed(() => (typeof route.query.siteId === 'string' ? route.query.siteId : ''));
</script>

<template>
  <div class="flex-col-stretch gap-16px">
    <SiteDataList v-show="!siteId" :active="!siteId" />
    <SiteWorkspace v-if="siteId" :key="siteId" :site-id="siteId" />
  </div>
</template>
