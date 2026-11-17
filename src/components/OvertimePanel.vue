<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  OVERTIME_STORAGE_KEY,
  activeOvertimeEarned,
  canStartOvertime,
  emptyOvertimeStore,
  formatOvertimeDuration,
  hourlyOvertimeRate,
  nextOvertimeBoundary,
  readOvertimeStore,
  settleOvertime,
  todayOvertimeEarned,
} from '../utils/overtimeEngine'
import type { ActiveOvertime, OvertimeRecord, OvertimeStore } from '../utils/overtimeEngine'
import type { PaySettings } from '../utils/salaryEngine'

const props = defineProps<{ settings: PaySettings; clock: Date }>()
const emit = defineEmits<{ change: [records: OvertimeRecord[], active: ActiveOvertime | null] }>()
const active = ref<ActiveOvertime | null>(null)
const records = ref<OvertimeRecord[]>([])
const error = ref('')
const notice = ref('')
const blocked = ref(false)
const lastReceipt = ref<OvertimeRecord | null>(null)

const money = (value: number) => value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const rate = computed(() => hourlyOvertimeRate(props.settings))
const eligible = computed(() => canStartOvertime(props.settings, props.clock.getTime()))
const runningMs = computed(() => active.value
  ? Math.max(0, Math.min(props.clock.getTime(), nextOvertimeBoundary(active.value.settingsAtStart, active.value.startedAt)) - active.value.startedAt)
  : 0)
const liveEarned = computed(() => active.value ? activeOvertimeEarned(active.value, props.clock.getTime()) : 0)
const earnedToday = computed(() => todayOvertimeEarned(records.value, active.value, props.clock))
const recent = computed(() => [...records.value].reverse().slice(0, 5))
const formatTime = (at: number) => new Date(at).toLocaleString('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
})

