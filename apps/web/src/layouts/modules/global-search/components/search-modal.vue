<script lang="ts" setup>
import { computed, nextTick, ref, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { onKeyStroke, useDebounceFn } from '@vueuse/core';
import type { InputInstance } from 'element-plus';
import { useRouteStore } from '@/store/modules/route';
import { useAppStore } from '@/store/modules/app';
import { $t } from '@/locales';
import SearchResult from './search-result.vue';
import SearchFooter from './search-footer.vue';

defineOptions({ name: 'SearchModal' });

const router = useRouter();
const appStore = useAppStore();
const routeStore = useRouteStore();

const isMobile = computed(() => appStore.isMobile);

const keyword = ref('');
const activePath = ref('');
const resultOptions = shallowRef<App.Global.Menu[]>([]);

const handleSearch = useDebounceFn(search, 300);

const visible = defineModel<boolean>('show', { required: true });

const searchInput = ref<InputInstance>();

function search() {
  if (!visible.value) return;
  resultOptions.value = routeStore.searchMenus.filter(menu => {
    const trimKeyword = keyword.value.toLocaleLowerCase().trim();
    const title = (menu.i18nKey ? $t(menu.i18nKey) : menu.label).toLocaleLowerCase();
    return trimKeyword && title.includes(trimKeyword);
  });

  activePath.value = resultOptions.value[0]?.routePath ?? '';
}

function handleClose() {
  visible.value = false;
}

function resetSearch() {
  // 退出完成再清理，快速重开时保留当前输入。
  if (visible.value) return;
  resultOptions.value = [];
  keyword.value = '';
  activePath.value = '';
}

/** key up */
function handleUp() {
  const { length } = resultOptions.value;
  if (length === 0) return;

  const index = getActivePathIndex();
  if (index === -1) return;

  const activeIndex = index === 0 ? length - 1 : index - 1;

  activePath.value = resultOptions.value[activeIndex].routePath;
}

/** key down */
function handleDown() {
  const { length } = resultOptions.value;
  if (length === 0) return;

  const index = getActivePathIndex();
  if (index === -1) return;

  const activeIndex = index === length - 1 ? 0 : index + 1;

  activePath.value = resultOptions.value[activeIndex].routePath;
}

function getActivePathIndex() {
  return resultOptions.value.findIndex(item => item.routePath === activePath.value);
}

/** key enter */
function handleEnter() {
  if (resultOptions.value?.length === 0 || activePath.value === '') return;
  handleClose();
  router.push(activePath.value);
}

function registerShortcut() {
  onKeyStroke(['Escape', 'Enter', 'ArrowUp', 'ArrowDown'], event => {
    if (!visible.value || event.isComposing) return;
    event.preventDefault();
    if (event.key === 'Escape') handleClose();
    else if (event.key === 'Enter') handleEnter();
    else if (event.key === 'ArrowUp') handleUp();
    else handleDown();
  });
}

/** open dialog and set input focus */
async function setFocus() {
  await nextTick();
  if (visible.value) searchInput.value?.focus();
}

registerShortcut();
</script>

<template>
  <ElDialog
    v-model="visible"
    :show-close="false"
    append-to-body
    class="search-modal"
    width="630px"
    @open-auto-focus="setFocus"
    @closed="resetSearch"
  >
    <ElInput
      ref="searchInput"
      v-model="keyword"
      clearable
      :placeholder="$t('common.keywordSearch')"
      @input="handleSearch"
    >
      <template #prefix>
        <icon-uil-search class="text-15px" />
      </template>
      <template v-if="isMobile" #append>
        <ElButton type="primary" plain @click="handleClose">{{ $t('common.cancel') }}</ElButton>
      </template>
    </ElInput>

    <div>
      <ElEmpty v-if="resultOptions.length === 0" :description="$t('common.noData')" :image-size="50" />
      <SearchResult v-else v-model:path="activePath" :options="resultOptions" @enter="handleEnter" />
    </div>
    <template #footer>
      <SearchFooter v-if="!isMobile" />
    </template>
  </ElDialog>
</template>

<style lang="scss">
.search-modal {
  .el-dialog__header {
    display: none;
  }
  .el-dialog__body {
    padding: 10px 15px 0;
  }
  .el-dialog__footer {
    border-top-width: 1px;
  }
}
</style>
