/**
 * 带薪摸鱼 V1.2 活动引擎（纯函数）。
 * 活动结算使用 V1.1.1 相同的工资引擎，绝不把活动收入加到总工资。
 * 每次活动保存启动时的计薪规则快照，修改设置不追溯重算历史记录。
 */
import { getSalarySnapshot } from './salaryEngine'
import type { PaySettings } from './salaryEngine'

export type ActivityKind = 'toilet' | 'fish' | 'study'
export type EndReason = 'manual' | 'schedule'
export type ActiveActivity = {
  id: string
  kind: ActivityKind
  startedAt: number
  settingsAtStart: PaySettings
}
export type ActivityRecord = {
  id: string
  kind: ActivityKind
  startedAt: number
  endedAt: number
  durationMs: number
  paidDurationMs: number
  earned: number
  reason: EndReason
}
export type ActivityStore = {
  version: 1
  active: ActiveActivity | null
  records: ActivityRecord[]
}

export const ACTIVITY_STORAGE_KEY = 'paid-fishing:activities:v1'
export const activityNames: Record<ActivityKind, string> = {
  toilet: '厕所',
  fish: '摸鱼',
  study: '学习',
}

const kinds: ActivityKind[] = ['toilet', 'fish', 'study']
const maxRecords = 3000

export function isActivityKind(value: unknown): value is ActivityKind {
  return kinds.includes(value as ActivityKind)
}

function validSettings(value: unknown): value is PaySettings {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<PaySettings>
  if (s.version !== 1 || !['monthly', 'hourly'].includes(s.salaryMode ?? '') ||
      !['gross', 'net'].includes(s.salaryBasis ?? '') ||
      typeof s.salary !== 'number' || !Number.isFinite(s.salary) || s.salary <= 0 || s.salary > 100_000_000 ||
      !Number.isInteger(s.monthlyWorkdays) || (s.monthlyWorkdays ?? 0) < 1 || (s.monthlyWorkdays ?? 0) > 31 ||
      !Array.isArray(s.weekdays) || !s.weekdays.length ||
      !s.weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ||
      new Set(s.weekdays).size !== s.weekdays.length ||
      typeof s.lunchPaid !== 'boolean' ||
      !['none', 'unknown', 'multiplier', 'fixed'].includes(s.overtimeType ?? '') ||
      typeof s.overtimeValue !== 'number' || !Number.isFinite(s.overtimeValue) ||
      !Number.isInteger(s.payday) || (s.payday ?? 0) < 1 || (s.payday ?? 0) > 31) return false
  const re = /^([01]\d|2[0-3]):[0-5]\d$/
  const times = [s.morningStart, s.morningEnd, s.afternoonStart, s.afternoonEnd]
  if (!times.every((t) => typeof t === 'string' && re.test(t))) return false
  const [a = '', b = '', c = '', d = ''] = times
  return a < b && b <= c && c < d
}

function validTimestamp(value: unknown): value is number {
  // 拒绝 NaN、过早或明显未来的时间；输入来自浏览器本地保存，不能无条件信任。
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value > 946684800000 && value < Date.now() + 86_400_000
}
function validRecord(value: unknown): value is ActivityRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<ActivityRecord>
  return typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100 &&
    isActivityKind(r.kind) && validTimestamp(r.startedAt) && validTimestamp(r.endedAt) &&
    r.endedAt >= r.startedAt && r.endedAt - r.startedAt <= 86_400_000 &&
    typeof r.durationMs === 'number' && r.durationMs === r.endedAt - r.startedAt &&
    typeof r.paidDurationMs === 'number' && Number.isFinite(r.paidDurationMs) &&
    r.paidDurationMs >= 0 && r.paidDurationMs <= r.durationMs &&
    typeof r.earned === 'number' && Number.isFinite(r.earned) && r.earned >= 0 &&
    r.earned <= 1_000_000_000_000 && (r.reason === 'manual' || r.reason === 'schedule')
}
function validActive(value: unknown): value is ActiveActivity {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<ActiveActivity>
  return typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 100 &&
    isActivityKind(a.kind) && validTimestamp(a.startedAt) &&
    validSettings(a.settingsAtStart)
}

