<script setup lang="ts">
const props = defineProps<{ shortUrl: string; size?: "lg" | "md" }>();
const parts = computed(() => splitShortUrl(props.shortUrl));
</script>

<template>
  <a
    :href="shortUrl"
    target="_blank"
    rel="noopener"
    class="font-mono break-all hover:underline decoration-line underline-offset-8"
    :class="size === 'md' ? 'text-xl sm:text-2xl' : 'text-2xl sm:text-4xl'"
  >
    <span class="text-muted">{{ parts.base }}</span><span class="font-medium text-ink">{{ parts.slug }}</span>
  </a>
</template>
