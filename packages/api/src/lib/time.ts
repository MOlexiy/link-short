const DAY_MS = 24 * 60 * 60 * 1000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** Calendar date of `date` in `tz` as "YYYY-MM-DD". */
export function dateKey(date: Date, tz: string): string {
  let fmt = keyFormatters.get(tz);
  if (!fmt) {
    // en-CA formats dates as YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    keyFormatters.set(tz, fmt);
  }
  return fmt.format(date);
}

function parseKey(key: string): [number, number, number] {
  const [y, m, d] = key.split("-").map(Number);
  return [y!, m!, d!];
}

/** Pure calendar arithmetic — no DST surprises. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Offset of `tz` from UTC at the given instant, in ms (e.g. +3h for Europe/Kyiv in summer). */
export function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The UTC instant at which calendar day `key` starts in `tz`. */
export function startOfDayInZone(key: string, tz: string): Date {
  const [y, m, d] = parseKey(key);
  const utcMidnight = Date.UTC(y, m - 1, d);
  let guess = utcMidnight - tzOffsetMs(new Date(utcMidnight), tz);
  // Re-check once: the offset can differ at the real local midnight (DST switch days).
  const corrected = utcMidnight - tzOffsetMs(new Date(guess), tz);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** The last `n` calendar days in `tz`, oldest first, ending today. */
export function lastNDayKeys(n: number, tz: string, now = new Date()): string[] {
  const today = dateKey(now, tz);
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

export { DAY_MS };
