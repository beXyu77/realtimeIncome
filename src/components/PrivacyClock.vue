<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

// 这个组件不读取工资、活动或提醒数据，只显示设备本地时钟。
defineProps<{ storageAvailable: boolean }>()
const emit = defineEmits<{ exit: [] }>()

function getMinute(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000)
}

const clock = ref(getMinute())
let timer: ReturnType<typeof setTimeout> | undefined

function refreshClock() {
  clock.value = getMinute()
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(refreshClock, 60_000 - (Date.now() % 60_000) + 30)
}

function onVisibilityChange() {
  if (!document.hidden) refreshClock()
}

onMounted(() => {
  refreshClock()
  window.addEventListener('focus', refreshClock)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  if (timer !== undefined) clearTimeout(timer)
  window.removeEventListener('focus', refreshClock)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const displayTime = computed(() =>
  `${String(clock.value.getHours()).padStart(2, '0')}:${String(clock.value.getMinutes()).padStart(2, '0')}`,
)
const displayDate = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  }).format(clock.value),
)
</script>

<template>
  <section
    aria-label="时间与日程"
    class="rounded-3xl border border-[#DCEBDD] bg-white p-5 shadow-[0_12px_50px_rgba(40,110,70,.06)] sm:p-8"
  >
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h1 class="text-lg font-bold text-[#315B44] sm:text-xl">时间与日程</h1>
        <p class="mt-1 text-xs text-[#80988A]">简洁时钟</p>
      </div>
      <button
        type="button"
        aria-label="返回原视图"
        title="返回原视图"
        class="min-h-11 shrink-0 rounded-xl border border-[#D6E8DC] bg-[#F7FBF8] px-4 py-2 text-sm font-medium text-[#356B50] transition hover:bg-[#EAF5ED] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#297A5B]"
        @click="emit('exit')"
      >
        切换视图
      </button>
    </div>

    <div class="mt-6 rounded-2xl bg-[#F1F8F3] px-5 py-10 text-center sm:px-8 sm:py-12">
      <p class="text-sm font-medium text-[#728E7B]">当前时间</p>
      <p class="mt-3 text-5xl font-bold tracking-tight tabular-nums text-[#2D6F50] sm:text-6xl" aria-live="off">
        {{ displayTime }}
      </p>
      <p class="mt-4 text-sm text-[#678470]">{{ displayDate }}</p>
    </div>
    <p class="mt-5 text-center text-xs text-[#81988A]">每分钟更新 · 设备本地时间</p>
    <p
      v-if="!storageAvailable"
      role="status"
      class="mt-4 rounded-xl bg-[#FFF3E4] p-3 text-xs leading-5 text-[#876544]"
    >
      当前浏览器未允许保存时钟视图状态。刷新页面可能恢复之前的页面，请注意屏幕可见内容。
    </p>
  </section>
</template>
