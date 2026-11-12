/**
 * 带薪摸鱼 V1.1 —— 纯函数实时基本工资引擎。
 * 不读写网络、浏览器存储或其他外部资源，所有时间均按设备本地时间解释。
 * 加班在本阶段尚未实现：保留设置、合计展示为「基本工资 + 0」但明确标注未计入。
 */
export type SalaryMode = 'monthly' | 'hourly'
export type SalaryBasis = 'gross' | 'net'
export type OvertimeType = 'none' | 'unknown' | 'multiplier' | 'fixed'

export type PaySettings = {
  version: 1
  salaryMode: SalaryMode
  salaryBasis: SalaryBasis
  salary: number
  monthlyWorkdays: number
  weekdays: number[] // 周一为 1，周日为 7
  morningStart: string
  morningEnd: string
  afternoonStart: string
  afternoonEnd: string
  lunchPaid: boolean
  overtimeType: OvertimeType
  overtimeValue: number
  payday: number
}

export type AutoWorkStatus = 'before' | 'work' | 'lunch' | 'sprint' | 'off' | 'rest'

export type SalarySnapshot = {
  status: AutoWorkStatus
  isWorkday: boolean
  statusText: string
  message: string
  countdownText: string
  countdownMs: number
  dailyBasePay: number
  baseEarned: number
  overtimeEarned: number // 尚未启用加班计时；本阶段始终为 0
  totalEarned: number
  paidElapsedMs: number
  paidTotalMs: number
  progressPercent: number
  activeRatePerSecond: number
}

// 当前产品的初始化向导只允许 HH:mm、单日非跨午夜时段。
function timeParts(value: string): { hour: number; minute: number } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('无效的工作时间配置')
  const hour = Number(value.slice(0, 2))
  const minute = Number(value.slice(3, 5))
  return { hour, minute }
}

function onLocalDay(day: Date, hhmm: string): number {
  const { hour, minute } = timeParts(hhmm)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute).getTime()
}

function weekdayId(date: Date): number {
  return date.getDay() || 7
}

function portion(startMs: number, endMs: number, nowMs: number): number {
  // [start,end] 与 [过去,现在] 的交集，确保不会产生负数或未来收入。
  return Math.max(0, Math.min(nowMs, endMs) - startMs)
}

function nextWorkStart(today: Date, settings: PaySettings, fromCurrentDay: boolean): number {
  // 至多 7 天一定存在至少一个工作日（已在初始化校验）。
  for (let offset = fromCurrentDay ? 0 : 1; offset <= 7; offset += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)
    if (settings.weekdays.includes(weekdayId(candidate))) {
      const start = onLocalDay(candidate, settings.morningStart)
      if (start > today.getTime()) return start
    }
  }
  return today.getTime()
}

export function getSalarySnapshot(settings: PaySettings, now: Date): SalarySnapshot {
  if (!Number.isFinite(now.getTime())) throw new Error('无效的当前时间')

  const start = onLocalDay(now, settings.morningStart)
  const lunchStart = onLocalDay(now, settings.morningEnd)
  const lunchEnd = onLocalDay(now, settings.afternoonStart)
  const end = onLocalDay(now, settings.afternoonEnd)
  if (!(start < lunchStart && lunchStart <= lunchEnd && lunchEnd < end)) {
    throw new Error('工作时段配置无效')
  }
  if (!Number.isFinite(settings.salary) || settings.salary <= 0 ||
      !Number.isInteger(settings.monthlyWorkdays) || settings.monthlyWorkdays <= 0 ||
      settings.weekdays.length === 0) {
    throw new Error('工资配置无效')
  }

  const isWorkday = settings.weekdays.includes(weekdayId(now))
  const plannedMs = (lunchStart - start) + (end - lunchEnd) + (settings.lunchPaid ? lunchEnd - lunchStart : 0)
  const current = now.getTime()
  const elapsedMs = isWorkday
    ? portion(start, lunchStart, current) + portion(lunchEnd, end, current) +
      (settings.lunchPaid ? portion(lunchStart, lunchEnd, current) : 0)
    : 0

  const dailyBasePay = settings.salaryMode === 'monthly'
    ? settings.salary / settings.monthlyWorkdays
    : (settings.salary * plannedMs) / 3_600_000
  const baseEarned = plannedMs > 0
    ? settings.salaryMode === 'monthly'
      ? dailyBasePay * elapsedMs / plannedMs
      : settings.salary * elapsedMs / 3_600_000
    : 0

  let status: AutoWorkStatus
  let countdownTarget: number
  let countdownText: string
  let statusText: string
  let message: string

  if (!isWorkday) {
    status = 'rest'
    statusText = '休息日'
    message = '🌱 今天不用搬砖，工资计时器也在休息。'
    countdownText = '距离下次上班'
    countdownTarget = nextWorkStart(now, settings, false)
  } else if (current < start) {
    status = 'before'
    statusText = '尚未上班'
    message = '☀️ 今日牛马体验卡还没有生效。'
    countdownText = '距离上班'
    countdownTarget = start
  } else if (current < lunchStart) {
    status = 'work'
    statusText = '工作中'
    message = '🌱 今天也是稳定从公司回本的一天。'
    countdownText = '距离午休'
    countdownTarget = lunchStart
  } else if (current < lunchEnd) {
    status = 'lunch'
    statusText = '午休中'
    message = settings.lunchPaid ? '🍱 带薪干饭中，午休也在攒钱！' : '🍱 干饭时间！工作可以等，鸡腿不能。'
    countdownText = '距离下午上班'
    countdownTarget = lunchEnd
  } else if (current < end && current >= end - 30 * 60_000) {
    status = 'sprint'
    statusText = '下班冲刺中'
    message = '🏃 最后30分钟，灵魂已经提前下班。'
    countdownText = '距离下班'
    countdownTarget = end
  } else if (current < end) {
    status = 'work'
    statusText = '工作中'
    message = '💰 你的每一分钟都在悄悄变成工资。'
    countdownText = '距离下班'
    countdownTarget = end
  } else {
    status = 'off'
    statusText = '已下班'
    message = '🎉 今日牛马任务完成，快去享受生活！'
    countdownText = '距离下次上班'
    countdownTarget = nextWorkStart(now, settings, false)
  }

  const activePaidTime = isWorkday && current >= start && current < end &&
    (settings.lunchPaid || current < lunchStart || current >= lunchEnd)
  const baseRatePerSecond = plannedMs > 0 ? dailyBasePay / (plannedMs / 1000) : 0
  const safeBase = Math.min(dailyBasePay, Math.max(0, baseEarned))
  const overtimeEarned = 0 // 后续加入手动加班记录后再计算；避免把下班时间自动认作加班。

  return {
    status,
    isWorkday,
    statusText,
    message,
    countdownText,
    countdownMs: Math.max(0, countdownTarget - current),
    dailyBasePay,
    baseEarned: safeBase,
    overtimeEarned,
    totalEarned: safeBase + overtimeEarned,
    paidElapsedMs: elapsedMs,
    paidTotalMs: isWorkday ? plannedMs : 0,
    progressPercent: isWorkday && plannedMs > 0 ? Math.min(100, elapsedMs / plannedMs * 100) : 0,
    activeRatePerSecond: activePaidTime ? baseRatePerSecond : 0,
  }
}

export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  return [hours, minutes, remainder].map((value) => String(value).padStart(2, '0')).join(':')
}