function emitChange() {
  emit('change', [...records.value], active.value)
}
function save(store: OvertimeStore): boolean {
  if (blocked.value) return false
  try {
    localStorage.setItem(OVERTIME_STORAGE_KEY, JSON.stringify(store))
    active.value = store.active
    records.value = store.records
    error.value = ''
    emitChange()
    return true
  } catch {
    error.value = '加班记录保存失败。本次操作没有完成，请检查浏览器的本地存储权限或空间。'
    return false
  }
}
function reconcile() {
  if (blocked.value || !active.value) return
  const boundary = nextOvertimeBoundary(active.value.settingsAtStart, active.value.startedAt)
  if (Date.now() < boundary) return
  const record = settleOvertime(active.value, boundary, 'schedule')
  if (save({ version: 1, active: null, records: [...records.value, record] })) {
    notice.value = `加班已在正常上班时间或午夜自动结束，记录 ${formatOvertimeDuration(record.durationMs)} 已保存。`
  }
}
function load() {
  try {
    const result = readOvertimeStore(localStorage.getItem(OVERTIME_STORAGE_KEY))
    blocked.value = Boolean(result.warning)
    error.value = result.warning
    active.value = result.store.active
    records.value = result.store.records
    emitChange()
    if (!blocked.value) reconcile()
  } catch {
    blocked.value = true
    error.value = '无法读取本地加班记录，请检查浏览器存储权限。'
    emitChange()
  }
}
function begin() {
  reconcile()
  if (blocked.value || active.value) return
  if (records.value.length >= 2000) {
    error.value = '加班记录已达到2000条，请先导出备份再清理旧记录。'
    return
  }
  const startedAt = Date.now()
  if (!canStartOvertime(props.settings, startedAt)) {
    error.value = '现在处于正常计薪时段，加班只能在正常计薪时段之外启动，避免重复计薪。'
    return
  }
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${startedAt}-${Math.random().toString(36).slice(2)}`
  const next: ActiveOvertime = {
    id, startedAt,
    settingsAtStart: { ...props.settings, weekdays: [...props.settings.weekdays] },
  }
  if (save({ version: 1, active: next, records: records.value })) {
    notice.value = '加班计时已开始。别忘了休息，结束时点击按钮结算。'
    lastReceipt.value = null
  }
}
function end() {
  reconcile()
  const current = active.value
  if (!current) return
  const record = settleOvertime(current, Date.now(), 'manual')
  if (save({ version: 1, active: null, records: [...records.value, record] })) {
    lastReceipt.value = record
    notice.value = ''
  }
}
function exportRecords() {
  if (!records.value.length) return
  try {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), records: records.value }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'paid-fishing-overtime-backup.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    error.value = '导出失败，请检查浏览器下载权限。'
  }
}
function clearRecords() {
  if (active.value) { error.value = '请先结束当前加班。'; return }
  if (!records.value.length) return
  if (!window.confirm('确认清除全部已完成加班记录？建议先导出备份；删除后不能恢复。工资设置和趣味活动不会受影响。')) return
  if (save(emptyOvertimeStore())) notice.value = '加班记录已清空。'
}
function onVisible() { if (!document.hidden) reconcile() }
function onStorage(event: StorageEvent) { if (event.key === OVERTIME_STORAGE_KEY) load() }
watch(() => props.clock.getTime(), reconcile)
onMounted(() => {
  load()
  window.addEventListener('focus', reconcile)
  window.addEventListener('storage', onStorage)
  document.addEventListener('visibilitychange', onVisible)
})
onUnmounted(() => {
  window.removeEventListener('focus', reconcile)
  window.removeEventListener('storage', onStorage)
  document.removeEventListener('visibilitychange', onVisible)
})
</script>

<template>
  <section class="min-w-0 space-y-4 rounded-2xl border border-[#DDEBDD] bg-[#FCFFFC] p-4 sm:p-5" aria-label="加班计时与结算">
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-base font-bold text-[#305E45]">🌙 加班记录</h3>
        <p class="mt-1 text-xs leading-5 text-[#809787]">仅手动启动 · 正常计薪时段不重复加钱</p>
      </div>
      <span class="shrink-0 rounded-full bg-[#EAF5ED] px-3 py-1 text-xs text-[#397F5E]">本地保存</span>
    </div>
    <div class="rounded-xl bg-[#F1F8F2] p-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm text-[#5E806A]">加班计薪规则</span>
        <span class="text-sm font-semibold text-[#2D7453]">{{ settings.overtimeType === 'none' ? '无加班费' : settings.overtimeType === 'unknown' ? '暂不计算' : `¥${money(rate)} / 小时` }}</span>
      </div>
      <p class="mt-2 text-xs leading-5 text-[#789082]">
        {{ settings.overtimeType === 'none' || settings.overtimeType === 'unknown' ? '可以记录加班时长，模拟加班收入为 ¥0.00。' : '按照首次启动时的加班规则结算；修改设置不会改变已开始的计时。' }}
      </p>
    </div>
    <div v-if="active" class="flex items-center justify-between gap-3 rounded-xl border border-[#D8E8DA] bg-[#F7FBF8] p-3">
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-semibold text-[#347758]">🌙 加班进行中</p>
        <p class="text-xs text-[#789082]">已记录约 {{ formatOvertimeDuration(runningMs) }}</p>
        <p class="break-all text-xs text-[#789082]">本次模拟收入 ¥{{ money(liveEarned) }}</p>
      </div>
      <button type="button" class="min-h-11 shrink-0 whitespace-nowrap rounded-xl bg-[#A66C47] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#8C5735] focus-visible:outline-2 focus-visible:outline-[#A66C47]" @click="end">结束加班</button>
    </div>
    <button
      v-else type="button" :disabled="blocked || !eligible"
      class="min-h-11 w-full rounded-xl bg-[#297A5B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#216448] focus-visible:outline-2 focus-visible:outline-[#297A5B] disabled:cursor-not-allowed disabled:opacity-50"
      @click="begin"
    >{{ eligible ? '开始记录加班' : '正常计薪中，暂不可开始加班' }}</button>
    <p v-if="lastReceipt" role="status" class="rounded-xl bg-[#FFF3E4] px-3 py-3 text-sm leading-6 text-[#8A653F]">
      🌱 本次加班已结束：{{ formatOvertimeDuration(lastReceipt.durationMs) }}，模拟加班收入 ¥{{ money(lastReceipt.earned) }}。辛苦了，记得给自己留点休息时间。
    </p>
    <p v-if="notice" role="status" class="rounded-xl bg-[#EAF5ED] px-3 py-2 text-xs leading-5 text-[#367654]">{{ notice }}</p>
    <p v-if="error" role="alert" class="rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">{{ error }}</p>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p class="text-xs text-[#718C7C]">今日加班模拟收入</p>
        <p class="mt-1 text-xl font-bold tabular-nums text-[#297A5B]">¥{{ money(earnedToday) }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button type="button" :disabled="!records.length" class="min-h-9 rounded-lg border border-[#CEE5D5] px-2 py-1 text-xs text-[#357956] disabled:opacity-40" @click="exportRecords">导出</button>
        <button type="button" :disabled="!records.length || Boolean(active)" class="min-h-9 rounded-lg border border-[#F1D8CF] px-2 py-1 text-xs text-[#A26653] disabled:opacity-40" @click="clearRecords">清空</button>
      </div>
    </div>
    <div v-if="recent.length" class="space-y-2">
      <h4 class="text-xs font-semibold text-[#54755D]">最近加班记录</h4>
      <ul class="divide-y divide-[#E4EEE6]">
        <li v-for="item in recent" :key="item.id" class="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
          <span class="min-w-0 text-[#678571]">{{ formatTime(item.startedAt) }} · {{ formatOvertimeDuration(item.durationMs) }}</span>
          <span class="font-semibold tabular-nums text-[#287A55]">+¥{{ money(item.earned) }}</span>
        </li>
      </ul>
    </div>
    <p class="text-xs leading-5 text-[#879C8B]">已记录的加班收入会单独加到今日工资合计中；厕所、摸鱼、学习的收入仍属于基本工资，不会重复加总。本功能不代表劳动法加班费计算或真实工资单。</p>
  </section>
</template>
