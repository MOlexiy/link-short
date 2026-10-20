/**
 * "Now" captured once on the server and reused during hydration, so relative
 * times ("5 minutes ago") render identically on server and client.
 */
export function useNow() {
  return useState<number>("now", () => Date.now());
}

/** After hydration, keep "now" ticking so relative times stay fresh. Call once in app.vue. */
export function useNowTicker(intervalMs = 30_000) {
  const now = useNow();
  onMounted(() => {
    now.value = Date.now();
    const timer = setInterval(() => (now.value = Date.now()), intervalMs);
    onBeforeUnmount(() => clearInterval(timer));
  });
}
