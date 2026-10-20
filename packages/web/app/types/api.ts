// Mirrors the API responses (packages/api/src/services/*).
export interface LinkDto {
  slug: string;
  url: string;
  shortUrl: string;
  clicks: number;
  lastClickAt: string | null;
  expiresAt: string | null;
  disabled: boolean;
  createdAt: string;
}

export interface LinksPage {
  items: LinkDto[];
  nextCursor: string | null;
}

export interface Bucket {
  value: string;
  clicks: number;
}

export interface DayPoint {
  date: string;
  clicks: number;
  uniqueVisitors: number;
}

export interface LinkStats {
  link: LinkDto;
  range: { days: number; tz: string; from: string; to: string };
  totals: { clicks: number; uniqueVisitors: number; botClicks: number };
  timeline: DayPoint[];
  hours: { hour: number; clicks: number }[];
  countries: Bucket[];
  browsers: Bucket[];
  os: Bucket[];
  devices: Bucket[];
  referrers: Bucket[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: { path: string; message: string }[] };
}
