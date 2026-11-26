<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import SiteOrderTable from '../modules/site-order-table.vue';

const route = useRoute();
const siteId = computed(() => typeof route.query.siteId === 'string' ? route.query.siteId : undefined);
const channelCode = computed(() => typeof route.query.channelCode === 'string' ? route.query.channelCode : undefined);
</script>

<template>
  <SiteOrderTable :key="`${siteId ?? ''}:${channelCode ?? ''}`" :site-id="siteId" :channel-code="channelCode" active />
</template>
