<script setup lang="ts">
import EnvironmentList from './environment-list.vue';

defineProps<{ collectorId: string }>();
</script>

<template>
  <EnvironmentList :key="collectorId" :collector-id="collectorId" />
</template>