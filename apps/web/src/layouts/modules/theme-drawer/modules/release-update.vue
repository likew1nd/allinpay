<script setup lang="ts">
import ReleasePanel from '@/components/custom/release-panel.vue';
import { useAuth } from '@/hooks/business/auth';

defineOptions({ name: 'ReleaseUpdate' });

const { hasAuth } = useAuth();
</script>

<template>
  <section v-if="hasAuth('system-setting:read')" class="appearance-group" aria-labelledby="appearance-release-title">
    <h3 id="appearance-release-title" class="appearance-title">版本更新</h3>
    <ReleasePanel kind="center" />
  </section>
</template>
