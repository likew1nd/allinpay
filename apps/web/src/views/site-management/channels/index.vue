<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SiteChannelTable from '../modules/site-channel-table.vue';

const route = useRoute();
const router = useRouter();
const scopedLink = typeof route.query.siteId === 'string' && Boolean(route.query.siteId);
onMounted(() => {
  if (scopedLink) router.replace({ path: '/site-management/data', query: { ...route.query, tab: 'channels' } });
});
</script>

<template>
  <SiteChannelTable v-if="!scopedLink" active />
</template>
