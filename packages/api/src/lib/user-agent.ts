import Bowser from "bowser";

export type DeviceType = "desktop" | "mobile" | "tablet" | "other";

export interface ParsedUserAgent {
  browser: string;
  os: string;
  device: DeviceType;
  isBot: boolean;
}

/**
 * Link-preview crawlers (Slack, Telegram, Facebook…) and search bots hit short
 * links constantly. We still store those hits (flagged), but exclude them from
 * the stats and from the click counter.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|quora link|whatsapp|telegram|discord|slack|vkshare|curl|wget|python-requests|httpclient|headless|lighthouse/i;

export function parseUserAgent(ua: string | undefined): ParsedUserAgent {
  if (!ua) return { browser: "Unknown", os: "Unknown", device: "other", isBot: true };

  const isBot = BOT_PATTERN.test(ua);
  const parsed = Bowser.parse(ua);
  const platform = parsed.platform.type;

  const device: DeviceType =
    platform === "desktop" || platform === "mobile" || platform === "tablet" ? platform : "other";

  return {
    browser: parsed.browser.name || "Unknown",
    os: parsed.os.name || "Unknown",
    device,
    isBot,
  };
}
