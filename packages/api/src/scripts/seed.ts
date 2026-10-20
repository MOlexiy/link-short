/**
 * Fills the local database with a demo link and ~60 days of realistic clicks.
 *
 *   npm run db:seed -- <ownerId>
 *
 * Use the owner id from the dashboard cookie `ls_owner` to see the demo link there.
 */
import { connectDb, disconnectDb } from "../db/connection.js";
import { Link } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { visitorId } from "../lib/visitor.js";
import { DAY_MS } from "../lib/time.js";

const ownerId = process.argv[2] ?? "demo-owner-0001";
const slug = process.argv[3] ?? "demo";

const pick = <T>(items: readonly (readonly [T, number])[]): T => {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [value, weight] of items) if ((r -= weight) <= 0) return value;
  return items[0]![0];
};

const countries = [["UA", 50], ["PL", 12], ["DE", 10], ["US", 9], ["GB", 5], ["NL", 4], ["CZ", 3]] as const;
const browsers = [["Chrome", 55], ["Safari", 20], ["Firefox", 10], ["Microsoft Edge", 8], ["Opera", 4]] as const;
const oses = [["Windows", 35], ["Android", 28], ["iOS", 20], ["macOS", 12], ["Linux", 5]] as const;
const devices = [["mobile", 52], ["desktop", 44], ["tablet", 4]] as const;
const referrers = [["direct", 40], ["t.me", 22], ["linkedin.com", 14], ["google.com", 10], ["djinni.co", 8], ["github.com", 6]] as const;

await connectDb();
await Promise.all([Link.syncIndexes(), Click.syncIndexes()]);

const existing = await Link.findOne({ slug });
if (existing) {
  await Click.deleteMany({ linkId: existing._id });
  await existing.deleteOne();
}

const link = await Link.create({ slug, url: "https://github.com/MOlexiy/link-short", ownerId });

const now = Date.now();
const docs = [];
for (let d = 59; d >= 0; d--) {
  // Growth trend + weekday bump + noise.
  const weekday = new Date(now - d * DAY_MS).getUTCDay();
  const base = 6 + (60 - d) * 0.6 + (weekday === 0 || weekday === 6 ? -3 : 3);
  const count = Math.max(0, Math.round(base + (Math.random() - 0.5) * 8));
  for (let i = 0; i < count; i++) {
    const hour = pick([[9, 3], [10, 4], [11, 4], [13, 3], [15, 3], [18, 4], [20, 5], [22, 2], [2, 1]] as const);
    const ts = new Date(now - d * DAY_MS);
    ts.setUTCHours(hour - 3, Math.floor(Math.random() * 60));
    if (ts.getTime() > now) continue;
    const visitor = `visitor-${Math.floor(Math.random() * (count * 0.7 + 1))}`;
    docs.push({
      linkId: link._id,
      ts,
      visitorId: visitorId({ ip: visitor, userAgent: "seed", salt: "seed", at: ts }),
      country: pick(countries),
      browser: pick(browsers),
      os: pick(oses),
      device: pick(devices),
      referrer: pick(referrers),
      isBot: Math.random() < 0.06,
    });
  }
}

await Click.insertMany(docs, { ordered: false });
const humans = docs.filter((c) => !c.isBot);
await Link.updateOne(
  { _id: link._id },
  { $set: { clicks: humans.length, lastClickAt: humans.at(-1)?.ts ?? null } },
);

console.log(`Seeded /${slug} for owner "${ownerId}" with ${docs.length} clicks (${humans.length} human).`);
await disconnectDb();
