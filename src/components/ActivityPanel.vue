<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ACTIVITY_STORAGE_KEY,
  activityNames,
  canStartActivity,
  durationText,
  emptyActivityStore,
  nextActivityBoundary,
  readActivityStore,
  settleActivity,
} from '../utils/activityEngine'
import type { ActivityKind, ActivityRecord, ActiveActivity, ActivityStore } from '../utils/activityEngine'
import type { PaySettings } from '../utils/salaryEngine'

const props = defineProps<{ settings: PaySettings; clock: Date }>()
const emit = defineEmits<{ 'active-change': [kind: ActivityKind | null] }>()
const active = ref<ActiveActivity | null>(null)
const records = ref<ActivityRecord[]>([])
const error = ref('')
const notice = ref('')
const storageBlocked = ref(false)
const receipt = ref<ActivityRecord | null>(null)
const receiptMessage = ref('')

const icons: { kind: ActivityKind; icon: string; hint: string }[] = [
  { kind: 'toilet', icon: '🚽', hint: '带薪上厕所' },
  { kind: 'fish', icon: '🐟', hint: '开始摸鱼' },
  { kind: 'study', icon: '📖', hint: '开始学习' },
]
const messages: Record<ActivityKind, string[]> = {
  toilet: [
    '🎉 恭喜你，带薪拉屎成功！',
    '🚽 本次厕所之旅，由公司友情赞助。',
    '💰 马桶一坐，工资到账。',
    '🌱 恭喜实现身体轻盈与钱包增长的双重目标！',
  ],
  fish: [
    '🐟 恭喜！灵魂成功放假，工资依然在路上。',
    '🌊 本次摸鱼圆满收网，赚的是心情也是工资。',
    '🏆 鱼塘巡视结束，感谢公司提供办公场地。',
  ],
  study: [
    '📖 恭喜！你的技能树又悄悄长出新枝。',
    '🌱 今天为未来的自己充了一次电。',
    '🏆 学习任务完成，知识收入已经到账！',
  ],
}

const runningMinutes = computed(() => active.value
  ? Math.max(0, Math.floor((props.clock.getTime() - active.value.startedAt) / 60_000))
  : 0)

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}
const todayRecords = computed(() => {
  const today = localDateKey(props.clock)
  return records.value.filter((record) => localDateKey(new Date(record.startedAt)) === today)
})
const todayStats = computed(() => {
  const totals: Record<ActivityKind, { count: number; durationMs: number; earned: number }> = {
    toilet: { count: 0, durationMs: 0, earned: 0 },
    fish: { count: 0, durationMs: 0, earned: 0 },
    study: { count: 0, durationMs: 0, earned: 0 },
  }
  for (const record of todayRecords.value) {
    const stat = totals[record.kind]
    stat.count += 1
    stat.durationMs += record.durationMs
    stat.earned += record.earned
  }
  return totals
})
const recentRecords = computed(() => [...records.value].reverse().slice(0, 6))
const cash = (num: number) => num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = (time: number) => new Date(time).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })

function notifyActive() {
  emit('active-change', active.value?.kind ?? null)
}

