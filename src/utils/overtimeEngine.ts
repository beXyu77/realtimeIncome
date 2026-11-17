/**
 * V1.7 手动加班：纯计算 + 本地存储内容校验。
 * 仅允许在“基本工资非计薪时段”开始；进入正常计薪时段或午夜自动截止。
 * 已完成的加班记录在保存时冻结金额和时薪，之后修改工资设置不重算历史。
 */
import { getSalarySnapshot } from './salaryEngine'
import type { PaySettings } from './salaryEngine'

export const OVERTIME_STORAGE_KEY = 'paid-fishing:overtime:v1'
export type OvertimeEndReason = 'manual' | 'schedule'
export type ActiveOvertime = { id: string; startedAt: number; settingsAtStart: PaySettings }
export type OvertimeRecord = {
  id: string
  startedAt: number
  endedAt: number
  durationMs: number
  hourlyRate: number
  earned: number
  reason: OvertimeEndReason
}
export type OvertimeStore = { version: 1; active: ActiveOvertime | null; records: OvertimeRecord[] }
const MAX_RECORDS = 2000

function onLocalDay(day: Date, hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2))
  const minutes = Number(hhmm.slice(3, 5))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes).getTime()
}
function isWorkday(settings: PaySettings, date: Date): boolean {
  return settings.weekdays.includes(date.getDay() || 7)
}
function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) &&
    value > 946684800000 && value < Date.now() + 86_400_000
}
function validSettings(value: unknown): value is PaySettings {
  if (!value || typeof value !== 'object') return false
  const s = value as Partial<PaySettings>
  if (s.version !== 1 || !['monthly', 'hourly'].includes(s.salaryMode ?? '') ||
    !['gross', 'net'].includes(s.salaryBasis ?? '') ||
    typeof s.salary !== 'number' || !Number.isFinite(s.salary) || s.salary <= 0 || s.salary > 100_000_000 ||
    !Number.isInteger(s.monthlyWorkdays) || (s.monthlyWorkdays ?? 0) < 1 || (s.monthlyWorkdays ?? 0) > 31 ||
    !Array.isArray(s.weekdays) || s.weekdays.length === 0 ||
    !s.weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) ||
    new Set(s.weekdays).size !== s.weekdays.length ||
    typeof s.lunchPaid !== 'boolean' ||
    !['none', 'unknown', 'multiplier', 'fixed'].includes(s.overtimeType ?? '') ||
    typeof s.overtimeValue !== 'number' || !Number.isFinite(s.overtimeValue) ||
    !Number.isInteger(s.payday) || (s.payday ?? 0) < 1 || (s.payday ?? 0) > 31) return false
  const time = /^([01]\d|2[0-3]):[0-5]\d$/
  const a = s.morningStart
  const b = s.morningEnd
  const c = s.afternoonStart
  const d = s.afternoonEnd
  return [a, b, c, d].every((t) => typeof t === 'string' && time.test(t)) &&
    typeof a === 'string' && typeof b === 'string' && typeof c === 'string' && typeof d === 'string' &&
    a < b && b <= c && c < d &&
    (s.overtimeType !== 'multiplier' || (s.overtimeValue > 0 && s.overtimeValue <= 10)) &&
    (s.overtimeType !== 'fixed' || (s.overtimeValue > 0 && s.overtimeValue <= 1_000_000))
}

export function hourlyOvertimeRate(settings: PaySettings): number {
  if (settings.overtimeType === 'none' || settings.overtimeType === 'unknown') return 0
  if (settings.overtimeType === 'fixed') return settings.overtimeValue
  const date = new Date(2026, 0, 5) // 有效工作日与否不影响每日标准基本工资
  const first = onLocalDay(date, settings.morningStart)
  const lunchStart = onLocalDay(date, settings.morningEnd)
  const lunchEnd = onLocalDay(date, settings.afternoonStart)
  const end = onLocalDay(date, settings.afternoonEnd)
  const paidMs = lunchStart - first + end - lunchEnd + (settings.lunchPaid ? lunchEnd - lunchStart : 0)
  if (paidMs <= 0) return 0
  const baseHourly = settings.salaryMode === 'hourly'
    ? settings.salary
    : (settings.salary / settings.monthlyWorkdays) / (paidMs / 3_600_000)
  return baseHourly * settings.overtimeValue
}

export function canStartOvertime(settings: PaySettings, at: number): boolean {
  if (!Number.isFinite(at)) return false
  return getSalarySnapshot(settings, new Date(at)).activeRatePerSecond === 0
}

