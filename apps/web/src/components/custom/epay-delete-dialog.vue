<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DeleteCheck } from '@/service/api';
import { DELETE_CONFIRM_TEXT } from '@/service/api';

/**
 * 统一的删除弹窗：收款账号、转账策略、站点策略共用。
 * 打开时先调用 check 检查占用：
 * - 有占用：列出哪些策略/环境/执行对象/转账在使用，提示需要先脱离，只能关闭；
 * - 无占用：告知删除会自动处理的事项，并要求手动输入“删除”二字才能确认。
 * 真正的拦截以服务端为准，这里只负责把原因讲清楚。
 */
const props = defineProps<{
  /** 对象类型名称，如“收款账号”“转账策略”“站点策略” */
  kind: string;
  /** 对象 ID；为空时不检查 */
  targetId: string;
  /** 对象展示名称（检查返回前先用它显示标题） */
  targetName: string;
  check: (id: string) => Promise<{ data: DeleteCheck | null; error: unknown }>;
  remove: (id: string) => Promise<{ error: unknown }>;
}>();
const visible = defineModel<boolean>('visible', { required: true });
const emit = defineEmits<{ deleted: [id: string] }>();

const loading = ref(false);
const deleting = ref(false);
const loadFailed = ref(false);
const result = ref<DeleteCheck | null>(null);
const typed = ref('');
// 请求竞态保护：快速关了再开另一个对象时，丢弃过期的检查结果
let version = 0;

const matched = computed(() => typed.value.trim() === DELETE_CONFIRM_TEXT);
const blocked = computed(() => Boolean(result.value && !result.value.canDelete));

async function load() {
  version += 1;
  const current = version;
  result.value = null;
  typed.value = '';
  loadFailed.value = false;
  if (!props.targetId) return;
  loading.value = true;
  try {
    const response = await props.check(props.targetId);
    if (current !== version) return;
    if (response.error || !response.data) loadFailed.value = true;
    else result.value = response.data;
  } finally {
    if (current === version) loading.value = false;
  }
}

watch(visible, value => {
  if (value) void load();
});

async function submit() {
  if (deleting.value || !matched.value || blocked.value || !result.value) return;
  deleting.value = true;
  try {
    const response = await props.remove(props.targetId);
    // 失败时请求层已经弹出了服务端的明细提示；重新检查一次，让弹窗展示最新的占用情况
    if (response.error) {
      await load();
      return;
    }
    visible.value = false;
    window.$message?.success(`${props.kind}已删除`);
    emit('deleted', props.targetId);
  } finally {
    deleting.value = false;
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="`删除${kind}`"
    width="min(560px, 95vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!deleting"
    :show-close="!deleting"
    destroy-on-close
  >
    <p class="mb-12px break-all font-bold">{{ result?.name || targetName }}</p>

    <div v-if="loading" v-loading="true" class="min-h-96px" element-loading-text="正在检查是否有占用…" />

    <ElAlert
      v-else-if="loadFailed"
      type="error"
      show-icon
      :closable="false"
      title="检查失败，请稍后重试"
    >
      <ElButton link type="primary" @click="load">重新检查</ElButton>
    </ElAlert>

    <template v-else-if="result && blocked">
      <ElAlert type="error" show-icon :closable="false" :title="`无法删除：请先脱离以下绑定或占用，再回来删除${kind}`" />
      <section v-for="blocker in result.blockers" :key="blocker.kind" class="blocker">
        <h4>{{ blocker.title }}</h4>
        <ul>
          <li v-for="item in blocker.items" :key="item.id">
            <span class="blocker__label">{{ item.label }}</span>
            <span v-if="item.hint" class="blocker__hint">{{ item.hint }}</span>
          </li>
        </ul>
      </section>
    </template>

    <template v-else-if="result">
      <ElAlert type="warning" show-icon :closable="false" :title="`确认删除这个${kind}吗？`">
        <ul v-if="result.willAutoHandle.length" class="auto-handle">
          <li v-for="text in result.willAutoHandle" :key="text">{{ text }}</li>
        </ul>
      </ElAlert>
      <p class="mb-8px mt-16px">
        请在下方输入
        <strong class="confirm-word">{{ DELETE_CONFIRM_TEXT }}</strong>
        二字确认：
      </p>
      <ElInput
        v-model="typed"
        :disabled="deleting"
        :placeholder="`输入“${DELETE_CONFIRM_TEXT}”`"
        maxlength="10"
        autocomplete="off"
        @keyup.enter="submit"
      />
    </template>

    <template #footer>
      <ElButton :disabled="deleting" @click="visible = false">{{ blocked || loadFailed ? '我知道了' : '取消' }}</ElButton>
      <ElButton
        v-if="result && !blocked"
        type="danger"
        :loading="deleting"
        :disabled="!matched"
        @click="submit"
      >
        确认删除
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped>
.blocker {
  margin-top: 16px;
}
.blocker h4 {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.blocker ul {
  margin: 0;
  padding: 0;
  max-height: 240px;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--epay-edge);
  border-radius: 8px;
}
.blocker li {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  padding: 8px 12px;
}
.blocker li + li {
  border-top: 1px solid var(--epay-edge);
}
.blocker__label {
  word-break: break-all;
}
.blocker__hint {
  font-size: 12px;
  opacity: 0.65;
}
.auto-handle {
  margin: 8px 0 0;
  padding-left: 18px;
}
.confirm-word {
  color: var(--epay-danger);
}
</style>
