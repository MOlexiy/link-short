import type { ApiErrorBody } from "~/types/api";

/** Common options for every API call: base URL + anonymous owner header. */
export function useApiOptions() {
  const { apiUrl } = useRuntimeConfig().public;
  const owner = useOwnerId();
  return computed(() => ({
    baseURL: apiUrl,
    headers: { "x-owner-id": owner.value },
  }));
}

/** Imperative client for mutations (create / delete). */
export function useApi() {
  const options = useApiOptions();
  return <T>(path: string, init: { method?: "GET" | "POST" | "DELETE"; body?: unknown } = {}) =>
    $fetch<T>(path, { ...options.value, ...init } as Parameters<typeof $fetch>[1]) as Promise<T>;
}

/** Turns a FetchError into the API's human-readable message. */
export function apiErrorMessage(err: unknown): string {
  const data = (err as { data?: Partial<ApiErrorBody> } | null)?.data;
  if (data?.error?.message) return data.error.message;
  return "Can't reach the link service. Check your connection and try again.";
}