export function nextOvertimeBoundary(settings: PaySettings, startedAt: number): number {
  const date = new Date(startedAt)
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  if (!isWorkday(settings, date)) return midnight
  const boundaries = [midnight, onLocalDay(date, settings.morningStart)]
  // 只有午休不计薪时，下午上班才是另一个“计薪开始”边界。
  if (!settings.lunchPaid) boundaries.push(onLocalDay(date, settings.afternoonStart))
  return Math.min(...boundaries.filter((time) => time > startedAt))
}

export function activeOvertimeEarned(active: ActiveOvertime, asOf: number): number {
  const stopAt = Math.max(active.startedAt, Math.min(asOf, nextOvertimeBoundary(active.settingsAtStart, active.startedAt)))
  return (stopAt - active.startedAt) / 3_600_000 * hourlyOvertimeRate(active.settingsAtStart)
}

export function settleOvertime(active: ActiveOvertime, requestedEnd: number, reason: OvertimeEndReason): OvertimeRecord {
  const endedAt = Math.max(active.startedAt, Math.min(requestedEnd, nextOvertimeBoundary(active.settingsAtStart, active.startedAt)))
  return {
    id: active.id,
    startedAt: active.startedAt,
    endedAt,
    durationMs: endedAt - active.startedAt,
    hourlyRate: hourlyOvertimeRate(active.settingsAtStart),
    earned: activeOvertimeEarned(active, endedAt),
    reason,
  }
}

export function emptyOvertimeStore(): OvertimeStore { return { version: 1, active: null, records: [] } }
function validRecord(value: unknown): value is OvertimeRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<OvertimeRecord>
  return typeof r.id === 'string' && r.id.length > 0 && r.id.length <= 100 &&
    isValidTimestamp(r.startedAt) && isValidTimestamp(r.endedAt) &&
    r.endedAt >= r.startedAt && r.endedAt - r.startedAt <= 26 * 3_600_000 &&
    r.durationMs === r.endedAt - r.startedAt &&
    typeof r.hourlyRate === 'number' && Number.isFinite(r.hourlyRate) && r.hourlyRate >= 0 && r.hourlyRate <= 1_000_000_000 &&
    typeof r.earned === 'number' && Number.isFinite(r.earned) && r.earned >= 0 && r.earned <= 10_000_000_000 &&
    Math.abs(r.earned - r.durationMs / 3_600_000 * r.hourlyRate) <= 0.001 &&
    (r.reason === 'manual' || r.reason === 'schedule')
}
function validActive(value: unknown): value is ActiveOvertime {
  if (!value || typeof value !== 'object') return false
  const a = value as Partial<ActiveOvertime>
  return typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 100 &&
    isValidTimestamp(a.startedAt) && validSettings(a.settingsAtStart) &&
    canStartOvertime(a.settingsAtStart, a.startedAt)
}
export function readOvertimeStore(raw: string | null): { store: OvertimeStore; warning: string } {
  if (raw === null) return { store: emptyOvertimeStore(), warning: '' }
  try {
    if (raw.length > 1_500_000) throw new Error('too large')
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') throw new Error('invalid')
    const s = value as Partial<OvertimeStore>
    if (s.version !== 1 || !Array.isArray(s.records) || s.records.length > MAX_RECORDS ||
      !s.records.every(validRecord) || (s.active !== null && !validActive(s.active))) throw new Error('invalid')
    const ids = new Set<string>()
    for (const item of s.records) {
      if (ids.has(item.id)) throw new Error('duplicate id')
      ids.add(item.id)
    }
    if (s.active && ids.has(s.active.id)) throw new Error('duplicate active id')
    return { store: { version: 1, active: s.active ?? null, records: s.records }, warning: '' }
  } catch {
    return { store: emptyOvertimeStore(), warning: '本地加班记录无法校验，已停止写入以防覆盖原数据。请先在浏览器中备份原始数据。' }
  }
}

export function todayOvertimeEarned(records: readonly OvertimeRecord[], active: ActiveOvertime | null, now: Date): number {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime()
  let earned = 0
  for (const record of records) {
    if (record.startedAt >= dayStart && record.startedAt < dayEnd) earned += record.earned
  }
  if (active && active.startedAt >= dayStart && active.startedAt < dayEnd) {
    earned += activeOvertimeEarned(active, now.getTime())
  }
  return earned
}

export function formatOvertimeDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  return minutes >= 60 ? `${Math.floor(minutes / 60)}小时${minutes % 60}分钟` : `${minutes}分钟`
}
