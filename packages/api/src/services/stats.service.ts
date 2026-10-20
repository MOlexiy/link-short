import type { PipelineStage, Types } from "mongoose";
import { Click } from "../models/click.model.js";
import { lastNDayKeys, startOfDayInZone } from "../lib/time.js";

export interface Bucket {
  value: string;
  clicks: number;
}

export interface DayPoint {
  date: string; // YYYY-MM-DD in the requested time zone
  clicks: number;
  uniqueVisitors: number;
}

export interface LinkStats {
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

interface FacetResult {
  totals: { clicks: number; uniqueVisitors: number }[];
  timeline: DayPoint[];
  hours: { hour: number; clicks: number }[];
  countries: Bucket[];
  browsers: Bucket[];
  os: Bucket[];
  devices: Bucket[];
  referrers: Bucket[];
}

const topN = (field: string, limit = 8): PipelineStage.FacetPipelineStage[] => [
  { $group: { _id: `$${field}`, clicks: { $sum: 1 } } },
  { $sort: { clicks: -1, _id: 1 } },
  { $limit: limit },
  { $project: { _id: 0, value: "$_id", clicks: 1 } },
];

/**
 * Builds the analytics pipeline. Exported separately so it can be unit-tested
 * and run through explain() (see scripts/explain.ts).
 *
 * NB: Mongoose does NOT cast values inside aggregate() — linkId must already be
 * an ObjectId, otherwise $match silently matches nothing.
 */
export function buildStatsPipeline(params: { linkId: Types.ObjectId; from: Date; to: Date; tz: string }) {
  const { linkId, from, to, tz } = params;
  const day = { $dateToString: { format: "%Y-%m-%d", date: "$ts", timezone: tz } };

  return [
    // 1. Uses the { linkId, isBot, ts } index: two equality predicates + a range.
    { $match: { linkId, isBot: false, ts: { $gte: from, $lte: to } } },
    // 2. Keep only the fields we aggregate on, so $facet works with smaller documents.
    { $project: { _id: 0, ts: 1, visitorId: 1, country: 1, browser: 1, os: 1, device: 1, referrer: 1 } },
    // 3. Several independent aggregations over the same input, in one round trip.
    {
      $facet: {
        // Unique visitors via two-stage $group rather than $addToSet: this scales
        // without building one huge array in memory.
        totals: [
          { $group: { _id: "$visitorId", clicks: { $sum: 1 } } },
          { $group: { _id: null, clicks: { $sum: "$clicks" }, uniqueVisitors: { $sum: 1 } } },
          { $project: { _id: 0, clicks: 1, uniqueVisitors: 1 } },
        ],
        timeline: [
          { $group: { _id: { day, visitor: "$visitorId" }, clicks: { $sum: 1 } } },
          { $group: { _id: "$_id.day", clicks: { $sum: "$clicks" }, uniqueVisitors: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: "$_id", clicks: 1, uniqueVisitors: 1 } },
        ],
        hours: [
          { $group: { _id: { $hour: { date: "$ts", timezone: tz } }, clicks: { $sum: 1 } } },
          { $project: { _id: 0, hour: "$_id", clicks: 1 } },
        ],
        countries: topN("country"),
        browsers: topN("browser"),
        os: topN("os"),
        devices: topN("device", 4),
        referrers: topN("referrer"),
      },
    },
  ] satisfies PipelineStage[];
}

export async function getLinkStats(
  linkId: Types.ObjectId,
  options: { days: number; tz: string; now?: Date },
): Promise<LinkStats> {
  const now = options.now ?? new Date();
  const dayKeys = lastNDayKeys(options.days, options.tz, now);
  const from = startOfDayInZone(dayKeys[0]!, options.tz);

  const [facets, botClicks] = await Promise.all([
    Click.aggregate<FacetResult>(buildStatsPipeline({ linkId, from, to: now, tz: options.tz })),
    // Served by the same compound index (equality on linkId + isBot, range on ts).
    Click.countDocuments({ linkId, isBot: true, ts: { $gte: from, $lte: now } }),
  ]);

  const result = facets[0];
  const totals = result?.totals[0] ?? { clicks: 0, uniqueVisitors: 0 };

  // Fill days without clicks with zeros so the chart has a continuous x-axis.
  const byDay = new Map((result?.timeline ?? []).map((p) => [p.date, p]));
  const timeline = dayKeys.map((date) => byDay.get(date) ?? { date, clicks: 0, uniqueVisitors: 0 });

  const byHour = new Map((result?.hours ?? []).map((h) => [h.hour, h.clicks]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, clicks: byHour.get(hour) ?? 0 }));

  return {
    range: { days: options.days, tz: options.tz, from: from.toISOString(), to: now.toISOString() },
    totals: { ...totals, botClicks },
    timeline,
    hours,
    countries: result?.countries ?? [],
    browsers: result?.browsers ?? [],
    os: result?.os ?? [],
    devices: result?.devices ?? [],
    referrers: result?.referrers ?? [],
  };
}
