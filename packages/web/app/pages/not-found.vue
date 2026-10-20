<script setup lang="ts">
const route = useRoute();
const slug = computed(() => String(route.query.slug ?? ""));
const expired = computed(() => route.query.reason === "expired");
useHead({ title: () => (expired.value ? "Link expired" : "Link not found") + " — link-short" });
</script>

<template>
  <div class="max-w-xl">
    <h1 class="text-3xl font-bold mb-3">
      {{ expired ? "This link has expired" : "This short link doesn't exist" }}
    </h1>
    <p class="text-muted mb-6">
      <template v-if="slug"><span class="font-mono text-ink">/{{ slug }}</span> </template>
      <template v-if="expired">was set to stop working after a date its owner chose.</template>
      <template v-else>may have been mistyped or deleted by its owner.</template>
    </p>
    <NuxtLink to="/" class="btn-primary">Create a short link</NuxtLink>
  </div>
</template>
