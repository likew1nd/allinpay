<script setup lang="ts">
</script>

<template>
  <ElCard class="card-wrapper">
    <ElAlert
      type="info"
      :closable="false"
      show-icon
      title="外部流水导入、原始流水号匹配和自动对账将在 P9 接入。系统自动转账的执行结果请在自动转账中查看。"
    />
    <ElEmpty description="暂无已接入的外部流水数据" />
  </ElCard>
</template>