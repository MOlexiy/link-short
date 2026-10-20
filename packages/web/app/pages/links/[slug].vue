<script setup lang="ts">
import type { LinkStats } from "~/types/api";

const route = useRoute();
const router = useRouter();
const slug = computed(() => String(route.params.slug));

const ranges = [7, 30, 90] as const;
const days = computed<number>(() => {
  const d = Number(route.query.days);
  return (ranges as readonly number[]).includes(d) ? d : 30;
});

const tz = useTimeZone();
const now = useNow();
const options = useApiOptions();

const { data, error, status, refresh } = await useFetch<LinkStats>(() => `/api/links/${slug.value}/stats`, {
  ...options.value,
  query: { days, tz },
  watch: [days, tz],
});

useHead({ title: () => `/${slug.value} stats — link-short` });

onMounted(() => {
  // The server can't know the viewer's time zone; switch to it after hydration.
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (local && tz.value !== local) tz.value = local;
});

function setRange(d: number) {
  router.replace({ query: { ...route.query, days: d } });
}

const total = computed(() => data.value?.totals.clicks ?? 0);
const deviceName = (v: string) => ({ desktop: "Desktop", mobile: "Mobile", tablet: "Tablet", other: "Other" })[v] ?? v;
const referrerName = (v: string) => (v === "direct" ? "Direct or unknown" : v);
const notFound = computed(() => error.value?.statusCode === 404);
</script>

<template>
  <div>
    <NuxtLink to="/" class="text-sm text-muted hover:text-ink">Back to your links</NuxtLink>

    <div v-if="notFound" class="mt-8 max-w-xl">
      <h1 class="text-3xl font-bold mb-2">No link /{{ slug }} in this browser</h1>
      <p class="text-muted">
        Stats are only visible in the browser that created the link. It may also have expired or been deleted.
      </p>
    </div>

    <div v-else-if="error" class="mt-8">
      <p class="text-danger" role="alert">{{ apiErrorMessage(error) }}</p>
      <button class="btn-quiet mt-3" @click="() => refresh()">Try again</button>
    </div>

    <template v-else-if="data">
      <header class="mt-6 mb-10 space-y-3">
        <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
          <ShortLink :short-url="data.link.shortUrl" />
          <CopyButton :text="data.link.shortUrl" />
        </div>
        <p class="text-muted truncate">
          Goes to <a :href="data.link.url" class="link" target="_blank" rel="noopener">{{ displayUrl(data.link.url) }}</a>
        </p>
        <p class="text-sm text-muted">
          Created {{ formatRelative(data.link.createdAt, now) }}, last clicked {{ formatRelative(data.link.lastClickAt, now) }}<template
            v-if="data.link.expiresAt"
            >, expires {{ formatRelative(data.link.expiresAt, now) }}</template
          >.
        </p>
      </header>

      <div class="flex flex-wrap items-end justify-between gap-6 border-y border-line py-5 mb-10">
        <dl class="flex flex-wrap gap-x-12 gap-y-4">
          <div>
            <dt class="text-sm text-muted">Clicks</dt>
            <dd class="text-4xl font-bold leading-tight">{{ formatNumber(data.totals.clicks) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Unique visitors</dt>
            <dd class="text-4xl font-bold leading-tight">{{ formatNumber(data.totals.uniqueVisitors) }}</dd>
          </div>
          <div>
            <dt class="text-sm text-muted">Bot hits filtered</dt>
            <dd class="text-4xl font-bold leading-tight text-muted">{{ formatNumber(data.totals.botClicks) }}</dd>
          </div>
        </dl>

        <div role="group" aria-label="Date range" class="inline-flex rounded-md border border-line bg-surface p-0.5">
          <button
            v-for="r in ranges"
            :key="r"
            type="button"
            class="rounded px-3 py-1 text-sm font-medium"
            :class="days === r ? 'bg-ink text-paper' : 'text-muted hover:text-ink'"
            :aria-pressed="days === r"
            @click="setRange(r)"
          >
            {{ r }} days
          </button>
        </div>
      </div>

      <div class="space-y-12" :class="{ 'opacity-60 transition-opacity': status === 'pending' }">
        <TimelineChart :points="data.timeline" />
        <HourStrip :hours="data.hours" :tz="data.range.tz" />

        <div class="grid gap-x-12 gap-y-10 md:grid-cols-2">
          <BreakdownList title="Where clicks come from" :items="data.referrers" :total="total" :format="referrerName" />
          <BreakdownList
            title="Countries"
            :items="data.countries"
            :total="total"
            :format="countryName"
            empty="No clicks yet."
          />
          <BreakdownList title="Browsers" :items="data.browsers" :total="total" />
          <BreakdownList title="Operating systems" :items="data.os" :total="total" />
          <BreakdownList title="Devices" :items="data.devices" :total="total" :format="deviceName" />
        </div>
      </div>
    </template>
  </div>
</template>
