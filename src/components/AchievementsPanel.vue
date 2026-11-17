<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { evaluateAchievements } from '../utils/achievementEngine'
import type { ActivityRecord } from '../utils/activityEngine'
import type { Achievement } from '../utils/achievementEngine'

// 仅接受 ActivityPanel 已验证并通过父组件传来的本地活动记录。
const props = defineProps<{ records: ActivityRecord[] }>()
const filter = ref<'all' | 'unlocked'>('all')
const achievements = computed(() => evaluateAchievements(props.records))
const unlockedCount = computed(() => achievements.value.filter((item) => item.unlocked).length)
const visibleAchievements = computed(() =>
  filter.value === 'unlocked'
    ? achievements.value.filter((item) => item.unlocked)
    : achievements.value,
)
const banner = ref<{ title: string; message: string; extra: number } | null>(null)

// 第一次载入已有历史记录时不弹通知；仅新结束的活动触发恭喜文案。
const initialUnlocked = new Set(
  evaluateAchievements(props.records)
    .filter((item) => item.unlocked)
    .map((item) => item.id),
)
let previousUnlocked = initialUnlocked
watch(
  achievements,
  (next) => {
    const current = new Set(next.filter((item) => item.unlocked).map((item) => item.id))
    const fresh = next.filter((item) => item.unlocked && !previousUnlocked.has(item.id))
    previousUnlocked = current
    if (fresh.length > 0) {
      const first = fresh[0]
      if (first)
        banner.value = {
          title: `${first.icon} 解锁：${first.title}`,
          message: first.description,
          extra: fresh.length - 1,
        }
    } else if (current.size === 0) {
      banner.value = null
    }
  },
  { flush: 'sync' },
)

function cardName(item: Achievement): string {
  return item.secret && !item.unlocked ? '??? 神秘彩蛋' : item.title
}
function cardText(item: Achievement): string {
  return item.secret && !item.unlocked
    ? '隐藏条件尚未揭晓，体验不同活动可能获得惊喜。'
    : item.requirement
}
</script>

