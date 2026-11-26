<script setup lang="ts">
import type { StrategyEvaluation } from '@/service/api';
defineProps<{ result: StrategyEvaluation }>();
function percentage(value?: number | null) {
  return value === null || value === undefined ? '—' : `${(value * 100).toFixed(2)}%`;
}
</script>

<template>
  <div>
    <ElAlert
      :title="
        result.simulation
          ? '模拟仅使用当前数据，不生成指令。可预览已停止策略组，仍检查站点状态、冷却和待执行指令；订单指标另需满足窗口和最低样本要求。'
          : '这里显示评估和指令生成结果，原站点的执行结果请查看调整记录。'
      "
      type="info"
      :closable="false"
      class="mb-16px"
    />
    <ElTable :data="result.results" border max-height="500" row-key="bindingId">
      <ElTableColumn type="expand">
        <template #default="{ row }">
          <div class="p-16px">
            <div>调整前</div>
            <pre class="overflow-auto text-12px">{{ JSON.stringify(row.beforeState ?? {}, null, 2) }}</pre>
            <div class="mt-12px">调整后</div>
            <pre class="overflow-auto text-12px">{{ JSON.stringify(row.desiredState ?? {}, null, 2) }}</pre>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="站点" min-width="130">
        <template #default="{ row }">{{ row.siteName || row.siteId }}</template>
      </ElTableColumn>
      <ElTableColumn label="对象" min-width="150">
        <template #default="{ row }">
          {{ row.pollingGroupCode ? `轮询组 ${row.pollingGroupCode} / ` : '' }}通道 {{ row.channelCode }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="订单数量" width="100">
        <template #default="{ row }">
          {{ row.metrics?.orderWindowCovered === false ? '—' : (row.metrics?.orderCount ?? '—') }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="通道数量" width="100">
        <template #default="{ row }">{{ row.metrics?.channelCount ?? '—' }}</template>
      </ElTableColumn>
      <ElTableColumn label="成功率" width="100">
        <template #default="{ row }">{{ percentage(row.metrics?.successRate) }}</template>
      </ElTableColumn>
      <ElTableColumn prop="ruleName" label="命中规则" min-width="150" />
      <ElTableColumn prop="reason" label="结果" min-width="210" />
    </ElTable>
  </div>
</template>
