<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  calculateActivityStatistics,
  formatStatDuration,
  statisticKinds,
} from '../utils/activityStatsEngine'
import type { StatisticsPeriod } from '../utils/activityStatsEngine'
import type { ActivityKind, ActivityRecord } from '../utils/activityEngine'

const props = defineProps<{ records: ActivityRecord[]; clock: Date }>()
const period = ref<StatisticsPeriod>('today')
const periodChoices: { value: StatisticsPeriod; name: string }[] = [
  { value: 'today', name: '今天' },
  { value: 'week', name: '本周' },
  { value: 'month', name: '本月' },
]
const kind = ref<'all' | ActivityKind>('all')
const stats = computed(() => calculateActivityStatistics(props.records, props.clock, period.value))
const names: Record<ActivityKind, { emoji: string; title: string; color: string }> = {
  toilet: { emoji: '🚽', title: '厕所', color: '#75B992' },
  fish: { emoji: '🐟', title: '摸鱼', color: '#7BC2C5' },
  study: { emoji: '📖', title: '学习', color: '#B0A3D8' },
}
const filteredRecords = computed(() =>
  kind.value === 'all'
    ? stats.value.records.slice(0, 15)
    : stats.value.records.filter((record) => record.kind === kind.value).slice(0, 15),
)
const largestDuration = computed(() =>
  Math.max(1, ...statisticKinds.map((value) => stats.value.rows[value].durationMs)),
)
const money = (value: number) =>
  value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eventTime = (timestamp: number) =>
  new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
const periodLabel = computed(() =>
  period.value === 'today' ? '今天' : period.value === 'week' ? '本周' : '本月',
)
</script>

<template>
  <section class="min-w-0 space-y-5" aria-labelledby="stats-title">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="min-w-0">
        <h2 id="stats-title" class="text-xl font-bold text-[#264E3B] sm:text-2xl">活动统计 📊</h2>
        <p class="mt-1 text-sm text-[#758F7F]">看看自己把多少时间花在了可爱的小事上。</p>
      </div>
      <div class="flex rounded-xl border border-[#D9EADD] bg-white p-1" aria-label="统计周期">
        <button
          v-for="choice in periodChoices"
          :key="choice.value"
          type="button"
          :aria-pressed="period === choice.value"
          class="min-h-10 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#297A5B]"
          :class="
            period === choice.value
              ? 'bg-[#E2F2E7] text-[#277957]'
              : 'text-[#75917F] hover:bg-[#F5F9F5]'
          "
          @click="period = choice.value"
        >
          {{ choice.name }}
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-xs text-[#738D7C]">{{ periodLabel }}活动次数</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-[#286E51]">
          {{ stats.overall.count }}<span class="ml-1 text-xs font-normal">次</span>
        </p>
      </div>
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-xs text-[#738D7C]">{{ periodLabel }}活动总时长</p>
        <p class="mt-2 wrap-breSak-word text-lg font-bold text-[#286E51]">
          {{ formatStatDuration(stats.overall.durationMs) }}
        </p>
      </div>
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-xs text-[#738D7C]">活动对应模拟收入</p>
        <p class="mt-2 break-all text-lg font-bold tabular-nums text-[#286E51]">
          ¥{{ money(stats.overall.earned) }}
        </p>
      </div>
    </div>

    <div class="rounded-2xl border border-[#DFEAE1] bg-white p-4 sm:p-5">
      <h3 class="text-sm font-semibold text-[#315D45]">{{ periodLabel }}活动时长分布</h3>
      <div class="mt-4 space-y-4">
        <div v-for="item in statisticKinds" :key="item" class="min-w-0">
          <div class="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span class="text-[#456A52]">{{ names[item].emoji }} {{ names[item].title }}</span>
            <span class="text-xs tabular-nums text-[#789181]"
              >{{ formatStatDuration(stats.rows[item].durationMs) }} · ¥{{
                money(stats.rows[item].earned)
              }}</span
            >
          </div>
          <div
            class="h-2.5 overflow-hidden rounded-full bg-[#EDF3EE]"
            role="meter"
            :aria-label="`${names[item].title}时长相对比例`"
            :aria-valuenow="stats.rows[item].durationMs"
            aria-valuemin="0"
            :aria-valuemax="largestDuration"
          >
            <div
              class="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              :style="{
                width: `${(stats.rows[item].durationMs / largestDuration) * 100}%`,
                backgroundColor: names[item].color,
              }"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="rounded-2xl border border-[#DFEAE1] bg-white p-4 sm:p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-[#315D45]">最近活动记录</h3>
        <label class="flex items-center gap-2 text-xs text-[#718F7A]">
          类型
          <select
            v-model="kind"
            class="min-h-10 rounded-lg border border-[#D9EADD] bg-white px-2 text-xs text-[#315D45] focus-visible:outline-2 focus-visible:outline-[#297A5B]"
            aria-label="筛选活动类型"
          >
            <option value="all">全部活动</option>
            <option value="toilet">🚽 厕所</option>
            <option value="fish">🐟 摸鱼</option>
            <option value="study">📖 学习</option>
          </select>
        </label>
      </div>
      <div
        v-if="!filteredRecords.length"
        class="mt-4 rounded-xl bg-[#F2F8F3] p-5 text-center text-sm leading-6 text-[#758E7E]"
      >
        {{ periodLabel }}还没有对应活动记录。可以回工作台点图标开始记录 🌱
      </div>
      <ul v-else class="mt-3 divide-y divide-[#E6EFE7]">
        <li
          v-for="item in filteredRecords"
          :key="item.id"
          class="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
        >
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-semibold text-[#376D4F]">
              {{ names[item.kind].emoji }} {{ names[item.kind].title }}
              <span class="ml-1 text-xs font-normal text-[#85998A]">{{
                eventTime(item.startedAt)
              }}</span>
            </p>
            <p class="text-xs text-[#82998A]">
              {{ formatStatDuration(item.durationMs) }} · 其中计薪
              {{ formatStatDuration(item.paidDurationMs) }}
            </p>
          </div>
          <span class="break-all text-sm font-semibold tabular-nums text-[#287A55]"
            >¥{{ money(item.earned) }}</span
          >
        </li>
      </ul>
      <p v-if="stats.records.length > 15" class="mt-3 text-xs text-[#83998B]">
        每次最多展示15条记录，可在工作台的活动区导出全部历史记录。
      </p>
    </div>

    <p class="rounded-xl bg-[#FFF4E7] px-4 py-3 text-xs leading-6 text-[#8E6D3B]">
      📌
      活动收入已经包含在正常工资里，不能额外相加。统计按活动的开始日期归档，精确时长按秒保存，页面按分钟显示。历史记录沿用活动当时的工资规则；如切换过税前／税后口径，跨期模拟金额仅供参考。本版只统计厕所、摸鱼和学习，不包含带薪开会，也不主动上传数据。
    </p>
  </section>
</template>
