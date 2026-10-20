<script setup lang="ts">
const props = defineProps<{ text: string; label?: string }>();
const copied = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    copied.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (copied.value = false), 1600);
  } catch {
    // Clipboard can be blocked (e.g. insecure context) — select-and-copy still works.
  }
}
</script>

<template>
  <button type="button" class="btn-quiet text-sm py-1.5" :aria-label="`Copy ${text}`" @click="copy">
    <span aria-live="polite">{{ copied ? "Copied" : (label ?? "Copy") }}</span>
  </button>
</template>