export function emptyActivityStore(): ActivityStore {
  return { version: 1, active: null, records: [] }
}

export function readActivityStore(raw: string | null): { store: ActivityStore; warning: string } {
  if (raw === null) return { store: emptyActivityStore(), warning: '' }
  try {
    if (raw.length > 2_000_000) throw new Error('存储数据过大')
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') throw new Error('格式不正确')
    const store = value as Partial<ActivityStore>
    if (store.version !== 1 || !Array.isArray(store.records) || store.records.length > maxRecords) {
      throw new Error('版本不兼容或记录过多')
    }
    if (!store.records.every(validRecord) || (store.active !== null && !validActive(store.active))) {
      throw new Error('存在无效活动记录')
    }
    const ids = new Set<string>()
    for (const record of store.records) {
      if (ids.has(record.id)) throw new Error('存在重复活动记录')
      ids.add(record.id)
    }
    if (store.active && ids.has(store.active.id)) throw new Error('存在重复活动编号')
    return { store: { version: 1, active: store.active ?? null, records: store.records }, warning: '' }
  } catch {
    // 不覆盖损坏数据，保留原内容供用户自行排查/备份。
    return { store: emptyActivityStore(), warning: '本地活动记录格式异常，当前已停止读取。原始数据未被自动清除；请先备份浏览器数据。' }
  }
}

function onDay(day: Date, hhmm: string): number {
  const hour = Number(hhmm.slice(0, 2))
  const minute = Number(hhmm.slice(3, 5))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime()
}

export function nextActivityBoundary(settings: PaySettings, startedAt: number): number {
  const started = new Date(startedAt)
  const nextMidnight = new Date(started.getFullYear(), started.getMonth(), started.getDate() + 1).getTime()
  const candidates = [
    onDay(started, settings.morningStart),
    onDay(started, settings.morningEnd),
    onDay(started, settings.afternoonStart),
    onDay(started, settings.afternoonEnd),
    nextMidnight,
  ].filter((time) => time > startedAt)
  return Math.min(...candidates)
}

export function canStartActivity(kind: ActivityKind, settings: PaySettings, at: number): boolean {
  if (kind === 'study') return true // 非工作时间学习只记录时长，不算带薪。
  const status = getSalarySnapshot(settings, new Date(at)).status
  return status === 'work' || status === 'sprint'
}

export function settleActivity(active: ActiveActivity, requestedEndAt: number, reason: EndReason): ActivityRecord {
  const boundary = nextActivityBoundary(active.settingsAtStart, active.startedAt)
  const endedAt = Math.max(active.startedAt, Math.min(requestedEndAt, boundary))
  const nowDate = new Date(active.startedAt)
  const nextMidnight = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1).getTime()
  // 午夜为下一日期的零点；结算本日时必须用前一日期的末时刻做工资快照。
  const endForSnapshot = Math.min(endedAt, nextMidnight - 1)
  const before = getSalarySnapshot(active.settingsAtStart, new Date(active.startedAt))
  const after = getSalarySnapshot(active.settingsAtStart, new Date(endForSnapshot))
  const paidDurationMs = Math.max(0, after.paidElapsedMs - before.paidElapsedMs)
  const earned = Math.max(0, after.baseEarned - before.baseEarned)
  return {
    id: active.id,
    kind: active.kind,
    startedAt: active.startedAt,
    endedAt,
    durationMs: endedAt - active.startedAt,
    paidDurationMs,
    earned,
    reason,
  }
}

export function durationText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return hours > 0
    ? `${hours}小时${minutes}分${seconds}秒`
    : `${minutes}分${seconds}秒`
}
