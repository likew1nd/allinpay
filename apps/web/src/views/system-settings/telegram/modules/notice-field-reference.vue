<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ environment?: boolean }>();
const group = ref(props.environment ? 'detail' : 'base');
const groups = computed(() => props.environment ? [
  { label: '逐环境明细', value: 'detail' }, { label: '整组汇总', value: 'summary' }
] : [
  { label: '通道信息', value: 'base' },
  { label: '收款与限额', value: 'amount' },
  { label: '分时统计', value: 'window' }
]);
const info = [['编号', '%BH'], ['环境名', '%HJ'], ['登录状态', '%DL'], ['账号状态', '%ZH'], ['可用余额', '%KY'], ['不可用余额', '%BKY'], ['待结算余额', '%DJS'], ['采集端', '%CJD'], ['通知时间', '%SJ']];
const rows: Record<string, string[][]> = {
  detail: [['状态灯', '%ZT'], ...info, ['余额采集时间', '%CJSJ']],
  summary: [['采集端', '%CJD'], ['时间', '%SJ'], ['本条环境数', '%ZS'], ['需关注数量', '%YC'], ['异常环境明细', '%MX'], ['正常环境汇总', '%ZC'], ['状态待确认汇总', '%DQR']],
  base: [['站点名', '%ZD'], ['通道编号', '%BH'], ['通道名', '%MC'], ['状态灯', '%ZT'], ['状态文字', '%ZTMC'], ['分时统计明细', '%SDMX']],
  amount: [['今日收款', '%SK'], ['收款限额', '%SKXE'], ['今日笔数', '%BS'], ['笔数限额', '%BSXE'], ['总收款', '%ZSK'], ['总笔数', '%ZBS']],
  window: ['5', '15', '30', '60', 'QT'].flatMap(period => {
    const label = period === 'QT' ? '全天' : period + ' 分钟';
    const prefix = period === 'QT' ? '%QT' : '%' + period + 'F';
    return [['成功率', 'CGL'], ['笔数', 'BS'], ['收款', 'SK']].map(([name, code]) => [label + ' · ' + name, prefix + code]);
  })
};
</script>

<template>
  <aside aria-label="字段速查">
    <h2 class="mb-12px flex items-center text-16px font-semibold"><SvgIcon icon="tabler:list-details" aria-hidden="true" class="mr-6px" />字段速查</h2>
    <ElSegmented v-model="group" :options="groups" aria-label="字段分类" class="mb-12px" />
    <ElTable :data="rows[group]" size="small" border stripe>
      <ElTableColumn label="字段名" min-width="130"><template #default="{ row }">{{ row[0] }}</template></ElTableColumn>
      <ElTableColumn label="占位符" min-width="104"><template #default="{ row }"><code class="select-all">{{ row[1] }}</code></template></ElTableColumn>
    </ElTable>
  </aside>
</template>
