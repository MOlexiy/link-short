<script setup lang="ts">
import type { LinkDto } from "~/types/api";

const emit = defineEmits<{ created: [link: LinkDto] }>();
const api = useApi();

const url = ref("");
const slug = ref("");
const expiresInDays = ref<number | "">("");
const showOptions = ref(false);
const pending = ref(false);
const error = ref<string | null>(null);

const expiryOptions = [
  { value: "", label: "Never" },
  { value: 1, label: "In 1 day" },
  { value: 7, label: "In 7 days" },
  { value: 30, label: "In 30 days" },
  { value: 90, label: "In 90 days" },
] as const;

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
      },
    });
    emit("created", link);
    url.value = "";
    slug.value = "";
    expiresInDays.value = "";
  } catch (err) {
    error.value = apiErrorMessage(err);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <form class="space-y-3" novalidate @submit.prevent="submit">
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
        <select id="expiry" v-model="expiresInDays" class="field">
          <option v-for="o in expiryOptions" :key="o.label" :value="o.value">{{ o.label }}</option>
        </select>
      </div>
    </div>

    <p id="form-error" class="text-sm text-danger min-h-5" role="alert">{{ error }}</p>
  </form>
</template>
