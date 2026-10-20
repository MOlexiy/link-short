<script setup lang="ts">
import type { DayPoint } from "~/types/api";

const props = defineProps<{ points: DayPoint[] }>();

const W = 720;
const H = 200;
const PAD_LEFT = 36;
const PAD_BOTTOM = 24;
const plotW = W - PAD_LEFT;
const plotH = H - PAD_BOTTOM - 8;

function niceMax(n: number) {
  if (n <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= n / 1)!;
  return step * pow;
}

const max = computed(() => niceMax(Math.max(...props.points.map((p) => p.clicks), 0)));
const slot = computed(() => plotW / Math.max(props.points.length, 1));
const barW = computed(() => Math.max(2, slot.value * 0.72));
const y = (v: number) => 8 + plotH - (v / max.value) * plotH;
const ticks = computed(() => [0, max.value / 2, max.value]);

const active = ref<number | null>(null);
const shown = computed(() => props.points[active.value ?? props.points.length - 1]);

const labelIdx = computed(() => {
  const n = props.points.length;
  return new Set([0, Math.floor((n - 1) / 2), n - 1]);
});

function onMove(e: PointerEvent) {
  const svg = e.currentTarget as SVGSVGElement;
  const rect = svg.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W - PAD_LEFT;
  const i = Math.floor(x / slot.value);
  active.value = i >= 0 && i < props.points.length ? i : null;
}

function onKey(e: KeyboardEvent) {
  const last = props.points.length - 1;
  const cur = active.value ?? last;
  if (e.key === "ArrowLeft") active.value = Math.max(0, cur - 1);
  else if (e.key === "ArrowRight") active.value = Math.min(last, cur + 1);
  else return;
  e.preventDefault();
}

const summary = computed(() => {
  const total = props.points.reduce((s, p) => s + p.clicks, 0);
  return `Clicks per day over ${props.points.length} days, ${total} in total. Use the arrow keys to read individual days.`;
});
</script>

<template>
  <figure>
    <figcaption class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 mb-2">
      <span class="font-semibold">Clicks per day</span>
      <span v-if="shown" class="text-sm text-muted" aria-live="polite">
        {{ formatDay(shown.date, "long") }}:
        <strong class="text-ink">{{ formatNumber(shown.clicks) }}</strong> clicks,
        <strong class="text-ink">{{ formatNumber(shown.uniqueVisitors) }}</strong> visitors
      </span>
    </figcaption>

    <svg
      :viewBox="`0 0 ${W} ${H}`"
      class="w-full h-auto touch-none select-none"
      role="img"
      :aria-label="summary"
      tabindex="0"
      @pointermove="onMove"
      @pointerleave="active = null"
      @keydown="onKey"
      @blur="active = null"
    >
      <g class="text-[11px]" fill="currentColor">
        <template v-for="t in ticks" :key="t">
          <line :x1="PAD_LEFT" :x2="W" :y1="y(t)" :y2="y(t)" stroke="var(--line)" stroke-dasharray="2 4" />
          <text :x="PAD_LEFT - 8" :y="y(t) + 4" text-anchor="end" class="fill-muted">{{ formatNumber(t) }}</text>
        </template>
      </g>

      <g v-for="(p, i) in points" :key="p.date">
        <rect
          :x="PAD_LEFT + i * slot + (slot - barW) / 2"
          :y="y(p.clicks)"
          :width="barW"
          :height="Math.max(0, y(0) - y(p.clicks))"
          rx="2"
          :fill="active === i ? 'var(--ink)' : 'var(--signal-soft)'"
        />
        <rect
          :x="PAD_LEFT + i * slot + (slot - barW) / 2"
          :y="y(p.uniqueVisitors)"
          :width="barW"
          :height="Math.max(0, y(0) - y(p.uniqueVisitors))"
          rx="2"
          :fill="active === i ? 'var(--ink)' : 'var(--signal)'"
        />
        <text
          v-if="labelIdx.has(i)"
          :x="PAD_LEFT + i * slot + slot / 2"
          :y="H - 6"
          :text-anchor="i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'"
          class="fill-muted text-[11px]"
        >
          {{ formatDay(p.date) }}
        </text>
      </g>
    </svg>

    <div class="mt-2 flex gap-5 text-sm text-muted">
      <span class="flex items-center gap-2"><i class="inline-block size-3 rounded-sm bg-signal-soft" />All clicks</span>
      <span class="flex items-center gap-2"><i class="inline-block size-3 rounded-sm bg-signal" />Unique visitors</span>
    </div>
  </figure>
</template>
