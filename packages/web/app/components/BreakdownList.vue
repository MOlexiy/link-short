<script setup lang="ts">
import type { Bucket } from "~/types/api";

const props = defineProps<{
  title: string;
  items: Bucket[];
  total: number;
  format?: (value: string) => string;
  empty?: string;
}>();

const max = computed(() => Math.max(...props.items.map((i) => i.clicks), 1));
const pct = (n: number) => (props.total ? Math.round((n / props.total) * 100) : 0);
</script>

<template>
  <section>
    <h3 class="font-semibold mb-2">{{ title }}</h3>
    <ul v-if="items.length" class="space-y-1.5">
      <li v-for="item in items" :key="item.value" class="relative">
        <div
          class="absolute inset-y-0 left-0 rounded-sm bg-signal-soft"
          :style="{ width: `${(item.clicks / max) * 100}%` }"
          aria-hidden="true"
        />
        <div class="relative flex items-baseline justify-between gap-3 px-2 py-1 text-sm">
          <span class="truncate">{{ format ? format(item.value) : item.value }}</span>
          <span class="shrink-0 text-muted">
            <strong class="font-semibold text-ink">{{ formatNumber(item.clicks) }}</strong>
            {{ pct(item.clicks) }}%
          </span>
        </div>
      </li>
    </ul>
    <p v-else class="text-sm text-muted">{{ empty ?? "Nothing here yet." }}</p>
  </section>
</template>
