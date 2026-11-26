<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { CollectorInput, CollectorRecord } from '@/service/api';
import { createCollector, fetchCollectorToken, resetCollectorToken, updateCollector } from '@/service/api';
import { useForm, useFormRules } from '@/hooks/common/form';
import { useAuth } from '@/hooks/business/auth';
import { $t } from '@/locales';

const props = defineProps<{ operateType: UI.TableOperateType; rowData?: CollectorRecord | null }>();
const visible = defineModel<boolean>('visible', { default: false });
const emit = defineEmits<{ submitted: [id: string] }>();
const { formRef, validate, restoreValidation } = useForm();
const { defaultRequiredRule } = useFormRules();
const { hasAuth } = useAuth();
const saving = ref(false);
const resettingToken = ref(false);
const revealedToken = ref('');
const tokenLoading = ref(false);
const tokenLoadFailed = ref(false);
let tokenRequest = 0;
const isEdit = computed(() => props.operateType === 'edit');

// 生成随机字符串
function genId() {
  return 'collector-' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}
function genToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const model = ref({ name: '', customId: genId(), customToken: genToken() });

const rules = computed(() => ({
  name: defaultRequiredRule,
  customId: [{ pattern: /^[a-zA-Z0-9-]{4,64}$/, message: '仅允许字母、数字和连字符，长度 4-64', trigger: 'blur' }],
  customToken: [{ min: 16, max: 256, message: '长度需在 16-256 字符之间', trigger: 'blur' }],
}));

function clearToken() {
  revealedToken.value = '';
  tokenLoading.value = false;
  tokenLoadFailed.value = false;
  tokenRequest += 1;
}

watch([visible, () => props.rowData?.id], ([open]) => {
  clearToken();
  if (!open) { model.value.customToken = ''; return; }
  restoreValidation();
  if (isEdit.value) {
    model.value = { name: props.rowData?.name ?? '', customId: '', customToken: '' };
    void loadToken();
  } else {
    model.value = { name: '', customId: genId(), customToken: genToken() };
  }
});

async function loadToken() {
  if (tokenLoading.value || resettingToken.value || !visible.value || !isEdit.value || !props.rowData || !hasAuth('collector:update')) return;
  const id = props.rowData.id;
  const request = ++tokenRequest;
  tokenLoading.value = true;
  try {
    const result = await fetchCollectorToken(id);
    // 关闭或切换采集端后，不接收迟到的明文。
    if (request !== tokenRequest || !visible.value || props.rowData?.id !== id) return;
    tokenLoadFailed.value = Boolean(result.error);
    if (!result.error) revealedToken.value = result.data.token;
  } catch {
    if (request === tokenRequest) tokenLoadFailed.value = true;
  } finally {
    if (request === tokenRequest) tokenLoading.value = false;
  }
}

async function showResetToken() {
  if (resettingToken.value || tokenLoading.value || saving.value || !isEdit.value || !props.rowData || !hasAuth('collector:update')) return;
  const id = props.rowData.id;
  resettingToken.value = true;
  try {
    try {
      await ElMessageBox.confirm(
        '重置后旧 Token 立即失效，Agent 需更新 .env 中的 COLLECTOR_TOKEN 后重启。是否继续？',
        '重置 Token',
        { type: 'warning', confirmButtonText: '确认重置', cancelButtonText: '取消' }
      );
    } catch { return; }
    clearToken();
    const result = await resetCollectorToken(id);
    if (result.error) { tokenLoadFailed.value = true; return; }
    revealedToken.value = result.data.token;
    window.$message?.success('Token 已重置，请更新 Agent 配置');
  } finally {
    resettingToken.value = false;
  }
}

async function submit() {
  if (saving.value || resettingToken.value || (isEdit.value && !props.rowData)) return;
  try { await validate(); } catch { return; }
  saving.value = true;
  try {
    const payload: CollectorInput = isEdit.value
      ? { name: model.value.name }
      : { name: model.value.name, customId: model.value.customId, customToken: model.value.customToken };
    const result = isEdit.value && props.rowData
      ? await updateCollector(props.rowData.id, payload)
      : await createCollector(payload);
    if (result.error) return;
    window.$message?.success($t('page.collector.saved'));
    visible.value = false;
    emit('submitted', result.data.id);
  } finally {
    saving.value = false;
    if (!isEdit.value) model.value.customToken = '';
  }
}
</script>

<template>
  <ElDrawer
    v-model="visible"
    :title="$t(isEdit ? 'page.collector.edit' : 'page.collector.add')"
    size="min(100vw, 480px)"
    :close-on-click-modal="!saving && !resettingToken"
    :close-on-press-escape="!saving && !resettingToken"
    :show-close="!saving && !resettingToken"
  >
    <ElForm ref="formRef" :model="model" :rules="rules" label-position="top" :disabled="saving || resettingToken" @submit.prevent="submit">
      <ElFormItem :label="$t('page.collector.name')" prop="name">
        <ElInput v-model.trim="model.name" :maxlength="100" />
      </ElFormItem>

      <template v-if="isEdit && rowData">
        <ElFormItem label="采集端 ID">
          <ElInput :model-value="rowData.id" readonly class="font-mono" />
        </ElFormItem>
        <ElFormItem label="Token">
          <div class="w-full flex flex-wrap items-center gap-12px">
            <span v-if="hasAuth('collector:update')" class="min-w-0 flex-1 break-all font-mono">
              {{ tokenLoading ? '正在读取…' : revealedToken || (tokenLoadFailed ? '读取失败，请重新打开编辑' : '暂无 Token') }}
            </span>
            <span v-else class="text-muted">无权限查看 Token</span>
            <ElButton
              v-if="hasAuth('collector:update')"
              link
              type="primary"
              :loading="resettingToken"
              :disabled="tokenLoading"
              @click="showResetToken"
            >
              重置 Token
            </ElButton>
          </div>
        </ElFormItem>
      </template>

      <template v-if="!isEdit">
        <ElFormItem prop="customId">
          <template #label>
            <span>采集端 ID</span>
          </template>
          <div class="flex items-center gap-8px w-full">
            <ElInput v-model.trim="model.customId" :maxlength="64" class="flex-1 font-mono" />
            <ElButton :icon="'Refresh'" circle title="重新生成" @click="model.customId = genId()" />
          </div>
        </ElFormItem>
        <ElFormItem prop="customToken">
          <template #label>
            <span>Token</span>
          </template>
          <div class="flex items-center gap-8px w-full">
            <ElInput v-model.trim="model.customToken" :maxlength="256" class="flex-1 font-mono" show-password />
            <ElButton :icon="'Refresh'" circle title="重新生成" @click="model.customToken = genToken()" />
          </div>
          <p class="mt-4px text-12px text-#86909c">创建后请将 Token 填入 Agent 的 .env 文件</p>
        </ElFormItem>
      </template>
    </ElForm>
    <template #footer>
      <ElSpace>
        <ElButton :disabled="saving || resettingToken" @click="visible = false">{{ $t('common.cancel') }}</ElButton>
        <ElButton type="primary" :loading="saving" :disabled="resettingToken" @click="submit">{{ $t('common.confirm') }}</ElButton>
      </ElSpace>
    </template>
  </ElDrawer>
</template>
