<script setup lang="ts">
import type { StrategyDraft } from './workspace-model';

defineProps<{ disabled?: boolean }>();
const model = defineModel<StrategyDraft>({ required: true });
</script>

<template>
  <ElForm label-position="top" :disabled="disabled">
    <ElFormItem label="保留余额（元）"
      ><ElInput v-model="model.reserveAmount" inputmode="decimal"
    /></ElFormItem>
    <ElFormItem label="手续费预留（元）"
      ><ElInput v-model="model.feeBuffer" inputmode="decimal"
    /></ElFormItem>
    <ElFormItem label="每次最小转账金额（元）"
      ><ElInput v-model="model.minAmount" inputmode="decimal"
    /></ElFormItem>
    <ElFormItem label="每个环境每日转出限额（元）"
      ><ElInput v-model="model.dailyLimit" clearable placeholder="留空不限" inputmode="decimal"
    /></ElFormItem>
    <p class="text-muted text-12px">在 Telegram 设置 → 通知发送设置中选择转账结果和扫码二维码的接收群。接收群的业务范围需包含付款环境。</p>
  </ElForm>
</template>