function commit(store: ActivityStore): boolean {
  if (storageBlocked.value) return false
  try {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(store))
    active.value = store.active
    records.value = store.records
    error.value = ''
    notifyActive()
    return true
  } catch {
    error.value = '活动无法写入浏览器本地存储，未开始新的活动或未完成结算。请检查存储空间和权限。'
    return false
  }
}
function loadStore() {
  try {
    const read = readActivityStore(localStorage.getItem(ACTIVITY_STORAGE_KEY))
    active.value = read.store.active
    records.value = read.store.records
    storageBlocked.value = Boolean(read.warning)
    error.value = read.warning
    notifyActive()
    if (!storageBlocked.value) reconcile()
  } catch {
    storageBlocked.value = true
    error.value = '无法读取本地活动记录，请检查浏览器存储权限。'
  }
}
function reconcile() {
  if (storageBlocked.value || !active.value) return
  const boundary = nextActivityBoundary(active.value.settingsAtStart, active.value.startedAt)
  if (Date.now() < boundary) return
  const record = settleActivity(active.value, boundary, 'schedule')
  if (commit({ version: 1, active: null, records: [...records.value, record] })) {
    notice.value = `${activityNames[record.kind]}已在时间节点自动结束，记录已保存（${durationText(record.durationMs)}）。`
  }
}
function start(kind: ActivityKind) {
  error.value = ''
  notice.value = ''
  if (storageBlocked.value) return
  reconcile()
  if (active.value) {
    error.value = '请先点击「结束」完成当前活动，再开始另一项。'
    return
  }
  if (records.value.length >= 3000) {
    error.value = '本地活动记录已达到3000条上限，请先导出备份后清空记录。'
    return
  }
  const now = Date.now()
  if (!canStartActivity(kind, props.settings, now)) {
    error.value = '厕所与摸鱼仅能在正常工作时段开始；午休或下班后可使用学习模式（不计薪）。'
    return
  }
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${now}-${Math.random().toString(36).slice(2)}`
  const next: ActiveActivity = {
    id,
    kind,
    startedAt: now,
    settingsAtStart: { ...props.settings, weekdays: [...props.settings.weekdays] },
  }
  if (commit({ version: 1, active: next, records: records.value })) {
    notice.value = `${activityNames[kind]}开始啦！点击「结束${activityNames[kind]}」即可结算。`
  }
}
function finish() {
  const current = active.value
  if (!current) return
  // 始终先核对午休、下班边界；页面在后台休眠也不能多计。
  reconcile()
  if (!active.value || active.value.id !== current.id) return
  const record = settleActivity(current, Date.now(), 'manual')
  if (commit({ version: 1, active: null, records: [...records.value, record] })) {
    const lines = messages[record.kind]
    receiptMessage.value = lines[Math.floor(Math.random() * lines.length)] ?? '🎉 活动结束，记录已保存！'
    receipt.value = record
    notice.value = ''
  }
}
function dismiss() {
  receipt.value = null
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && receipt.value) dismiss()
}
function onVisibility() {
  if (!document.hidden) reconcile()
}
function onStorage(event: StorageEvent) {
  if (event.key === ACTIVITY_STORAGE_KEY) loadStore()
}
function resetDamagedStorage() {
  if (!window.confirm('确定清除损坏的活动数据吗？此操作无法撤销，工资设置不会删除。')) return
  try {
    localStorage.removeItem(ACTIVITY_STORAGE_KEY)
    active.value = null
    records.value = []
    storageBlocked.value = false
    error.value = ''
    notice.value = '活动记录已重置；工资与作息设置不受影响。'
    notifyActive()
  } catch {
    error.value = '清理失败，浏览器可能禁止本地存储操作。'
  }
}
function exportRecords() {
  if (records.value.length === 0) return
  try {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: records.value }, null, 2)
    const file = new Blob([payload], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = 'paid-fishing-activity-backup.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    error.value = '导出失败，请检查浏览器是否允许下载文件。'
  }
}
function clearRecords() {
  if (active.value) { error.value = '请先结束正在进行的活动。'; return }
  if (!records.value.length) return
  if (!window.confirm('确定清空所有已完成活动记录吗？建议先导出备份。此操作不可撤销，工资设置不受影响。')) return
  if (commit(emptyActivityStore())) notice.value = '活动记录已清空，工资设置已保留。'
}

watch(() => props.clock.getTime(), () => reconcile())
onMounted(() => {
  loadStore()
  window.addEventListener('focus', reconcile)
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  window.removeEventListener('focus', reconcile)
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <section class="space-y-4 rounded-2xl border border-[#DDEBDD] bg-[#FCFFFC] p-4 sm:p-5" aria-label="趣味活动记录">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-base font-bold text-[#305E45]">🐟 趣味活动</h3>
        <p class="mt-1 text-xs text-[#809787]">工资主面板每分钟更新；活动结算精确到秒。</p>
      </div>
      <span class="rounded-full bg-[#EAF5ED] px-3 py-1 text-xs text-[#397F5E]">仅本地记录</span>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <div class="flex items-center gap-2" aria-label="选择活动">
        <button
          v-for="item in icons" :key="item.kind" type="button"
          :title="item.hint" :aria-label="item.hint" :aria-pressed="active?.kind === item.kind"
          :disabled="Boolean(active) || storageBlocked"
          class="flex size-12 items-center justify-center rounded-xl border text-xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B] disabled:cursor-not-allowed disabled:opacity-45"
          :class="active?.kind === item.kind ? 'border-[#348C65] bg-[#D9F0E2]' : 'border-[#D7E8DC] bg-[#EFF8F1] hover:bg-[#DFF2E5]'"
          @click="start(item.kind)"
        >{{ item.icon }}</button>
      </div>
      <div v-if="active" class="min-w-0 flex-1 space-y-1">
        <p class="text-sm font-semibold text-[#327756]">{{ activityNames[active.kind] }}进行中</p>
        <p class="text-xs text-[#7B9283]">已持续约 {{ runningMinutes }} 分钟</p>
      </div>
      <button
        v-if="active" type="button" class="min-h-11 rounded-xl bg-[#A66C47] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#8C5735] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A66C47]"
        @click="finish"
      >结束{{ activityNames[active.kind] }}</button>
    </div>

    <p v-if="active" class="rounded-xl bg-[#FFF3E4] px-3 py-2 text-sm text-[#8A653F]">
      {{ active.kind === 'toilet' ? '🚽 带薪拉屎中……公司的利润正在神秘流动。' : active.kind === 'fish' ? '🐟 人在工位坐，灵魂已经去海里游泳。' : '📖 技能树成长中……偷偷升级的感觉真不错。' }}
    </p>
    <p v-if="notice" role="status" class="rounded-xl bg-[#EAF5ED] px-3 py-2 text-sm text-[#367654]">{{ notice }}</p>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
    <button v-if="storageBlocked" type="button" class="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-800" @click="resetDamagedStorage">确认后重置损坏的活动数据</button>

    <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <div v-for="item in icons" :key="item.kind" class="rounded-xl bg-[#F1F8F2] p-3">
        <p class="text-xs text-[#7D9585]">{{ item.icon }} 今日{{ activityNames[item.kind] }}</p>
        <p class="mt-1 text-lg font-semibold text-[#2D6D4C] tabular-nums">{{ durationText(todayStats[item.kind].durationMs) }}</p>
        <p class="mt-1 text-xs text-[#809889]">模拟收入 ¥{{ cash(todayStats[item.kind].earned) }}</p>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-semibold text-[#3A6E50]">最近活动记录</h4>
      <div class="flex gap-2">
        <button type="button" class="rounded-lg border border-[#CEE5D5] px-2 py-1.5 text-xs text-[#357956] disabled:opacity-40" :disabled="!records.length" @click="exportRecords">导出备份</button>
        <button type="button" class="rounded-lg border border-[#F1D8CF] px-2 py-1.5 text-xs text-[#A26653] disabled:opacity-40" :disabled="!records.length || Boolean(active)" @click="clearRecords">清空记录</button>
      </div>
    </div>
    <p v-if="!recentRecords.length" class="text-sm text-[#839A8B]">还没有记录，点一下上方的图标开始吧！</p>
    <ul v-else class="divide-y divide-[#E4EEE6]">
      <li v-for="item in recentRecords" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div class="min-w-0">
          <span class="font-medium text-[#416951]">{{ activityNames[item.kind] }}</span>
          <span class="ml-2 text-xs text-[#8A9B90]">{{ dateTime(item.startedAt) }} · {{ durationText(item.durationMs) }}</span>
        </div>
        <span class="font-semibold text-[#287A55] tabular-nums">¥{{ cash(item.earned) }}</span>
      </li>
    </ul>
    <p class="text-xs leading-5 text-[#879C8B]">以上活动收入是今日基本工资中的一部分，不额外加到总工资。午休或下班时自动结束活动；非工作时间的学习只记录时长。请勿在多人共用的浏览器里保存私人薪资数据。</p>
  </section>

  <div v-if="receipt" class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3528]/40 p-4" @click.self="dismiss">
    <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" class="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-3xl border border-[#D6EADD] bg-[#FBFFFC] p-5 shadow-2xl sm:p-6">
      <h3 id="receipt-title" class="text-lg font-bold text-[#2A6B4B]">{{ receiptMessage }}</h3>
      <p class="mt-3 text-sm text-[#728B7A]">{{ activityNames[receipt.kind] }}完成！本次记录已保存在当前浏览器。</p>
      <div class="mt-4 grid grid-cols-2 gap-3">
        <div class="rounded-xl bg-[#EAF5EE] p-3"><p class="text-xs text-[#769081]">本次时长</p><p class="mt-2 text-base font-bold text-[#2A684A]">{{ durationText(receipt.durationMs) }}</p></div>
        <div class="rounded-xl bg-[#FFF2E4] p-3"><p class="text-xs text-[#917858]">对应模拟收入</p><p class="mt-2 text-base font-bold text-[#987344] tabular-nums">¥{{ cash(receipt.earned) }}</p></div>
      </div>
      <p class="mt-3 text-xs leading-5 text-[#829788]">活动收入属于正常工资的一部分，不会重复加钱。若发生在非计薪时段，收入可能为 ¥0.00。</p>
      <button type="button" class="mt-5 min-h-11 w-full rounded-xl bg-[#297A5B] px-4 py-2.5 font-semibold text-white hover:bg-[#206447]" autofocus @click="dismiss">收下奖励，继续打工</button>
    </div>
  </div>
</template>
