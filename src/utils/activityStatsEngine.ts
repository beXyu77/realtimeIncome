/**
 * V1.6 纯本地活动统计。所有日期范围采用设备本地时区。
 * 记录按「开始日期」归档，与旧版今日活动统计口径一致。
 * 对应活动工资已属于基本工资，不得再次累加到工资总额。
 */
import type { ActivityKind, ActivityRecord } from './activityEngine'

export type StatisticsPeriod = 'today' | 'week' | 'month'
export type ActivityTotals = { count: number; durationMs: number; paidDurationMs: number; earned: number }
export type ActivityStatistics = {
  rows: Record<ActivityKind, ActivityTotals>
  overall: ActivityTotals
  records: ActivityRecord[]
  start: Date
  end: Date
}

export const statisticKinds: readonly ActivityKind[] = ['toilet', 'fish', 'study']

function emptyTotals(): ActivityTotals {
  return { count: 0, durationMs: 0, paidDurationMs: 0, earned: 0 }
}

export function statisticRange(now: Date, period: StatisticsPeriod): { start: Date; end: Date } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const date = now.getDate()
  if (period === 'month') {
    return { start: new Date(year, month, 1), end: new Date(year, month + 1, 1) }
  }
  if (period === 'week') {
    // 星期一是一周的起点（JS 的星期日是 0）。
    const offset = (now.getDay() + 6) % 7
    return { start: new Date(year, month, date - offset), end: new Date(year, month, date - offset + 7) }
  }
  return { start: new Date(year, month, date), end: new Date(year, month, date + 1) }
}

function add(totals: ActivityTotals, record: ActivityRecord): void {
  totals.count += 1
  totals.durationMs += record.durationMs
  totals.paidDurationMs += record.paidDurationMs
  totals.earned += record.earned
}

export function calculateActivityStatistics(
  records: readonly ActivityRecord[],
  now: Date,
  period: StatisticsPeriod,
): ActivityStatistics {
  const { start, end } = statisticRange(now, period)
  const min = start.getTime()
  const max = end.getTime()
  const rows: Record<ActivityKind, ActivityTotals> = {
    toilet: emptyTotals(),
    fish: emptyTotals(),
    study: emptyTotals(),
  }
  const overall = emptyTotals()
  const selected: ActivityRecord[] = []
  for (const record of records) {
    // 数据来源必须是 activityEngine 已校验的记录；这里再检查日期与类别，避免异常渲染。
    if (!Number.isFinite(record.startedAt) || record.startedAt < min || record.startedAt >= max) continue
    if (!statisticKinds.includes(record.kind)) continue
    selected.push(record)
    add(rows[record.kind], record)
    add(overall, record)
  }
  selected.sort((a, b) => b.startedAt - a.startedAt)
  return { rows, overall, records: selected, start, end }
}

export function formatStatDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return hours > 0 ? `${hours}小时${minutes}分钟` : `${minutes}分钟`
}
