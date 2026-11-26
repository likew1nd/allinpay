<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
onMounted(() => {
  router.replace({ path: '/site-management/list', query: route.query, hash: route.hash });
});
</script>

<template><div /></template>
