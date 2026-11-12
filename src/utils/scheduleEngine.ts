/**
 * V1.3 时间提醒引擎：只计算本地工作日的事件，不依赖网络/定时器。
 * 工资仍由 salaryEngine.ts 计算；此模块不会改变任何收入。
 */
import type { PaySettings } from './salaryEngine'

export type ScheduleEventKind =
  | 'work-start'
  | 'lunch-soon'
  | 'lunch-start'
  | 'lunch-end-soon'
  | 'lunch-end'
  | 'sprint'
  | 'work-end'

export type ScheduleEvent = {
  kind: ScheduleEventKind
  key: string
  at: number
  timeText: string
  title: string
  message: string
}

export function localDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function todayTime(day: Date, hhmm: string): number {
  const hours = Number(hhmm.slice(0, 2))
  const minutes = Number(hhmm.slice(3, 5))
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes).getTime()
}

/** 不跨日期安排预提醒；零长度午休不生成午休提醒。 */
export function scheduleForDay(settings: PaySettings, day: Date): ScheduleEvent[] {
  if (!Number.isFinite(day.getTime()) || !settings.weekdays.includes(day.getDay() || 7)) return []
  const morningStart = todayTime(day, settings.morningStart)
  const lunchStart = todayTime(day, settings.morningEnd)
  const lunchEnd = todayTime(day, settings.afternoonStart)
  const workEnd = todayTime(day, settings.afternoonEnd)
  if (!(morningStart < lunchStart && lunchStart <= lunchEnd && lunchEnd < workEnd)) return []
  const startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const nextMidnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime()
  const id = localDayKey(day)
  const result: ScheduleEvent[] = []
  function add(kind: ScheduleEventKind, at: number, title: string, message: string) {
    if (at < startOfDay || at >= nextMidnight) return
    result.push({ kind, key: `${id}:${kind}`, at, title, message,
      timeText: new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(at) })
  }
  add('work-start', morningStart, '开始工作啦', '🌱 今日牛马体验卡已生效，开始积累模拟工资。')
  if (lunchEnd > lunchStart) {
    if (lunchStart - morningStart >= 5 * 60_000) {
      add('lunch-soon', lunchStart - 5 * 60_000, '还有5分钟开饭', '🍚 可以准备收尾啦，鸡腿不等人。')
    }
    add('lunch-start', lunchStart, '午休开始', settings.lunchPaid
      ? '🍱 带薪干饭时间到，午休也继续计薪。'
      : '🍱 干饭时间到！当前暂停模拟计薪。')
    if (lunchEnd - lunchStart >= 5 * 60_000) {
      add('lunch-end-soon', lunchEnd - 5 * 60_000, '午休还有5分钟', '😴 再伸个懒腰，马上重返工位。')
    }
    add('lunch-end', lunchEnd, '午休结束', '💼 下午的工资模拟重新开始啦。')
  }
  if (workEnd - lunchEnd > 30 * 60_000) {
    add('sprint', workEnd - 30 * 60_000, '进入下班冲刺', '🏃 最后30分钟，灵魂已经站在公司门口。')
  }
  add('work-end', workEnd, '今天下班啦', '🎉 今日打工人生存成功！可以查看今天的工资结算。')
  return result.sort((a, b) => a.at - b.at)
}

/** 只提示刚刚到点的事件，防止隔了几小时打开网页时弹过期提醒。 */
export function recentScheduleEvent(settings: PaySettings, now: Date): ScheduleEvent | null {
  const ms = now.getTime()
  const events = scheduleForDay(settings, now)
  const recent = events.filter((event) => ms >= event.at && ms - event.at < 2 * 60_000)
  return recent[recent.length - 1] ?? null
}

export function nextScheduleEvent(settings: PaySettings, now: Date): ScheduleEvent | null {
  return scheduleForDay(settings, now).find((event) => event.at > now.getTime()) ?? null
}
