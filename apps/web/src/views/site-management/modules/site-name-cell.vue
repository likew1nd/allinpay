<script setup lang="ts">
import { RouterLink } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';

defineProps<{ name: string; baseUrl: string; to?: RouteLocationRaw }>();
</script>

<template>
  <component :is="to ? RouterLink : 'div'" :to="to" class="epay-site-cell">
    <span class="epay-color-icon" aria-hidden="true">
      <SvgIcon icon="tabler:world" />
    </span>
    <div>
      <strong>{{ name }}</strong>
      <small>{{ baseUrl }}</small>
    </div>
  </component>
</template>
