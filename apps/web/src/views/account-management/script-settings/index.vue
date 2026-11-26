<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

onMounted(() => {
  router.replace({ path: '/account-management/collectors', query: { scriptSettings: '1' } });
});
</script>

<template>
  <div />
</template>
