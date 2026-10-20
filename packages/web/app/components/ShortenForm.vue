<script setup lang="ts">
import type { LinkDto } from "~/types/api";

const emit = defineEmits<{ created: [link: LinkDto] }>();
const api = useApi();

const maxDays = Number(useRuntimeConfig().public.maxLinkTtlDays) || 0;

const url = ref("");
const slug = ref("");
const website = ref(""); // honeypot — humans never see this field
const expiresInDays = ref<number | "">(maxDays || "");
const showOptions = ref(false);
const pending = ref(false);
const error = ref<string | null>(null);

const expiryOptions = computed(() => {
  const options: { value: number | ""; label: string }[] = [
    { value: "", label: "Never" },
    { value: 1, label: "In 1 day" },
    { value: 7, label: "In 7 days" },
    { value: 30, label: "In 30 days" },
    { value: 90, label: "In 90 days" },
  ];
  if (!maxDays) return options;
  // The API enforces a maximum lifetime — only offer what it will accept.
  const allowed = options.filter((o) => o.value !== "" && o.value <= maxDays);
  if (!allowed.some((o) => o.value === maxDays)) allowed.push({ value: maxDays, label: `In ${maxDays} days` });
  return allowed;
});

async function submit() {
  error.value = null;
  let target = url.value.trim();
  // Be forgiving: "example.com" → "https://example.com".
  if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target)) target = `https://${target}`;

  pending.value = true;
  try {
    const link = await api<LinkDto>("/api/links", {
      method: "POST",
      body: {
        url: target,
        ...(slug.value.trim() ? { slug: slug.value.trim() } : {}),
        ...(expiresInDays.value ? { expiresInDays: Number(expiresInDays.value) } : {}),
        ...(website.value ? { website: website.value } : {}),
      },
    });
    emit("created", link);
    url.value = "";
    slug.value = "";
    expiresInDays.value = maxDays || "";
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="relative space-y-3" novalidate @submit.prevent="submit">
    <label for="url" class="block text-sm font-medium text-muted">Long URL</label>
    <div class="flex flex-col sm:flex-row gap-2">
      <input
        id="url"
        v-model="url"
        class="field text-lg py-3"
        type="url"
        inputmode="url"
        autocomplete="off"
        spellcheck="false"
        placeholder="https://example.com/a/very/long/link"
        required
        :aria-invalid="Boolean(error)"
        aria-describedby="form-error"
      />
      <button class="btn-primary text-lg px-6 py-3 shrink-0" :disabled="pending || !url.trim()">
        {{ pending ? "Shortening…" : "Shorten" }}
      </button>
    </div>

    <button
      type="button"
      class="text-sm text-muted hover:text-ink"
      :aria-expanded="showOptions"
      aria-controls="link-options"
      @click="showOptions = !showOptions"
    >
      {{ showOptions ? "Hide options" : "Custom slug or expiry" }}
    </button>

    <div v-show="showOptions" id="link-options" class="grid gap-3 sm:grid-cols-2">
      <div>
        <label for="slug" class="block text-sm font-medium text-muted mb-1">Custom slug</label>
        <input
          id="slug"
          v-model="slug"
          class="field font-mono"
          maxlength="32"
          autocomplete="off"
          spellcheck="false"
          placeholder="my-cv"
          aria-describedby="slug-hint"
        />
        <p id="slug-hint" class="mt-1 text-xs text-muted">Letters, digits, - and _. Leave empty for a random one.</p>
      </div>
      <div>
        <label for="expiry" class="block text-sm font-medium text-muted mb-1">Link expires</label>
        <select id="expiry" v-model="expiresInDays" class="field" aria-describedby="expiry-hint">
          <option v-for="o in expiryOptions" :key="o.label" :value="o.value">{{ o.label }}</option>
        </select>
        <p v-if="maxDays" id="expiry-hint" class="mt-1 text-xs text-muted">
          To prevent abuse, links on this service expire within {{ maxDays }} days.
        </p>
      </div>
    </div>

    <!-- Honeypot: off-screen and skipped by keyboard and screen readers. -->
    <div class="absolute -left-[9999px] size-px overflow-hidden" aria-hidden="true">
      <label for="website">Website</label>
      <input id="website" v-model="website" name="website" tabindex="-1" autocomplete="off" />
    </div>

    <p id="form-error" class="text-sm text-danger min-h-5" role="alert">{{ error }}</p>
  </form>
</template>
