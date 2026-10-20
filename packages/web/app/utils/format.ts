const numberFmt = new Intl.NumberFormat("en");
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatNumber = (n: number) => numberFmt.format(n);

export function formatRelative(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < 3600 ? [diff / 60, "minute"]
    : abs < 86_400 ? [diff / 3600, "hour"]
    : abs < 86_400 * 45 ? [diff / 86_400, "day"]
    : [diff / (86_400 * 30), "month"];
  return rtf.format(Math.round(value), unit);
}

// Fixed names instead of toLocaleDateString: server (Node ICU) and browser can
// disagree ("Sept" vs "Sep"), which breaks SSR hydration.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatDay(key: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = key.split("-").map(Number);
  const short = `${d} ${MONTHS[m! - 1]}`;
  if (style === "short") return short;
  return `${WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]}, ${short}`;
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  if (code === "ZZ") return "Unknown";
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "https://example.com/very/long/path" → "example.com/very/long/path" */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}

export function splitShortUrl(shortUrl: string): { base: string; slug: string } {
  const i = shortUrl.lastIndexOf("/");
  return { base: shortUrl.slice(0, i + 1).replace(/^https?:\/\//, ""), slug: shortUrl.slice(i + 1) };
}
