<script setup lang="ts">
import { ref, watch } from 'vue';
import EpaySearchFields from './epay-search-fields.vue';

const keyword = defineModel<string>({ required: true });
defineProps<{ placeholder: string; label?: string }>();
const emit = defineEmits<{ search: [] }>();
const draft = ref(keyword.value);
watch(keyword, value => { draft.value = value; });

function submit() {
  keyword.value = draft.value.trim();
  emit('search');
}
function reset() {
  draft.value = '';
  submit();
}
</script>

<template>
  <EpaySearchFields @search="submit" @reset="reset">
    <ElInput v-model="draft" clearable :placeholder="placeholder" :aria-label="label || placeholder" />
  </EpaySearchFields>
</template>
