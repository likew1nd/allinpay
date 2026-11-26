<script setup lang="ts">
import type { StrategyConfiguration } from '@/service/api';
const model = defineModel<StrategyConfiguration>({ required: true });
</script>

<template>
  <ElForm label-position="top">
    <ElRow :gutter="12">
      <ElCol :span="12">
        <ElFormItem label="统计窗口（分钟）">
          <ElInputNumber v-model="model.windowMinutes" :min="1" :max="10080" :precision="0" class="w-full" />
        </ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="最低样本数（订单）">
          <ElInputNumber v-model="model.minSamples" :min="1" :max="10000000" :precision="0" class="w-full" />
        </ElFormItem>
      </ElCol>
    </ElRow>
    <ElFormItem label="动作冷却时间（秒）">
      <ElInputNumber v-model="model.cooldownSeconds" :min="30" :max="86400" :precision="0" />
      <p class="mt-6px w-full text-12px text-gray-500">
        一次调整后等待此时间再判断。调权按成员、全局启停按通道、增删成员按轮询组计时。
      </p>
    </ElFormItem>
    <ElRow
      v-if="
        model.rules.some(rule =>
          ['ADJUST_MEMBER_WEIGHT', 'SET_MEMBER_WEIGHT', 'ADD_POLLING_MEMBER'].includes(rule.action.type)
        )
      "
      :gutter="12"
    >
      <ElCol :span="12">
        <ElFormItem label="权重下限">
          <ElInputNumber v-model="model.minWeight" :min="0" :max="100" :precision="0" class="w-full" />
        </ElFormItem>
      </ElCol>
      <ElCol :span="12">
        <ElFormItem label="权重上限">
          <ElInputNumber v-model="model.maxWeight" :min="model.minWeight" :max="100" :precision="0" class="w-full" />
        </ElFormItem>
      </ElCol>
    </ElRow>
    <ElAlert
      title="订单指标按站点内的通道统计。样本数包含全部订单，默认 1 笔；已支付、退款、冻结等均计成功，未支付计失败。成功率 = 成功订单数 ÷ 订单总数。通道数量不受统计窗口和最低样本数限制。"
      type="info"
      :closable="false"
    />
    <p class="mt-12px text-12px text-gray-500">
      规则从上到下判断，仅执行首条命中规则。权重 0
      表示在加权随机轮询组中不被选中；通道停止后可能没有足够新订单触发恢复，需人工确认。
    </p>
  </ElForm>
</template>
