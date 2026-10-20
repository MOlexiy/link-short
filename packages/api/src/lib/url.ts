export const MAX_URL_LENGTH = 2048;

/** Only absolute http(s) URLs — blocks javascript:, data:, file: and friends. */
export function isHttpUrl(value: string): boolean {
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Normalises a referrer header to its host, or "direct" when absent/invalid. */
export function referrerHost(referrer: string | undefined): string {
  if (!referrer) return "direct";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "") || "direct";
  } catch {
    return "direct";
  }
}
