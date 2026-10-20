<script setup lang="ts">
const props = defineProps<{ hours: { hour: number; clicks: number }[]; tz: string }>();
const max = computed(() => Math.max(...props.hours.map((h) => h.clicks), 1));
const peak = computed(() => props.hours.reduce((a, b) => (b.clicks > a.clicks ? b : a), props.hours[0]!));
const pad = (h: number) => String(h).padStart(2, "0");
</script>

<template>
  <figure>
    <figcaption class="flex flex-wrap items-baseline justify-between gap-x-6 mb-2">
      <span class="font-semibold">Time of day</span>
      <span class="text-sm text-muted">
        <template v-if="peak.clicks">Busiest around {{ pad(peak.hour) }}:00</template>
        <template v-else>No clicks yet</template>
        ({{ tz }})
      </span>
    </figcaption>
    <ol class="grid grid-cols-24 gap-[3px]" style="grid-template-columns: repeat(24, minmax(0, 1fr))">
      <li
        v-for="h in hours"
        :key="h.hour"
        class="h-9 rounded-[3px]"
        :style="{
          background: h.clicks ? 'var(--signal)' : 'var(--line)',
          opacity: h.clicks ? 0.18 + 0.82 * (h.clicks / max) : 0.5,
        }"
        :title="`${pad(h.hour)}:00–${pad(h.hour)}:59 — ${h.clicks} clicks`"
      >
        <span class="sr-only">{{ pad(h.hour) }}:00, {{ h.clicks }} clicks</span>
      </li>
    </ol>
    <div class="mt-1 grid text-[11px] text-muted" style="grid-template-columns: repeat(4, 1fr)" aria-hidden="true">
      <span>00</span><span>06</span><span>12</span><span>18</span>
    </div>
  </figure>
</template>
