<script setup lang="ts">
import GlobalContent from '../modules/global-content/index.vue';

defineOptions({ name: 'BlankLayout' });
</script>

<template>
  <RouterView v-if="$route.name === 'login'" />
  <GlobalContent v-else :show-padding="false" />
</template>

<style scoped></style>
