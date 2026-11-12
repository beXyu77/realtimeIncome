<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

type SalaryMode = 'monthly' | 'hourly'
type SalaryBasis = 'gross' | 'net'
type OvertimeType = 'none' | 'unknown' | 'multiplier' | 'fixed'

type PaySettings = {
  version: 1
  salaryMode: SalaryMode
  salaryBasis: SalaryBasis
  salary: number
  monthlyWorkdays: number
  weekdays: number[]
  morningStart: string
  morningEnd: string
  afternoonStart: string
  afternoonEnd: string
  lunchPaid: boolean
  overtimeType: OvertimeType
  overtimeValue: number
  payday: number
}

const STORAGE_KEY = 'paid-fishing:pay-settings:v1'
const weekdays = [
  { id: 1, name: '一' },
  { id: 2, name: '二' },
  { id: 3, name: '三' },
  { id: 4, name: '四' },
  { id: 5, name: '五' },
  { id: 6, name: '六' },
  { id: 7, name: '日' },
]

const form = reactive({
  salaryMode: 'monthly' as SalaryMode,
  salaryBasis: 'gross' as SalaryBasis,
  salary: '',
  monthlyWorkdays: '22',
  weekdays: [1, 2, 3, 4, 5] as number[],
  morningStart: '08:30',
  morningEnd: '12:00',
  afternoonStart: '13:30',
  afternoonEnd: '18:00',
  lunchPaid: false,
  overtimeType: 'none' as OvertimeType,
  overtimeValue: '1.5',
  payday: '15',
})

const step = ref(1)
const completed = ref(false)
const error = ref('')

function toMinutes(time: string): number {
  // 验证时间格式：HH:mm
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return NaN
  }

  // 设置默认值，避免 undefined 类型错误
  const [hours = NaN, minutes = NaN] = time.split(':').map(Number)

  return hours * 60 + minutes
}

const paidMinutes = computed(() => {
  const start = toMinutes(form.morningStart)
  const lunchStart = toMinutes(form.morningEnd)
  const lunchEnd = toMinutes(form.afternoonStart)
  const end = toMinutes(form.afternoonEnd)
  if (![start, lunchStart, lunchEnd, end].every(Number.isFinite)) return 0
  const result = end - start - (form.lunchPaid ? 0 : lunchEnd - lunchStart)
  return Math.max(0, result)
})

const dailyPay = computed(() => {
  const salary = Number(form.salary)
  if (!Number.isFinite(salary) || salary <= 0 || paidMinutes.value <= 0) return 0
  return form.salaryMode === 'monthly'
    ? salary / Number(form.monthlyWorkdays)
    : (salary * paidMinutes.value) / 60
})
const hourlyPay = computed(() =>
  paidMinutes.value ? (dailyPay.value * 60) / paidMinutes.value : 0,
)
const secondPay = computed(() => hourlyPay.value / 3600)
const money = (value: number, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : '—')

function toggleWeekday(day: number) {
  form.weekdays = form.weekdays.includes(day)
    ? form.weekdays.filter((item) => item !== day)
    : [...form.weekdays, day].sort((a, b) => a - b)
}

function validateStep(index: number): string {
  if (index === 1) {
    if (
      !Number.isFinite(Number(form.salary)) ||
      Number(form.salary) <= 0 ||
      Number(form.salary) > 100_000_000
    ) {
      return '请输入大于 0 且不超过 1 亿元的工资金额。'
    }
  }
  if (index === 2) {
    const workdays = Number(form.monthlyWorkdays)
    if (!Number.isInteger(workdays) || workdays < 1 || workdays > 31)
      return '每月计薪工作日必须是 1–31 之间的整数。'
    if (!form.weekdays.length) return '请至少选择一个工作日。'

    const a = toMinutes(form.morningStart)
    const b = toMinutes(form.morningEnd)
    const c = toMinutes(form.afternoonStart)
    const d = toMinutes(form.afternoonEnd)

    if (![a, b, c, d].every(Number.isFinite) || !(a < b && b <= c && c < d)) {
      return '请检查时间顺序：上午开始 < 上午结束 ≤ 下午开始 < 下午结束。暂不支持跨午夜班次。'
    }
  }
  if (index === 3) {
    const payday = Number(form.payday)
    if (!Number.isInteger(payday) || payday < 1 || payday > 31)
      return '发薪日必须是 1-31 之间的整数。'
    if (form.overtimeType === 'multiplier') {
      const rate = Number(form.overtimeValue)
      if (!Number.isFinite(rate) || rate <= 0 || rate > 10)
        return '加班倍率请输入大于 0 且不超过 10 的数字。'
    }
    if (form.overtimeType === 'fixed') {
      const rate = Number(form.overtimeValue)
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1_000_000)
        return '加班时薪请输入有效的正数。'
    }
  }
  return ''
}

