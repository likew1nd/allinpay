<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { TreeInstance } from 'element-plus';
import { fetchAssignRoleMenus, fetchGetMenuTree, fetchGetRoleMenus } from '@/service/api';
import { $t } from '@/locales';

const props = defineProps<{ roleId: string }>();
const visible = defineModel<boolean>('visible', { default: false });
const title = computed(() => $t('common.edit') + $t('page.manage.role.menuAuth'));
const treeRef = ref<TreeInstance>();
const tree = ref<Api.SystemManage.MenuTree[]>([]);
const loading = ref(false);
const saving = ref(false);
const loaded = ref(false);
async function init() {
  loading.value = true;
  loaded.value = false;
  tree.value = [];
  try {
    const [menus, checks] = await Promise.all([fetchGetMenuTree(), fetchGetRoleMenus(props.roleId)]);
    if (menus.error || checks.error) return;
    tree.value = menus.data;
    await nextTick();
    const granted = new Set(checks.data);
    treeRef.value?.setCheckedKeys([]);
    // Restore parent-only grants without selecting all their children.
    function restore(row: Api.SystemManage.MenuTree): boolean {
      const descendants = (row.children ?? []).map(restore).some(Boolean);
      if (granted.has(row.id) && !descendants) treeRef.value?.setChecked(row.id, true, false);
      return granted.has(row.id) || descendants;
    }
    tree.value.forEach(restore);
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}
async function handleSubmit() {
  if (!loaded.value || !treeRef.value) return;
  saving.value = true;
  try {
    const ids = [...treeRef.value.getCheckedKeys(), ...treeRef.value.getHalfCheckedKeys()].map(Number);
    const { error } = await fetchAssignRoleMenus(props.roleId, [...new Set(ids)]);
    if (error) return;
    window.$message?.success($t('common.modifySuccess'));
    visible.value = false;
  } finally {
    saving.value = false;
  }
}
watch(visible, val => {
  if (val) init();
});
</script>

<template>
  <ElDialog v-model="visible" :title="title" class="w-480px">
    <ElTree
      ref="treeRef"
      v-loading="loading"
      :data="tree"
      node-key="id"
      show-checkbox
      class="h-360px overflow-y-auto"
    />
    <template #footer>
      <ElSpace>
        <ElButton @click="visible = false">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="!loaded" @click="handleSubmit">
          {{ $t('common.confirm') }}
        </ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>
