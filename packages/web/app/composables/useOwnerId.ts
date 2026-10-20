/**
 * There are no accounts: each browser gets a random owner id in a cookie,
 * and the API only shows links created with that id. A cookie (not
 * localStorage) so the id is also available during server-side rendering.
 */
export function useOwnerId() {
  return useCookie<string>("ls_owner", {
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    default: () => crypto.randomUUID(),
  });
}

/** Viewer's time zone for day buckets; saved after the first client-side visit. */
export function useTimeZone() {
  return useCookie<string>("ls_tz", { maxAge: 60 * 60 * 24 * 400, sameSite: "lax", default: () => "UTC" });
}
