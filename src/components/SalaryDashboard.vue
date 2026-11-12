<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getSalarySnapshot } from '../utils/salaryEngine'
import type { PaySettings, AutoWorkStatus } from '../utils/salaryEngine'

const props = defineProps<{ settings: PaySettings }>()
const emit = defineEmits<{ edit: [] }>()

// 只在整分钟更新显示，减少金额与倒计时的跳动。
// 计算引擎仍使用时间戳；本组件使用当前整分钟作为显示快照。
function currentWholeMinute(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000)
}
const now = ref(currentWholeMinute())
let refreshTimer: ReturnType<typeof setTimeout> | undefined

function refreshMinute() {
  now.value = currentWholeMinute()
  // 对齐系统时钟的下一个整分钟，而非从打开网页起每 60 秒刷新。
  if (refreshTimer !== undefined) clearTimeout(refreshTimer)
  const nextBoundaryDelay = 60_000 - (Date.now() % 60_000) + 30
  refreshTimer = setTimeout(refreshMinute, nextBoundaryDelay)
}
function onVisibilityChange() {
  if (!document.hidden) refreshMinute()
}
onMounted(() => {
  refreshMinute()
  window.addEventListener('focus', refreshMinute)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  if (refreshTimer !== undefined) clearTimeout(refreshTimer)
  window.removeEventListener('focus', refreshMinute)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const snapshot = computed(() => getSalarySnapshot(props.settings, now.value))
const statusEmoji: Record<AutoWorkStatus, string> = {
  before: '☀️', work: '💼', lunch: '🍱', sprint: '🏃', off: '🌙', rest: '🌿',
}
const todayText = computed(() =>
  new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(now.value),
)
const currentTime = computed(() =>
  new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now.value),
)
const displayMoney = (value: number, digits = 2) =>
  Number.isFinite(value)
    ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '—'
// 倒计时也按分钟展示，向上取整避免尚有不足 1 分钟时提前显示 00:00。
function formatCountdownMinutes(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
const displayHours = (ms: number) => `${(ms / 3_600_000).toFixed(2)} 小时`
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <div class="inline-flex items-center gap-2 rounded-full bg-[#E1F2E8] px-3 py-1.5 text-xs font-semibold text-[#287A55]">
          <span aria-hidden="true">{{ statusEmoji[snapshot.status] }}</span>
          <span>{{ snapshot.statusText }}</span>
          <span v-if="snapshot.status === 'lunch'" class="font-normal">{{ settings.lunchPaid ? '· 带薪' : '· 暂停计薪' }}</span>
        </div>
        <h2 class="mt-3 text-xl font-bold sm:text-2xl">今日工资模拟 · 每分钟更新</h2>
        <p class="mt-1 text-xs text-[#708C7A] sm:text-sm">{{ todayText }} · 当前时间 {{ currentTime }}</p>
      </div>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-xl border border-[#D5E6D9] bg-white px-4 py-2.5 text-sm font-semibold text-[#347756] transition hover:bg-[#F2F8F2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
        @click="emit('edit')"
      >
        修改工资与作息
      </button>
    </div>

    <section class="rounded-2xl border border-[#E0EFE3] bg-[#F1F9F3] p-4 sm:p-6" aria-label="今日模拟收入">
      <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-[#6D8978]">
        <span>今日累计模拟收入（{{ settings.salaryBasis === 'gross' ? '税前' : '税后到手口径' }}）</span>
        <span class="rounded-full bg-white px-2.5 py-1 text-xs text-[#418466]">{{ snapshot.isWorkday ? '计划工作日' : '非工作日' }}</span>
      </div>
      <p class="mt-2 text-xs text-[#86A090]">金额和倒计时按整分钟更新，减少干扰</p>
      <p class="mt-3 break-all text-4xl font-bold tracking-tight tabular-nums text-[#247A55] sm:text-5xl" aria-live="off">
        ¥{{ displayMoney(snapshot.totalEarned) }}
      </p>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#688573]">
        <span>{{ snapshot.activeRatePerSecond > 0 ? `当前约 +¥${displayMoney(snapshot.activeRatePerSecond * 60)} / 分钟` : '当前暂停计薪' }}</span>
        <span>标准工作日预计 ¥{{ displayMoney(snapshot.dailyBasePay) }}</span>
      </div>
      <div class="mt-5 flex items-center justify-between gap-3 text-xs text-[#688573]">
        <span>当日计薪进度</span>
        <span class="font-semibold tabular-nums text-[#297A5B]">{{ snapshot.progressPercent.toFixed(1) }}%</span>
      </div>
      <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-[#DDEDE1]" role="progressbar" :aria-valuenow="snapshot.progressPercent" aria-valuemin="0" aria-valuemax="100" aria-label="今日计薪进度">
        <div class="h-full rounded-full bg-[#64B78F] transition-[width] duration-500 motion-reduce:transition-none" :style="{ width: `${snapshot.progressPercent}%` }" />
      </div>
    </section>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-sm text-[#718C7C]">今日基本工资</p>
        <p class="mt-2 break-all text-xl font-bold tabular-nums text-[#315B44]">¥{{ displayMoney(snapshot.baseEarned) }}</p>
        <p class="mt-1 text-xs text-[#91A698]">已累计部分</p>
      </div>
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-sm text-[#718C7C]">今日加班工资</p>
        <p class="mt-2 break-all text-xl font-bold tabular-nums text-[#315B44]">¥{{ displayMoney(snapshot.overtimeEarned) }}</p>
        <p class="mt-1 text-xs text-[#91A698]">本阶段未接入加班计时</p>
      </div>
      <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
        <p class="text-sm text-[#718C7C]">今日模拟合计</p>
        <p class="mt-2 break-all text-xl font-bold tabular-nums text-[#247A55]">¥{{ displayMoney(snapshot.totalEarned) }}</p>
        <p class="mt-1 text-xs text-[#91A698]">基本工资 + 已记录加班工资</p>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div class="rounded-2xl border border-[#E2EDE5] bg-white p-4">
        <p class="text-sm text-[#708C7A]">{{ snapshot.countdownText }}</p>
        <p class="mt-2 text-2xl font-bold tabular-nums text-[#34684C]">{{ formatCountdownMinutes(snapshot.countdownMs) }}</p>
        <p class="mt-2 text-xs text-[#81988A]">{{ snapshot.message }}</p>
      </div>
      <div class="rounded-2xl border border-[#E2EDE5] bg-white p-4">
        <p class="text-sm text-[#708C7A]">今日计薪时间</p>
        <p class="mt-2 text-xl font-bold tabular-nums text-[#34684C]">{{ displayHours(snapshot.paidElapsedMs) }}</p>
        <p class="mt-2 text-xs text-[#81988A]">今日安排 {{ displayHours(snapshot.paidTotalMs) }}，午休{{ settings.lunchPaid ? '计薪' : '不计薪' }}</p>
      </div>
    </div>

    <div class="rounded-xl bg-[#FFF4E7] px-4 py-3 text-xs leading-6 text-[#8E6D3B]">
      📌 这是依据设备本地日期、工作日和作息计算的工资模拟，并非真实到账。暂未接入加班计时、手动活动记录、跨午夜排班和法定节假日调休。完成相关功能前，加班收入始终显示为 0，不能当作真实工资单。
    </div>
  </div>
</template>
