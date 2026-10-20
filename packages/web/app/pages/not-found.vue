<script setup lang="ts">
const route = useRoute();
const slug = computed(() => String(route.query.slug ?? ""));
const reason = computed(() => String(route.query.reason ?? "not_found"));
const titles: Record<string, string> = {
  expired: "This link has expired",
  disabled: "This link has been disabled",
  not_found: "This short link doesn't exist",
};
const title = computed(() => titles[reason.value] ?? titles.not_found!);
useHead({ title: () => `${title.value} — link-short` });
</script>

<template>
  <div class="max-w-xl">
    <h1 class="text-3xl font-bold mb-3">{{ title }}</h1>
    <p class="text-muted mb-6">
      <template v-if="slug"><span class="font-mono text-ink">/{{ slug }}</span> </template>
      <template v-if="reason === 'expired'">was set to stop working after a date its owner chose.</template>
      <template v-else-if="reason === 'disabled'">was reported as harmful and no longer redirects.</template>
      <template v-else>may have been mistyped or deleted by its owner.</template>
    </p>
    <NuxtLink to="/" class="btn-primary">Create a short link</NuxtLink>
  </div>
</template>
