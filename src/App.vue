
<script setup lang="ts">
import { ref } from 'vue'

const money = ref(0)

function earnMoney() {
  money.value += 10
}
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-white">
    <div class="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
      <div class="mb-4 text-4xl">🐟</div>

      <h1 class="text-2xl font-bold">
        带薪摸鱼模拟器
      </h1>

      <p class="mt-3 text-sm text-slate-400">
        上班不是受苦，是持续进账！
      </p>

      <p class="mt-8 text-sm text-slate-400">
        今日模拟收入
      </p>

      <div class="mt-2 text-5xl font-bold text-emerald-400">
        ¥ {{ money.toFixed(2) }}
      </div>

      <button
        class="mt-8 w-full cursor-pointer rounded-xl bg-emerald-500 py-3 font-bold text-slate-950 transition hover:bg-emerald-400"
        @click="earnMoney"
      >
        💰 点击赚 10 元
      </button>

      <p class="mt-5 text-xs text-slate-500">
        恭喜你，距离财富自由又近了一点！
      </p>
    </div>
  </main>
</template>
