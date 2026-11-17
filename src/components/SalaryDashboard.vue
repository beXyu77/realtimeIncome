<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getSalarySnapshot } from '../utils/salaryEngine'
import ActivityPanel from './ActivityPanel.vue'
import AchievementsPanel from './AchievementsPanel.vue'
import SchedulePanel from './SchedulePanel.vue'
import ActivityStats from './ActivityStats.vue'
import type { ActivityRecord, ActivityKind } from '../utils/activityEngine'
import type { PaySettings, AutoWorkStatus } from '../utils/salaryEngine'

const props = defineProps<{ settings: PaySettings }>()
const emit = defineEmits<{ edit: [] }>()

type WorkspacePage = 'overview' | 'statistics' | 'achievements' | 'settings'
const page = ref<WorkspacePage>('overview')
const navigation: { key: WorkspacePage; label: string; short: string; icon: string }[] = [
  { key: 'overview', label: '今日工作台', short: '工作台', icon: '🏡' },
  { key: 'statistics', label: '活动统计', short: '统计', icon: '📊' },
  { key: 'achievements', label: '成就中心', short: '成就', icon: '🏆' },
  { key: 'settings', label: '工资与设置', short: '设置', icon: '⚙️' },
]

// 只在系统整分钟更新主工资与倒计时。所有工资计算继续使用原有时间戳引擎。
function currentWholeMinute(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000)
}
const now = ref(currentWholeMinute())
let refreshTimer: ReturnType<typeof setTimeout> | undefined
function refreshMinute() {
  now.value = currentWholeMinute()
  if (refreshTimer !== undefined) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(refreshMinute, 60_000 - (Date.now() % 60_000) + 30)
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
const activeKind = ref<ActivityKind | null>(null)
const activityRecords = ref<ActivityRecord[]>([])
const activityRecordsReady = ref(false)
function handleRecordsChange(items: ActivityRecord[]) {
  activityRecords.value = items
  activityRecordsReady.value = true
}
const manualNames: Record<ActivityKind, string> = { toilet: '带薪拉屎中', fish: '带薪摸鱼中', study: '学习中' }
const manualEmojis: Record<ActivityKind, string> = { toilet: '🚽', fish: '🐟', study: '📖' }
const statusEmoji: Record<AutoWorkStatus, string> = {
  before: '☀️', work: '💼', lunch: '🍱', sprint: '🏃', off: '🌙', rest: '🌿',
}
const displayStatus = computed(() => activeKind.value ? manualNames[activeKind.value] : snapshot.value.statusText)
const displayEmoji = computed(() => activeKind.value ? manualEmojis[activeKind.value] : statusEmoji[snapshot.value.status])
const todayText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
}).format(now.value))
const currentTime = computed(() => new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(now.value))
const displayMoney = (value: number, digits = 2): string => Number.isFinite(value)
  ? value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  : '—'
function formatCountdownMinutes(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}
const displayHours = (ms: number) => `${(ms / 3_600_000).toFixed(2)} 小时`
const workingDays = computed(() => props.settings.weekdays.map((d) => `周${['', '一', '二', '三', '四', '五', '六', '日'][d] ?? d}`).join('、'))
const overtimeLabel = computed(() => {
  const s = props.settings
  if (s.overtimeType === 'none') return '没有额外加班费'
  if (s.overtimeType === 'unknown') return '暂不计算加班收入'
  return s.overtimeType === 'multiplier' ? `基本时薪 × ${s.overtimeValue}` : `固定加班时薪 ¥${s.overtimeValue}`
})
</script>