function next() {
  error.value = validateStep(step.value)
  if (!error.value) step.value += 1
}

function back() {
  error.value = ''
  step.value -= 1
}

function isValidSaved(value: unknown): value is PaySettings {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<PaySettings>
  const validTime = (x: unknown) => typeof x === 'string' && Number.isFinite(toMinutes(x))
  if (
    v.version !== 1 ||
    !['monthly', 'hourly'].includes(v.salaryMode ?? '') ||
    !['gross', 'net'].includes(v.salaryBasis ?? '') ||
    typeof v.salary !== 'number' ||
    !Number.isFinite(v.salary) ||
    v.salary <= 0 ||
    v.salary > 100_000_000 ||
    typeof v.monthlyWorkdays !== 'number' ||
    !Number.isInteger(v.monthlyWorkdays) ||
    v.monthlyWorkdays < 1 ||
    v.monthlyWorkdays > 31 ||
    !Array.isArray(v.weekdays) ||
    v.weekdays.length === 0 ||
    !v.weekdays.every((x) => Number.isInteger(x) && x >= 1 && x <= 7) ||
    new Set(v.weekdays).size !== v.weekdays.length ||
    !validTime(v.morningStart) ||
    !validTime(v.morningEnd) ||
    !validTime(v.afternoonStart) ||
    !validTime(v.afternoonEnd) ||
    typeof v.lunchPaid !== 'boolean' ||
    !['none', 'unknown', 'multiplier', 'fixed'].includes(v.overtimeType ?? '') ||
    typeof v.overtimeValue !== 'number' ||
    !Number.isFinite(v.overtimeValue) ||
    (v.overtimeType === 'multiplier' && !(v.overtimeValue > 0 && v.overtimeValue <= 10)) ||
    (v.overtimeType === 'fixed' && !(v.overtimeValue > 0 && v.overtimeValue <= 1_000_000)) ||
    typeof v.payday !== 'number' ||
    !Number.isInteger(v.payday) ||
    v.payday < 1 ||
    v.payday > 31
  )
    return false
  return (
    toMinutes(v.morningStart!) < toMinutes(v.morningEnd!) &&
    toMinutes(v.morningEnd!) <= toMinutes(v.afternoonStart!) &&
    toMinutes(v.afternoonStart!) < toMinutes(v.afternoonEnd!)
  )
}

onMounted(() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return
    const loaded: unknown = JSON.parse(stored)
    if (!isValidSaved(loaded)) return
    Object.assign(form, {
      salaryMode: loaded.salaryMode,
      salaryBasis: loaded.salaryBasis,
      salary: String(loaded.salary),
      monthlyWorkdays: String(loaded.monthlyWorkdays),
      weekdays: [...loaded.weekdays],
      morningStart: loaded.morningStart,
      morningEnd: loaded.morningEnd,
      afternoonStart: loaded.afternoonStart,
      afternoonEnd: loaded.afternoonEnd,
      lunchPaid: loaded.lunchPaid,
      overtimeType: loaded.overtimeType,
      overtimeValue: String(loaded.overtimeValue),
      payday: String(loaded.payday),
    })
    completed.value = true
  } catch {
    // 存储被浏览器禁用或数据异常时，安全地回到初始化界面。
  }
})

function finish() {
  for (const index of [1, 2, 3]) {
    error.value = validateStep(index)
    if (error.value) {
      step.value = index
      return
    }
  }
  const settings: PaySettings = {
    version: 1,
    salaryMode: form.salaryMode,
    salaryBasis: form.salaryBasis,
    salary: Number(form.salary),
    monthlyWorkdays: Number(form.monthlyWorkdays),
    weekdays: [...form.weekdays],
    morningStart: form.morningStart,
    morningEnd: form.morningEnd,
    afternoonStart: form.afternoonStart,
    afternoonEnd: form.afternoonEnd,
    lunchPaid: form.lunchPaid,
    overtimeType: form.overtimeType,
    overtimeValue: Number(form.overtimeValue) || 0,
    payday: Number(form.payday),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    error.value = ''
    completed.value = true
  } catch {
    error.value = '浏览器阻止了本地保存。请检查隐私模式或浏览器存储权限，当前资料尚未保存。'
  }
}
</script>