<template>
  <section
    class="space-y-4 rounded-2xl border border-[#DDEBDD] bg-[#FCFFFC] p-4 sm:p-5"
    aria-label="搞笑成就与隐藏彩蛋"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div class="min-w-0">
        <h3 class="text-base font-bold text-[#305E45]">🏆 成就收藏馆</h3>
        <p class="mt-1 text-xs leading-5 text-[#809787]">
          自动读取本地活动记录 · 每个成就都是小小的开心
        </p>
      </div>
      <span
        class="shrink-0 rounded-full bg-[#E5F3EA] px-3 py-1 text-xs font-semibold text-[#347B58]"
      >
        {{ unlockedCount }} / {{ achievements.length }} 已解锁
      </span>
    </div>

    <div
      class="h-2 overflow-hidden rounded-full bg-[#E6F1E8]"
      role="progressbar"
      aria-label="成就解锁进度"
      :aria-valuenow="unlockedCount"
      aria-valuemin="0"
      :aria-valuemax="achievements.length"
    >
      <div
        class="h-full rounded-full bg-[#6DB38E] transition-[width] duration-300 motion-reduce:transition-none"
        :style="{ width: `${(unlockedCount / achievements.length) * 100}%` }"
      />
    </div>

    <div
      v-if="banner"
      class="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-[#DBEAD8] bg-[#ECF7E9] p-3"
      role="status"
      aria-live="polite"
    >
      <div class="min-w-0 space-y-1">
        <p class="text-sm font-semibold text-[#286E4E]">
          🎉 {{ banner.title }}<span v-if="banner.extra > 0">（另解锁 {{ banner.extra }} 个）</span>
        </p>
        <p class="text-xs leading-5 text-[#597D65]">{{ banner.message }}</p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-lg px-2 py-1 text-sm text-[#587E62] hover:bg-[#DCEEDF]"
        aria-label="关闭成就提示"
        @click="banner = null"
      >
        ✕
      </button>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-[#718D7C]">
        包含 {{ achievements.filter((a) => a.secret).length }} 个隐藏彩蛋
      </p>
      <div class="flex gap-2" aria-label="筛选成就">
        <button
          type="button"
          :aria-pressed="filter === 'all'"
          class="min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[#297A5B]"
          :class="
            filter === 'all'
              ? 'border-[#A3D1B4] bg-[#EAF6ED] text-[#2E7753]'
              : 'border-[#E0EBE3] bg-white text-[#6F8879]'
          "
          @click="filter = 'all'"
        >
          全部
        </button>
        <button
          type="button"
          :aria-pressed="filter === 'unlocked'"
          class="min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-[#297A5B]"
          :class="
            filter === 'unlocked'
              ? 'border-[#A3D1B4] bg-[#EAF6ED] text-[#2E7753]'
              : 'border-[#E0EBE3] bg-white text-[#6F8879]'
          "
          @click="filter = 'unlocked'"
        >
          已解锁
        </button>
      </div>
    </div>

    <div
      v-if="visibleAchievements.length === 0"
      class="rounded-xl bg-[#F1F8F2] p-4 text-sm leading-6 text-[#6B8878]"
    >
      还没有解锁的成就。完成一次厕所、摸鱼或学习活动，就可以收获第一枚徽章。
    </div>

    <div v-else class="grid grid-cols-1 gap-3 min-[490px]:grid-cols-2">
      <article
        v-for="item in visibleAchievements"
        :key="item.id"
        class="min-w-0 rounded-xl border p-3 sm:p-4"
        :class="item.unlocked ? 'border-[#CDE6D5] bg-[#F0F8F2]' : 'border-[#E6EDE5] bg-white'"
      >
        <div class="flex items-start gap-3">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
            :class="item.unlocked ? 'bg-[#D9EFDF]' : 'bg-[#F2F5EF]'"
            aria-hidden="true"
            >{{ item.secret && !item.unlocked ? '🔒' : item.icon }}</span
          >
          <div class="min-w-0 flex-1">
            <h4
              class="wrap-break-word text-sm font-semibold leading-5"
              :class="item.unlocked ? 'text-[#2C7050]' : 'text-[#708979]'"
            >
              {{ cardName(item) }}
            </h4>
            <p class="mt-1 wrap-break-word text-xs leading-5 text-[#7E9486]">
              {{ cardText(item) }}
            </p>
          </div>
        </div>
        <div class="mt-3" v-if="!item.secret || item.unlocked">
          <div class="flex items-center justify-between gap-2 text-xs">
            <span :class="item.unlocked ? 'font-semibold text-[#35835E]' : 'text-[#8AA090]'">{{
              item.unlocked ? '✓ 已解锁' : '解锁进度'
            }}</span>
            <span class="tabular-nums text-[#7C9584]">{{ item.progressText }}</span>
          </div>
          <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#E3EDE5]">
            <div
              class="h-full rounded-full bg-[#86BE9D] motion-reduce:transition-none"
              :style="{ width: `${item.progress}%` }"
            />
          </div>
        </div>
        <p v-if="item.unlocked" class="mt-2 text-xs leading-5 text-[#7A947D]">
          {{ item.description }}
        </p>
        <p v-else-if="item.secret" class="mt-3 text-xs text-[#A2AA9C]">
          等待一个意想不到的小惊喜 ✨
        </p>
      </article>
    </div>

    <p class="rounded-xl bg-[#FFF5E8] px-3 py-2.5 text-xs leading-5 text-[#92764F]">
      🌱
      成就只做趣味纪念，不鼓励延长厕所时间、久坐或加班。进度由现有活动记录实时计算；清空活动记录后，对应成就也会重新锁定。此功能不上传数据。
    </p>
  </section>
</template>