<template>
  <div class="min-w-0 lg:grid lg:grid-cols-[196px_minmax(0,1fr)] lg:items-start lg:gap-5">
    <aside class="hidden rounded-2xl border border-[#DDEBDD] bg-white p-3 lg:sticky lg:top-5 lg:block" aria-label="网页版功能导航">
      <p class="px-3 py-2 text-xs font-semibold tracking-wider text-[#8AA295]">MY WORKSPACE</p>
      <nav class="mt-1 space-y-1" aria-label="主导航">
        <button
          v-for="item in navigation" :key="item.key" type="button" :aria-current="page === item.key ? 'page' : undefined"
          class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
          :class="page === item.key ? 'bg-[#E3F3E8] text-[#287A55]' : 'text-[#688573] hover:bg-[#F3F9F4]'"
          @click="page = item.key"
        ><span aria-hidden="true">{{ item.icon }}</span><span>{{ item.label }}</span></button>
      </nav>
      <div class="mt-5 rounded-xl bg-[#F1F8F2] p-3 text-xs leading-6 text-[#688774]">
        🌱 工资每分钟更新。<br />努力工作，也要照顾自己。
      </div>
    </aside>

    <div class="min-w-0 space-y-5 pb-24 lg:pb-0">
      <!-- 各页都保留时钟和状态概览，但只有工作台显示工资金额。 -->
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="inline-flex items-center gap-2 rounded-full bg-[#E1F2E8] px-3 py-1.5 text-xs font-semibold text-[#287A55]">
          <span aria-hidden="true">{{ displayEmoji }}</span>
          <span>{{ displayStatus }}</span>
          <span v-if="snapshot.status === 'lunch'" class="font-normal">{{ settings.lunchPaid ? '· 带薪' : '· 暂停计薪' }}</span>
        </div>
        <p class="text-xs text-[#809789]">{{ todayText }} · {{ currentTime }}</p>
      </div>

      <!-- 工作台主体：保留 V1.5 原有核心业务组件与事件，不重写工资计算。 -->
      <section v-show="page === 'overview'" class="min-w-0 space-y-5" aria-label="今日工作台">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-xl font-bold text-[#264E3B] sm:text-2xl">今日工作台 🌿</h2>
            <p class="mt-1 text-sm text-[#738D7B]">安静记录每一分钟，也收获一点快乐。</p>
          </div>
          <button type="button" class="min-h-11 rounded-xl border border-[#D5E6D9] bg-white px-4 py-2 text-sm font-semibold text-[#347756] hover:bg-[#F2F8F2] focus-visible:outline-2 focus-visible:outline-[#297A5B]" @click="emit('edit')">
            修改工资与作息
          </button>
        </div>

        <section class="rounded-2xl border border-[#E0EFE3] bg-[#F1F9F3] p-4 sm:p-6" aria-label="今日模拟收入">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-[#6D8978]">
            <span>今日累计模拟收入（{{ settings.salaryBasis === 'gross' ? '税前' : '税后到手口径' }}）</span>
            <span class="rounded-full bg-white px-2.5 py-1 text-xs text-[#418466]">{{ snapshot.isWorkday ? '计划工作日' : '非工作日' }}</span>
          </div>
          <p class="mt-2 text-xs text-[#86A090]">金额和倒计时按整分钟更新，减少干扰</p>
          <p class="mt-3 break-all text-4xl font-bold tracking-tight tabular-nums text-[#247A55] sm:text-5xl" aria-live="off">¥{{ displayMoney(snapshot.totalEarned) }}</p>
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
            <p class="mt-1 text-xs text-[#91A698]">尚未接入加班计时</p>
          </div>
          <div class="min-w-0 rounded-2xl border border-[#E1ECE3] bg-white p-4">
            <p class="text-sm text-[#718C7C]">今日模拟合计</p>
            <p class="mt-2 break-all text-xl font-bold tabular-nums text-[#247A55]">¥{{ displayMoney(snapshot.totalEarned) }}</p>
            <p class="mt-1 text-xs text-[#91A698]">基本工资 + 已记录加班收入</p>
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
      </section>

      <!-- 持续挂载旧组件：切换页签不丢失计时状态、记录事件和提醒。 -->
      <div v-show="page === 'overview'" class="min-w-0 space-y-4 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0">
        <SchedulePanel :settings="settings" :clock="now" :snapshot="snapshot" :records="activityRecords" />
        <ActivityPanel :settings="settings" :clock="now" @active-change="activeKind = $event" @records-change="handleRecordsChange" />
      </div>

      <div v-show="page === 'overview'" class="rounded-xl bg-[#FFF4E7] px-4 py-3 text-xs leading-6 text-[#8E6D3B]">
        📌 工资是根据本地作息计算的模拟值，不是真实到账。活动收入是基本工资的一部分，不能额外累加；加班计时与节假日调休尚未实现。
      </div>

      <ActivityStats v-if="activityRecordsReady" v-show="page === 'statistics'" :records="activityRecords" :clock="now" />
      <p v-else-if="page === 'statistics'" class="rounded-xl bg-white p-5 text-sm text-[#758E7E]">正在读取本地活动记录…</p>

      <!-- 成就在第一次合法记录加载后挂载；进入/退出页面不会触发历史成就弹窗。 -->
      <div v-if="activityRecordsReady" v-show="page === 'achievements'">
        <AchievementsPanel :records="activityRecords" />
      </div>
      <p v-else-if="page === 'achievements'" class="rounded-xl bg-white p-5 text-sm text-[#758E7E]">正在读取本地成就…</p>

      <section v-show="page === 'settings'" class="min-w-0 space-y-4" aria-labelledby="workspace-settings-title">
        <div>
          <h2 id="workspace-settings-title" class="text-xl font-bold text-[#264E3B] sm:text-2xl">工资与设置 ⚙️</h2>
          <p class="mt-1 text-sm text-[#748E7D]">这里先展示当前已保存配置。修改时会打开原有的四步向导。</p>
        </div>
        <div class="rounded-2xl border border-[#DFEAE1] bg-white p-4 sm:p-6">
          <h3 class="font-semibold text-[#315D45]">薪资配置</h3>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">计薪方式</dt><dd class="text-right font-semibold text-[#315D45]">{{ settings.salaryMode === 'monthly' ? '固定月薪' : '时薪' }}</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">模拟工资</dt><dd class="break-all text-right font-semibold text-[#315D45]">¥{{ displayMoney(settings.salary) }} {{ settings.salaryMode === 'monthly' ? '/ 月' : '/ 小时' }}（{{ settings.salaryBasis === 'gross' ? '税前' : '税后' }}）</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">标准计薪工作日</dt><dd class="text-right text-[#315D45]">{{ settings.monthlyWorkdays }} 天 / 月</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">加班规则</dt><dd class="text-right text-[#315D45]">{{ overtimeLabel }}</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">发薪日</dt><dd class="text-right text-[#315D45]">每月 {{ settings.payday }} 日</dd></div>
          </dl>
        </div>
        <div class="rounded-2xl border border-[#DFEAE1] bg-white p-4 sm:p-6">
          <h3 class="font-semibold text-[#315D45]">工作作息</h3>
          <dl class="mt-4 space-y-3 text-sm">
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">每周工作日</dt><dd class="text-right text-[#315D45]">{{ workingDays }}</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">上午</dt><dd class="text-right text-[#315D45]">{{ settings.morningStart }} – {{ settings.morningEnd }}</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">午休</dt><dd class="text-right text-[#315D45]">{{ settings.morningEnd }} – {{ settings.afternoonStart }} · {{ settings.lunchPaid ? '计薪' : '不计薪' }}</dd></div>
            <div class="flex flex-wrap justify-between gap-2"><dt class="text-[#748D7C]">下午</dt><dd class="text-right text-[#315D45]">{{ settings.afternoonStart }} – {{ settings.afternoonEnd }}</dd></div>
          </dl>
        </div>
        <button type="button" class="min-h-11 w-full rounded-xl bg-[#297A5B] px-5 py-3 font-semibold text-white hover:bg-[#216448] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]" @click="emit('edit')">修改工资与作息</button>
        <p class="rounded-xl bg-[#F1F8F2] px-4 py-3 text-xs leading-6 text-[#768F7D]">默认只保存在当前浏览器本地；不是加密存储。如果需要导出或清空活动记录，请返回工作台的「趣味活动」区域操作。修改薪资后旧活动收入不会追溯重算。</p>
      </section>
    </div>

    <!-- 手机/平板端底部导航：不会挤压 320px 宽度下的活动图标布局。 -->
    <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-[#D6E7DB] bg-white/95 px-2 pt-2 shadow-[0_-6px_20px_rgba(30,80,50,.05)] backdrop-blur lg:hidden" style="padding-bottom: max(8px, env(safe-area-inset-bottom))" aria-label="移动端主导航">
      <div class="mx-auto grid w-full max-w-lg grid-cols-4 gap-1">
        <button
          v-for="item in navigation" :key="item.key" type="button" :aria-current="page === item.key ? 'page' : undefined"
          class="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
          :class="page === item.key ? 'bg-[#E4F3E9] text-[#277957]' : 'text-[#748E7D]'"
          @click="page = item.key"
        ><span aria-hidden="true" class="text-base leading-5">{{ item.icon }}</span><span class="truncate">{{ item.short }}</span></button>
      </div>
    </nav>
  </div>
</template>
