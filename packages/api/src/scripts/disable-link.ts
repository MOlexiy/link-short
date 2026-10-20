/**
 * Kill switch for abusive links: the redirect stops immediately, the data stays
 * for investigation.
 *
 *   npm run link:disable -- <slug> "phishing report from abuse@..."
 *   npm run link:disable -- <slug> --enable
 */
import { connectDb, disconnectDb } from "../db/connection.js";
import { Link } from "../models/link.model.js";

const [slug, arg] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npm run link:disable -- <slug> ["reason" | --enable]');
  process.exit(1);
}

await connectDb();
const enable = arg === "--enable";
const result = await Link.updateOne(
  { slug },
  enable
    ? { $set: { disabledAt: null, disabledReason: null } }
    : { $set: { disabledAt: new Date(), disabledReason: arg ?? "abuse" } },
);
console.log(result.matchedCount ? `/${slug} ${enable ? "enabled" : "disabled"}` : `No link /${slug}`);
await disconnectDb();
process.exit(result.matchedCount ? 0 : 1);
