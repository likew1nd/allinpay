<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import type { TreeInstance } from 'element-plus';
import { fetchAssignRoleApiPermissions, fetchGetApiEndpointTree, fetchGetRoleApiPermissions } from '@/service/api';
import type { ApiEndpoint } from '@/service/api';
import { $t } from '@/locales';
const props = defineProps<{ roleId: string; roleCode: string }>();
const visible = defineModel<boolean>('visible', { default: false });
interface Node {
  id: string;
  label: string;
  resource?: string;
  action?: string;
  children?: Node[];
}
function endpointLabel(row: ApiEndpoint): string {
  if (!row.resource && !row.action) {
    const controller = row.controller || row.id.replace(/^controller-/, '');
    return $t(('page.manage.role.apiControllers.' + controller) as App.I18n.I18nKey, row.summary || controller);
  }
  if (row.summary?.trim()) {
    if (/[㐀-鿿]/.test(row.summary)) return row.summary;
    return $t(('page.manage.role.apiSummaries.' + row.summary) as App.I18n.I18nKey, row.summary);
  }
  const resource = $t(('page.manage.role.apiResources.' + row.resource) as App.I18n.I18nKey, row.resource);
  const action = $t(('page.manage.role.apiActions.' + row.action) as App.I18n.I18nKey, row.action);
  // 保留方法和路径，区分使用相同权限的不同接口。
  return $t('page.manage.role.apiPermissionLabel', { resource, action }) + ' · ' + row.method + ' ' + row.path;
}
const tree = ref<Node[]>([]);
const treeRef = ref<TreeInstance>();
const loading = ref(false);
const loaded = ref(false);
const saving = ref(false);
async function init() {
  loading.value = true;
  loaded.value = false;
  tree.value = [];
  try {
    const [endpoints, permissions] = await Promise.all([
      fetchGetApiEndpointTree(),
      fetchGetRoleApiPermissions(props.roleCode)
    ]);
    if (endpoints.error || permissions.error) return;
    function convert(row: ApiEndpoint): Node {
      return {
        id: row.id,
        label: endpointLabel(row),
        resource: row.resource,
        action: row.action,
        children: row.children?.filter(child => child.resource && child.action).map(convert)
      };
    }
    tree.value = endpoints.data.map(convert);
    const granted = permissions.data;
    const checks: string[] = [];
    function collect(rows: Node[]) {
      rows.forEach(row => {
        if (row.children?.length) collect(row.children);
        else if (granted.some(item => item.v1 === row.resource && item.v2 === row.action)) checks.push(row.id);
      });
    }
    collect(tree.value);
    await nextTick();
    treeRef.value?.setCheckedKeys(checks);
    loaded.value = true;
  } finally {
    loading.value = false;
  }
}
async function submit() {
  if (!loaded.value || !treeRef.value) return;
  saving.value = true;
  try {
    const ids = (treeRef.value.getCheckedNodes(true) as Node[])
      .filter(row => row.resource && row.action)
      .map(row => row.id);
    const { error } = await fetchAssignRoleApiPermissions(props.roleId, ids);
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
  <ElDialog v-model="visible" :title="$t('page.manage.role.apiAuth')" class="w-600px">
    <ElTree
      ref="treeRef"
      v-loading="loading"
      :data="tree"
      show-checkbox
      node-key="id"
      class="h-400px overflow-y-auto"
    />
    <template #footer>
      <ElSpace>
        <ElButton @click="visible = false">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :disabled="!loaded" :loading="saving" @click="submit">
          {{ $t('common.confirm') }}
        </ElButton>
      </ElSpace>
    </template>
  </ElDialog>
</template>
