<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { localDayKey, nextScheduleEvent, recentScheduleEvent } from '../utils/scheduleEngine'
import type { ActivityKind, ActivityRecord } from '../utils/activityEngine'
import type { PaySettings, SalarySnapshot } from '../utils/salaryEngine'

const props = defineProps<{
  settings: PaySettings
  clock: Date
  snapshot: SalarySnapshot
  records: ActivityRecord[]
}>()

const REMINDER_KEY = 'paid-fishing:reminders:v1'
type ReminderPrefs = { version: 1; enabled: boolean; shown: string[] }
const remindersEnabled = ref(true)
const shown = ref<string[]>([])
const reminderError = ref('')
const storageBlocked = ref(false)
const banner = ref<{ title: string; message: string } | null>(null)
const summaryExpanded = ref(false)
const money = (value: number): string => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function isReminderPrefs(value: unknown): value is ReminderPrefs {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<ReminderPrefs>
  return p.version === 1 && typeof p.enabled === 'boolean' &&
    Array.isArray(p.shown) && p.shown.length <= 80 &&
    p.shown.every((x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}:[a-z-]+$/.test(x) && x.length <= 50)
}

function loadPreferences() {
  try {
    const raw = localStorage.getItem(REMINDER_KEY)
    if (!raw) return
    if (raw.length > 6000) throw new Error('invalid storage')
    const value: unknown = JSON.parse(raw)
    if (!isReminderPrefs(value)) throw new Error('invalid preferences')
    remindersEnabled.value = value.enabled
    shown.value = [...value.shown]
    storageBlocked.value = false
    reminderError.value = '' 
  } catch {
    // 保留损坏的原始数据，不自动覆盖。
    storageBlocked.value = true
    reminderError.value = '提醒设置格式异常。为保护原始数据，本次不会覆盖该记录；提醒开关只在当前页面有效。'
  }
}

function persistPreferences() {
  const cutoff = localDayKey(new Date(props.clock.getFullYear(), props.clock.getMonth(), props.clock.getDate() - 7))
  shown.value = shown.value.filter((key) => key.slice(0, 10) >= cutoff).slice(-50)
  if (storageBlocked.value) return
  try {
    localStorage.setItem(REMINDER_KEY, JSON.stringify({ version: 1, enabled: remindersEnabled.value, shown: shown.value }))
    reminderError.value = ''
  } catch {
    reminderError.value = '浏览器未允许保存提醒偏好；下次打开可能恢复默认设置。'
  }
}

function toggleReminders() {
  remindersEnabled.value = !remindersEnabled.value
  banner.value = null
  persistPreferences()
}

function checkEvent() {
  if (!remindersEnabled.value) return
  const event = recentScheduleEvent(props.settings, props.clock)
  if (!event || shown.value.includes(event.key)) return
  shown.value.push(event.key)
  banner.value = { title: event.title, message: event.message }
  if (event.kind === 'work-end') summaryExpanded.value = true
  persistPreferences()
}