<template>
  <main class="min-h-screen bg-[#F5FAF5] px-4 py-8 text-[#264E3B] sm:px-6 sm:py-12">
    <div class="mx-auto w-full max-w-2xl">
      <header class="mb-7 flex items-center gap-3">
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#DFEFE4] text-2xl"
          aria-hidden="true"
        >
          🐟
        </div>
        <div>
          <h1 class="text-xl font-bold tracking-tight sm:text-2xl">带薪摸鱼</h1>
          <p class="text-xs text-[#6B8B78] sm:text-sm">上班的每一秒，都在悄悄发财 🌱</p>
        </div>
      </header>

      <section
        class="rounded-3xl border border-[#DCEBDD] bg-white p-5 shadow-[0_12px_50px_rgba(40,110,70,.06)] sm:p-8"
      >
        <template v-if="completed">
          <span class="rounded-full bg-[#E1F2E8] px-3 py-1 text-xs font-semibold text-[#287A55]"
            >✓ 配置已保存到本机</span
          >
          <h2 class="mt-4 text-2xl font-bold">准备好开始摸鱼了吗？</h2>
          <p class="mt-2 text-sm leading-6 text-[#668574]">
            下面是根据你的资料计算的<strong>标准工作日预计基本工资</strong>。实时计时、活动记录和加班结算将在下一阶段接入。
          </p>
          <div class="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div class="rounded-2xl bg-[#F1F9F3] p-4">
              <p class="text-sm text-[#6D8A79]">每日预计基本工资</p>
              <p class="mt-2 break-all text-3xl font-bold tabular-nums text-[#297A5B]">
                ¥ {{ money(dailyPay) }}
              </p>
            </div>
            <div class="rounded-2xl bg-[#F8F7F0] p-4">
              <p class="text-sm text-[#6D8A79]">每秒模拟工资</p>
              <p class="mt-2 break-all text-3xl font-bold tabular-nums text-[#297A5B]">
                ¥ {{ money(secondPay, 5) }}
              </p>
            </div>
          </div>
          <dl class="mt-5 space-y-3 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="text-[#708C7A]">工资口径</dt>
              <dd class="font-medium">{{ form.salaryBasis === 'gross' ? '税前' : '税后到手' }}</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-[#708C7A]">标准计薪时长</dt>
              <dd class="font-medium">{{ money(paidMinutes / 60, 2) }} 小时 / 日</dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="text-[#708C7A]">加班费设置</dt>
              <dd class="text-right font-medium">
                {{
                  form.overtimeType === 'none'
                    ? '没有额外加班费'
                    : form.overtimeType === 'unknown'
                      ? '暂不计算'
                      : form.overtimeType === 'multiplier'
                        ? `基本时薪 × ${form.overtimeValue}`
                        : `¥${form.overtimeValue} / 小时`
                }}
              </dd>
            </div>
          </dl>
          <div class="mt-6 rounded-xl bg-[#FFF4E7] p-4 text-sm leading-6 text-[#8E6D3B]">
            📌
            这只是预估，不代表实际发薪、个人所得税或已经赚到的金额。加班费目前只保存规则，尚未累计。
          </div>
          <button
            type="button"
            class="mt-6 min-h-11 w-full rounded-xl bg-[#297A5B] px-5 py-3 font-semibold text-white transition hover:bg-[#216448] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
            @click="
              completed = false;
              step = 1
              error = ''
            "
          >
            修改我的工资和作息
          </button>
        </template>

        <template v-else>
          <p class="text-xs font-semibold text-[#408664]">首次使用设置 · {{ step }} / 4</p>
          <div class="mt-3 grid grid-cols-4 gap-2" aria-label="设置进度">
            <div
              v-for="n in 4"
              :key="n"
              class="h-1.5 rounded-full"
              :class="n <= step ? 'bg-[#4A9B72]' : 'bg-[#E4F0E7]'"
            />
          </div>

          <div v-if="step === 1" class="mt-7 space-y-5">
            <div>
              <h2 class="text-xl font-bold">💰 先认识一下你的工资</h2>
              <p class="mt-2 text-sm text-[#72917E]">不需要填写公司名称或任何个人身份信息。</p>
            </div>
            <label class="block text-sm font-medium"
              >计薪方式
              <select
                v-model="form.salaryMode"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] bg-white px-3 outline-none focus:border-[#4A9B72]"
                @change="form.salary = ''"
              >
                <option value="monthly">固定月薪</option>
                <option value="hourly">按小时计薪</option>
              </select>
            </label>
            <label class="block text-sm font-medium"
              >{{ form.salaryMode === 'monthly' ? '每月工资（元）' : '每小时工资（元）' }}
              <input
                v-model="form.salary"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                inputmode="decimal"
                placeholder="请输入实际金额"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3 outline-none focus:border-[#4A9B72]"
              />
            </label>
            <fieldset>
              <legend class="text-sm font-medium">工资口径</legend>
              <div class="mt-2 flex flex-wrap gap-3 text-sm">
                <label class="flex items-center gap-2"
                  ><input
                    v-model="form.salaryBasis"
                    type="radio"
                    value="gross"
                    class="accent-[#297A5B]"
                  />
                  税前（默认）</label
                >
                <label class="flex items-center gap-2"
                  ><input
                    v-model="form.salaryBasis"
                    type="radio"
                    value="net"
                    class="accent-[#297A5B]"
                  />
                  税后到手</label
                >
              </div>
            </fieldset>
          </div>

          <div v-else-if="step === 2" class="mt-7 space-y-5">
            <div>
              <h2 class="text-xl font-bold">🗓️ 什么时候上班？</h2>
              <p class="mt-2 text-sm text-[#72917E]">你可以在以后随时修改。</p>
            </div>
            <label class="block text-sm font-medium"
              >每月标准计薪工作日（用于月薪换算）
              <input
                v-model="form.monthlyWorkdays"
                type="number"
                min="1"
                max="31"
                step="1"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3 outline-none focus:border-[#4A9B72]"
              />
            </label>
            <fieldset>
              <legend class="text-sm font-medium">每周通常工作的日期</legend>
              <div class="mt-2 grid grid-cols-7 gap-1.5">
                <button
                  v-for="day in weekdays"
                  :key="day.id"
                  type="button"
                  :aria-pressed="form.weekdays.includes(day.id)"
                  class="min-h-11 rounded-xl border text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-[#297A5B]"
                  :class="
                    form.weekdays.includes(day.id)
                      ? 'border-[#297A5B] bg-[#E2F2E7] text-[#21684B]'
                      : 'border-[#DFEADF] bg-white text-[#82978A]'
                  "
                  @click="toggleWeekday(day.id)"
                >
                  周{{ day.name }}
                </button>
              </div>
            </fieldset>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label class="block text-sm font-medium"
                >上午开始<input
                  v-model="form.morningStart"
                  type="time"
                  class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              /></label>
              <label class="block text-sm font-medium"
                >上午结束<input
                  v-model="form.morningEnd"
                  type="time"
                  class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              /></label>
              <label class="block text-sm font-medium"
                >下午开始<input
                  v-model="form.afternoonStart"
                  type="time"
                  class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              /></label>
              <label class="block text-sm font-medium"
                >下午结束<input
                  v-model="form.afternoonEnd"
                  type="time"
                  class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              /></label>
            </div>
            <label class="flex items-center gap-2 text-sm font-medium"
              ><input v-model="form.lunchPaid" type="checkbox" class="size-4 accent-[#297A5B]" />
              午休也计薪</label
            >
            <p class="text-xs leading-5 text-[#7F9687]">
              默认午休不计薪；如果勾选，月薪每日总额不变，但每秒分配金额会变化。暂不支持跨午夜排班。
            </p>
          </div>

          <div v-else-if="step === 3" class="mt-7 space-y-5">
            <div>
              <h2 class="text-xl font-bold">🔥 加班和发薪日</h2>
              <p class="mt-2 text-sm text-[#72917E]">
                按你的实际情况设置，不替你推断劳动合同规则。
              </p>
            </div>
            <label class="block text-sm font-medium"
              >加班费情况
              <select
                v-model="form.overtimeType"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] bg-white px-3"
              >
                <option value="none">没有额外加班费</option>
                <option value="unknown">暂不确定，先不计算</option>
                <option value="multiplier">有，按基本时薪倍数计算</option>
                <option value="fixed">有，按固定加班时薪计算</option>
              </select>
            </label>
            <label
              v-if="form.overtimeType === 'multiplier' || form.overtimeType === 'fixed'"
              class="block text-sm font-medium"
              >{{
                form.overtimeType === 'multiplier' ? '加班工资倍率（例如 1.5）' : '加班时薪（元）'
              }}
              <input
                v-model="form.overtimeValue"
                type="number"
                min="0.01"
                :max="form.overtimeType === 'multiplier' ? 10 : 1000000"
                step="0.01"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              />
            </label>
            <label class="block text-sm font-medium"
              >每月发薪日
              <input
                v-model="form.payday"
                type="number"
                min="1"
                max="31"
                step="1"
                class="mt-2 min-h-11 w-full rounded-xl border border-[#D8E8DC] px-3"
              />
            </label>
            <p class="rounded-xl bg-[#FFF4E7] p-3 text-xs leading-5 text-[#977244]">
              目前只保存加班规则，下一阶段才会实现加班计时和收入结算。遇到没有31日的月份，发薪提醒逻辑会另行处理。
            </p>
          </div>

          <div v-else class="mt-7 space-y-5">
            <div>
              <h2 class="text-xl font-bold">🌱 设置确认</h2>
              <p class="mt-2 text-sm text-[#72917E]">确认后才保存到当前浏览器。</p>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="rounded-2xl bg-[#F1F9F3] p-4">
                <p class="text-sm text-[#6E8979]">每日预计基本工资</p>
                <p class="mt-2 text-2xl font-bold tabular-nums text-[#297A5B]">
                  ¥ {{ money(dailyPay) }}
                </p>
              </div>
              <div class="rounded-2xl bg-[#F1F9F3] p-4">
                <p class="text-sm text-[#6E8979]">每秒模拟基本工资</p>
                <p class="mt-2 text-2xl font-bold tabular-nums text-[#297A5B]">
                  ¥ {{ money(secondPay, 5) }}
                </p>
              </div>
            </div>
            <div class="space-y-2 text-sm text-[#668574]">
              <p>工资口径：{{ form.salaryBasis === 'gross' ? '税前' : '税后到手' }}</p>
              <p>计薪时长：{{ money(paidMinutes / 60, 2) }} 小时 / 日</p>
              <p>
                工作日：周{{
                  form.weekdays.map((x) => weekdays.find((day) => day.id === x)?.name).join('、')
                }}
              </p>
              <p>
                加班：{{
                  form.overtimeType === 'none'
                    ? '没有额外加班费'
                    : form.overtimeType === 'unknown'
                      ? '暂不计算'
                      : form.overtimeType === 'multiplier'
                        ? `基本时薪 × ${form.overtimeValue}`
                        : `¥${form.overtimeValue} / 小时`
                }}
              </p>
            </div>
            <p class="rounded-xl bg-[#F6F8F2] p-3 text-xs leading-5 text-[#728C7C]">
              仅在此浏览器本地保存，不会通过本页面发送到服务器。但本地存储不是加密保险箱；共享电脑请谨慎使用。
            </p>
          </div>

          <p v-if="error" role="alert" class="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {{ error }}
          </p>
          <div class="mt-7 flex flex-col-reverse gap-3 sm:flex-row">
            <button
              v-if="step > 1"
              type="button"
              class="min-h-11 rounded-xl border border-[#D5E6D9] px-5 py-3 text-sm font-semibold text-[#426E53] hover:bg-[#F2F8F2]"
              @click="back"
            >
              上一步
            </button>
            <button
              type="button"
              class="min-h-11 flex-1 rounded-xl bg-[#297A5B] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#216448] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
              @click="step === 4 ? finish() : next()"
            >
              {{ step === 4 ? '确认并保存' : '下一步 →' }}
            </button>
          </div>
        </template>
      </section>
      <p class="mt-5 text-center text-xs leading-5 text-[#81988A]">
        🐟 V1.0 开发阶段 · 本地优先 · 本页面未接入账号、广告或分析脚本
      </p>
    </div>
  </main>
</template>
