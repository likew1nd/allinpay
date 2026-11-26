<script setup lang="ts">
import { watch } from 'vue';
import type { SiteDataRecord } from '@/service/api';
import { useThemeStore } from '@/store/modules/theme';
import { useEcharts } from '@/hooks/common/echarts';
import type { ECOption } from '@/hooks/common/echarts';

const props = defineProps<{ sites: SiteDataRecord[] }>();
const theme = useThemeStore();
const { domRef, setOptions } = useEcharts<ECOption>(() => ({}), { onRender: () => update() });
function update() {
  const color = theme.darkMode ? '#aab7ca' : '#617087';
  setOptions({
    animation: !theme.reducedMotion,
    animationDuration: 650,
    animationDurationUpdate: 320,
    color: ['#81a7e6', '#70b7c9'],
    grid: { top: 22, right: 46, bottom: 32, left: 48 },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: theme.darkMode ? '#243143' : '#fff',
      textStyle: { color },
      borderWidth: 0
    },
    xAxis: {
      type: 'category',
      data: props.sites.map(site => site.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color, fontSize: 12, width: 100, overflow: 'truncate' }
    },
    yAxis: [
      {
        type: 'value',
        min: 0,
        axisLabel: { color, fontSize: 11 },
        splitLine: { lineStyle: { color: theme.darkMode ? '#354256' : '#e9eef6', type: 'dashed' } }
      },
      {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color, fontSize: 11, formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '已同步订单',
        type: 'bar',
        barMaxWidth: 36,
        itemStyle: { borderRadius: [6, 6, 0, 0] },
        data: props.sites.map(site => site.summary?.orderCount ?? 0)
      },
      {
        name: '成功率',
        type: 'line',
        yAxisIndex: 1,
        symbolSize: 7,
        lineStyle: { width: 2, type: 'dashed' },
        connectNulls: false,
        data: props.sites.map(site => {
          const rate = site.summary?.successRate;
          return rate === null || rate === undefined ? null : Number((rate * 100).toFixed(2));
        })
      }
    ]
  });
}
watch([() => props.sites, () => theme.darkMode, () => theme.reducedMotion], update, { deep: true });
</script>

<template>
  <div
    ref="domRef"
    class="epay-overview-chart"
    role="img"
    aria-label="各站点已同步订单量与成功率对比，下方站点表可查看数据"
  />
</template>