const nextEvent = computed(() => nextScheduleEvent(props.settings, props.clock))
const todaySummary = computed(() => {
  const key = localDayKey(props.clock)
  const totals: Record<ActivityKind, { count: number; duration: number; earned: number }> = {
    toilet: { count: 0, duration: 0, earned: 0 },
    fish: { count: 0, duration: 0, earned: 0 },
    study: { count: 0, duration: 0, earned: 0 },
  }
  for (const record of props.records) {
    if (localDayKey(new Date(record.startedAt)) !== key) continue
    const stat = totals[record.kind]
    stat.count += 1
    stat.duration += record.durationMs
    stat.earned += record.earned
  }
  return totals
})
const durationText = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分钟` : `${minutes}分钟`
}

function onVisibility() {
  if (!document.hidden) checkEvent()
}
function onStorage(event: StorageEvent) {
  if (event.key === REMINDER_KEY) {
    loadPreferences()
    if (!remindersEnabled.value) banner.value = null
  }
}
onMounted(() => {
  loadPreferences()
  checkEvent()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('storage', onStorage)
})
onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('storage', onStorage)
})
watch(() => props.clock.getTime(), checkEvent)
watch(() => props.settings, () => { banner.value = null; checkEvent() })
</script>

<template>
  <section class="space-y-3 rounded-2xl border border-[#DDEBDD] bg-[#FCFFFC] p-4 sm:p-5" aria-label="工作日程与午休提醒">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="text-base font-bold text-[#305E45]">🍱 工作日程与提醒</h3>
      <div class="flex items-center gap-2">
        <button type="button" class="min-h-9 rounded-full border border-[#D5E8D9] bg-white px-3 py-1 text-xs font-semibold text-[#327555]" @click="banner = { title: '午休提醒预览', message: '🍚 到点啦，记得给自己安排一顿好饭！' }">
          预览提醒
        </button>
        <button type="button" class="min-h-9 shrink-0 rounded-full border border-[#D5E8D9] bg-white px-3 py-1 text-xs font-semibold text-[#327555] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]" :aria-pressed="remindersEnabled" @click="toggleReminders">
          {{ remindersEnabled ? '提醒已开启' : '提醒已关闭' }}
        </button>
      </div>
    </div>
    <p class="text-xs leading-5 text-[#789080]">仅在网页打开时显示提醒，不发送系统通知；工资仍按整分钟更新。</p>

    <div v-if="banner" class="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-[#FFF2E1] p-3" role="status" aria-live="polite">
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-semibold text-[#8D603B]">{{ banner.title }}</p>
        <p class="text-xs leading-5 text-[#906E49]">{{ banner.message }}</p>
      </div>
      <button type="button" aria-label="关闭提醒" title="关闭提醒" class="shrink-0 rounded-md px-2 py-1 text-sm text-[#8D603B]" @click="banner = null">✕</button>
    </div>

    <div class="rounded-xl bg-[#F1F8F2] p-3">
      <p class="text-sm font-semibold text-[#357759]">
        {{ snapshot.status === 'lunch' ? '🍚 现在是午休时间' : snapshot.status === 'off' ? '🎉 今日已下班' : snapshot.status === 'rest' ? '🌿 今天是休息日' : '🌱 当前安排：' + snapshot.statusText }}
      </p>
      <p class="mt-1 text-xs leading-5 text-[#718B7B]">{{ snapshot.message }}</p>
      <p v-if="nextEvent" class="mt-2 text-xs text-[#60856F]">下一提醒：{{ nextEvent.timeText }} · {{ nextEvent.title }}</p>
      <p v-else-if="!snapshot.isWorkday" class="mt-2 text-xs text-[#60856F]">工作日提醒将在下一次工作日生效。</p>
    </div>

    <p v-if="reminderError" class="text-xs text-[#A56849]" role="alert">{{ reminderError }}</p>

    <div v-if="snapshot.status === 'off'" class="rounded-xl border border-[#DAEBDD] bg-white p-3 sm:p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p class="text-sm font-semibold text-[#2D7152]">🎉 今日下班结算</p>
          <p class="mt-1 text-xs text-[#80978A]">今日工资是模拟收入，并非银行实际到账。</p>
        </div>
        <button type="button" class="min-h-9 rounded-lg bg-[#E6F4E9] px-3 py-1.5 text-xs font-semibold text-[#317B56]" :aria-expanded="summaryExpanded" @click="summaryExpanded = !summaryExpanded">
          {{ summaryExpanded ? '收起结算' : '查看结算' }}
        </button>
      </div>
      <div v-if="summaryExpanded" class="mt-3 space-y-3">
        <p class="text-sm leading-6 text-[#795C39]">恭喜你，今天成功完成打工人生存挑战！明天继续快乐进货。🌱</p>
        <div class="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
          <div class="rounded-xl bg-[#F1F9F3] p-3">
            <p class="text-xs text-[#779083]">今日基本工资</p>
            <p class="mt-1 text-xl font-bold tabular-nums text-[#287957]">¥{{ money(snapshot.baseEarned) }}</p>
          </div>
          <div class="rounded-xl bg-[#F8F7F0] p-3">
            <p class="text-xs text-[#779083]">今日模拟合计</p>
            <p class="mt-1 text-xl font-bold tabular-nums text-[#287957]">¥{{ money(snapshot.totalEarned) }}</p>
          </div>
        </div>
        <p class="text-xs text-[#819487]">加班工资 ¥{{ money(snapshot.overtimeEarned) }}（加班计时尚未接入，本版不自动计算）。</p>
        <div class="space-y-2 text-xs text-[#557363]">
          <p>🚽 厕所：{{ durationText(todaySummary.toilet.duration) }} · 对应收入 ¥{{ money(todaySummary.toilet.earned) }}</p>
          <p>🐟 摸鱼：{{ durationText(todaySummary.fish.duration) }} · 对应收入 ¥{{ money(todaySummary.fish.earned) }}</p>
          <p>📖 学习：{{ durationText(todaySummary.study.duration) }} · 对应收入 ¥{{ money(todaySummary.study.earned) }}</p>
        </div>
        <p class="text-xs leading-5 text-[#8A9D90]">以上活动收入已包含在基本工资中，不能再次相加。学习在非计薪时段的收入为0。</p>
      </div>
    </div>
  </section>
</template>
