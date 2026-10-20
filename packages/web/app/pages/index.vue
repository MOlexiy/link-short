<script setup lang="ts">
import type { LinkDto, LinksPage } from "~/types/api";

useHead({ title: "link-short — short links with click stats" });

const options = useApiOptions();
const api = useApi();

const { data, error, status } = await useFetch<LinksPage>("/api/links", {
  key: "my-links",
  ...options.value,
  query: { limit: 20 },
});

const links = computed(() => data.value?.items ?? []);
const latest = ref<LinkDto | null>(null);
const loadingMore = ref(false);
const listError = ref<string | null>(null);

const now = useNow();

function onCreated(link: LinkDto) {
  now.value = Date.now();
  latest.value = link;
  // useFetch data is a shallowRef in Nuxt 4 — replace the object, don't mutate it.
  const current = data.value ?? { items: [], nextCursor: null };
  data.value = { ...current, items: [link, ...current.items.filter((l) => l.slug !== link.slug)] };
}

async function loadMore() {
  if (!data.value?.nextCursor) return;
  loadingMore.value = true;
  try {
    const page = await api<LinksPage>(`/api/links?limit=20&cursor=${data.value.nextCursor}`);
    data.value = { items: [...data.value.items, ...page.items], nextCursor: page.nextCursor };
  } catch (err) {
    listError.value = apiErrorMessage(err);
  } finally {
    loadingMore.value = false;
  }
}

async function onDelete(slug: string) {
  listError.value = null;
  try {
    await api(`/api/links/${slug}`, { method: "DELETE" });
    if (data.value) data.value = { ...data.value, items: data.value.items.filter((l) => l.slug !== slug) };
    if (latest.value?.slug === slug) latest.value = null;
  } catch (err) {
    listError.value = apiErrorMessage(err);
  }
}
</script>

<template>
  <div class="space-y-14">
    <section class="max-w-3xl">
      <h1 class="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.05] mb-3">Shorten a link, see who clicks it.</h1>
      <p class="text-muted text-lg mb-8 max-w-[60ch]">
        Paste a URL to get a short one. Every click is counted by day, hour, source and device. Bots and link
        previews are filtered out.
      </p>
      <ShortenForm @created="onCreated" />

      <div v-if="latest" class="mt-4 rounded-lg border border-signal/40 bg-surface p-5" aria-live="polite">
        <p class="text-sm text-muted mb-2">Your short link is ready</p>
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ShortLink :short-url="latest.shortUrl" />
          <div class="flex gap-2">
            <CopyButton :text="latest.shortUrl" />
            <NuxtLink :to="`/links/${latest.slug}`" class="btn-quiet text-sm py-1.5">Stats</NuxtLink>
          </div>
        </div>
        <p class="mt-2 truncate text-sm text-muted">Goes to {{ latest.url }}</p>
      </div>
    </section>

    <section aria-labelledby="my-links">
      <div class="flex items-baseline justify-between mb-3">
        <h2 id="my-links" class="text-xl font-semibold">Your links</h2>
        <span v-if="links.length" class="text-sm text-muted">Saved in this browser</span>
      </div>

      <p v-if="error" class="text-danger" role="alert">{{ apiErrorMessage(error) }}</p>
      <p v-else-if="status === 'pending'" class="text-muted">Loading your links…</p>
      <p v-else-if="!links.length" class="text-muted border-y border-line py-8">
        Links you shorten here will appear in this list with their click counts.
      </p>
      <template v-else>
        <LinkList :links="links" :highlight="latest?.slug" @delete="onDelete" />
        <p v-if="listError" class="mt-3 text-sm text-danger" role="alert">{{ listError }}</p>
        <button v-if="data?.nextCursor" class="btn-quiet mt-4" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? "Loading…" : "Show more" }}
        </button>
      </template>
    </section>
  </div>
</template>
