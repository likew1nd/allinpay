<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
const route = useRoute();
const router = useRouter();
onMounted(() => {
  router.replace({ path: '/site-management/data', query: { ...route.query, tab: 'polling-groups' } });
});
</script>

<template><div /></template>
