/**
 * V1.5 成就引擎：纯计算，不读写浏览器存储、不调用网络。
 * 只依据 V1.2 已有的活动记录产生结果。删除活动记录即重新计算解锁状态。
 */
import type { ActivityKind, ActivityRecord } from './activityEngine'

export type Achievement = {
  id: string
  icon: string
  title: string
  description: string
  requirement: string
  secret: boolean
  unlocked: boolean
  progress: number
  goal: number
  progressText: string
}

type Counts = Record<ActivityKind, number>
type Durations = Record<ActivityKind, number>

type Metrics = {
  counts: Counts
  durations: Durations
  total: number
  studyDays: number
  varieties: number
  allKindsSameDay: boolean
}

type AchievementDefinition = {
  id: string
  icon: string
  title: string
  description: string
  requirement: string
  secret: boolean
  goal: number
  unit: string
  current: (stats: Metrics) => number
}

const definitions: readonly AchievementDefinition[] = [
  {
    id: 'toilet-first', icon: '🚽', title: '厕所印钞机',
    description: '恭喜完成第一次厕所活动记录，公司又投资了你的日常生活。',
    requirement: '完成 1 次厕所记录', secret: false,
    goal: 1, unit: '次', current: (s) => s.counts.toilet,
  },
  {
    id: 'fish-first', icon: '🐟', title: '鱼塘报到',
    description: '第一次摸鱼记录成功：工位是固定的，灵魂是自由的。',
    requirement: '完成 1 次摸鱼记录', secret: false,
    goal: 1, unit: '次', current: (s) => s.counts.fish,
  },
  {
    id: 'study-first', icon: '📖', title: '偷偷升级',
    description: '知识不一定马上变现，但技能树已经悄悄亮了。',
    requirement: '完成 1 次学习记录', secret: false,
    goal: 1, unit: '次', current: (s) => s.counts.study,
  },
  {
    id: 'fish-60m', icon: '🐠', title: '摸鱼宗师',
    description: '鱼塘总时长达到一小时，恭喜获得本地鱼塘荣誉称号。',
    requirement: '累计摸鱼 60 分钟', secret: false,
    goal: 60, unit: '分钟', current: (s) => s.durations.fish / 60_000,
  },
  {
    id: 'study-30m', icon: '🌱', title: '技能树发芽',
    description: '累计学习半小时，给未来的自己攒了一点底气。',
    requirement: '累计学习 30 分钟', secret: false,
    goal: 30, unit: '分钟', current: (s) => s.durations.study / 60_000,
  },
  {
    id: 'study-120m', icon: '📚', title: '学习狂魔',
    description: '两小时学习记录，是给自己的一笔长期投资。',
    requirement: '累计学习 120 分钟', secret: false,
    goal: 120, unit: '分钟', current: (s) => s.durations.study / 60_000,
  },
  {
    id: 'study-3days', icon: '🪴', title: '三日开卷',
    description: '在三个不同的日子留下学习记录，稳定比冲刺更可贵。',
    requirement: '在 3 个不同自然日完成学习记录', secret: false,
    goal: 3, unit: '天', current: (s) => s.studyDays,
  },
  {
    id: 'five-records', icon: '📝', title: '生活记录官',
    description: '记录五次小日常，原来上班时间也能有一本趣味日记。',
    requirement: '累计完成 5 次活动', secret: false,
    goal: 5, unit: '次', current: (s) => s.total,
  },
  {
    id: 'all-kinds', icon: '🎭', title: '职场多面手',
    description: '厕所、摸鱼和学习，三种体验全部集齐！',
    requirement: '累计体验 3 类活动', secret: true,
    goal: 3, unit: '类', current: (s) => s.varieties,
  },
  {
    id: 'same-day-trio', icon: '✨', title: '今日全勤演员',
    description: '同一天完成三类活动：今天是丰富多彩的一天。',
    requirement: '同一自然日完成三类不同活动', secret: true,
    goal: 1, unit: '次', current: (s) => Number(s.allKindsSameDay),
  },
]

function localDayKey(time: number): string {
  const day = new Date(time)
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
}

/** 轻量二次防御：不信任计算入口收到的记录，且不因未来无效时间解锁成就。 */
function usableRecord(record: ActivityRecord): boolean {
  return (record.kind === 'toilet' || record.kind === 'fish' || record.kind === 'study') &&
    Number.isFinite(record.startedAt) && Number.isFinite(record.endedAt) &&
    record.startedAt > 946684800000 && record.startedAt <= record.endedAt &&
    record.endedAt <= Date.now() + 86_400_000 &&
    Number.isFinite(record.durationMs) && record.durationMs >= 0 &&
    record.durationMs === record.endedAt - record.startedAt && record.durationMs <= 86_400_000
}

function metricsFromRecords(records: readonly ActivityRecord[]): Metrics {
  const counts: Counts = { toilet: 0, fish: 0, study: 0 }
  const durations: Durations = { toilet: 0, fish: 0, study: 0 }
  const studyDays = new Set<string>()
  const kindsByDay = new Map<string, Set<ActivityKind>>()
  const seenIds = new Set<string>()
  let total = 0

  for (const record of records) {
    if (!usableRecord(record) || seenIds.has(record.id)) continue
    seenIds.add(record.id)
    total += 1
    counts[record.kind] += 1
    durations[record.kind] += record.durationMs
    const day = localDayKey(record.startedAt)
    if (record.kind === 'study') studyDays.add(day)
    let dayKinds = kindsByDay.get(day)
    if (!dayKinds) {
      dayKinds = new Set<ActivityKind>()
      kindsByDay.set(day, dayKinds)
    }
    dayKinds.add(record.kind)
  }

  return {
    counts,
    durations,
    total,
    studyDays: studyDays.size,
    varieties: Number(counts.toilet > 0) + Number(counts.fish > 0) + Number(counts.study > 0),
    allKindsSameDay: [...kindsByDay.values()].some((kinds) => kinds.size === 3),
  }
}

export function evaluateAchievements(records: readonly ActivityRecord[]): Achievement[] {
  const stats = metricsFromRecords(records)
  return definitions.map((definition) => {
    const raw = definition.current(stats)
    const unlocked = raw >= definition.goal
    const current = Math.min(definition.goal, raw)
    return {
      id: definition.id,
      icon: definition.icon,
      title: definition.title,
      description: definition.description,
      requirement: definition.requirement,
      secret: definition.secret,
      unlocked,
      progress: Math.round((current / definition.goal) * 100),
      goal: definition.goal,
      progressText: `${Math.min(definition.goal, Math.floor(raw))} / ${definition.goal} ${definition.unit}`,
    }
  })
}
