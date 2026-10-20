<script setup lang="ts">
import type { LinkDto } from "~/types/api";

defineProps<{ links: LinkDto[]; highlight?: string | null }>();
const now = useNow();
const emit = defineEmits<{ delete: [slug: string] }>();

// Two-step delete without a blocking confirm() dialog.
const confirming = ref<string | null>(null);
function onDelete(slug: string) {
  if (confirming.value === slug) {
    confirming.value = null;
    emit("delete", slug);
  } else {
    confirming.value = slug;
  }
}
</script>

<template>
  <ul class="divide-y divide-line border-y border-line">
    <li
      v-for="link in links"
      :key="link.slug"
      class="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-4 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-center"
      :class="{ 'bg-signal-soft/50 -mx-3 px-3 rounded-md': link.slug === highlight }"
    >
      <div class="min-w-0">
        <NuxtLink :to="`/links/${link.slug}`" class="font-mono font-medium text-ink hover:text-signal">
          /{{ link.slug }}
        </NuxtLink>
        <p class="truncate text-sm text-muted" :title="link.url">{{ displayUrl(link.url) }}</p>
        <p class="text-xs text-muted">
          Created {{ formatRelative(link.createdAt, now) }}<template v-if="link.expiresAt">, expires {{ formatRelative(link.expiresAt, now) }}</template>
        </p>
      </div>

      <NuxtLink
        :to="`/links/${link.slug}`"
        class="row-span-2 sm:row-span-1 text-right self-start sm:self-center"
        :aria-label="`${link.clicks} clicks — open stats for ${link.slug}`"
      >
        <span class="block text-2xl font-semibold leading-none">{{ formatNumber(link.clicks) }}</span>
        <span class="text-xs text-muted">{{ link.clicks === 1 ? "click" : "clicks" }}</span>
      </NuxtLink>

      <div class="flex gap-2 sm:justify-end">
        <CopyButton :text="link.shortUrl" />
        <NuxtLink :to="`/links/${link.slug}`" class="btn-quiet text-sm py-1.5">Stats</NuxtLink>
        <button
          type="button"
          class="btn text-sm py-1.5"
          :class="confirming === link.slug ? 'bg-danger text-white' : 'text-muted hover:text-danger'"
          @click="onDelete(link.slug)"
          @blur="confirming = null"
        >
          {{ confirming === link.slug ? "Delete for good" : "Delete" }}
        </button>
      </div>
    </li>
  </ul>
</template>
