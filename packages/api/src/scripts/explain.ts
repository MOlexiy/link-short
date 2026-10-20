/**
 * Prints the query plans for the hot queries so you can confirm they hit indexes
 * (IXSCAN, not COLLSCAN) and compare docsExamined vs nReturned.
 *
 *   npm run db:seed && npm run db:explain -- demo
 */
import { connectDb, disconnectDb } from "../db/connection.js";
import { Link } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { buildStatsPipeline } from "../services/stats.service.js";
import { DAY_MS } from "../lib/time.js";

type PlanNode = { stage?: string; indexName?: string; inputStage?: PlanNode; inputStages?: PlanNode[] };

function stages(node: PlanNode | undefined, out: string[] = []): string[] {
  if (!node) return out;
  out.push(node.indexName ? `${node.stage}(${node.indexName})` : String(node.stage));
  stages(node.inputStage, out);
  node.inputStages?.forEach((n) => stages(n, out));
  return out;
}

const slug = process.argv[2] ?? "demo";
await connectDb();

const link = await Link.findOne({ slug }).lean();
if (!link) {
  console.error(`No link "${slug}" — run npm run db:seed first`);
  process.exit(1);
}

const redirectPlan = (await Link.findOne({ slug }, { url: 1, expiresAt: 1 }).explain("executionStats")) as any;
console.log("\nRedirect lookup:", stages(redirectPlan.queryPlanner.winningPlan).join(" ← "));
console.log("  docsExamined:", redirectPlan.executionStats.totalDocsExamined, "nReturned:", redirectPlan.executionStats.nReturned);

const listPlan = (await Link.find({ ownerId: link.ownerId }).sort({ _id: -1 }).limit(21).explain("executionStats")) as any;
console.log("\nMy links:", stages(listPlan.queryPlanner.winningPlan).join(" ← "));

const now = new Date();
const pipeline = buildStatsPipeline({ linkId: link._id, from: new Date(now.getTime() - 30 * DAY_MS), to: now, tz: "Europe/Kyiv" });
const aggPlan = (await Click.aggregate(pipeline).explain("executionStats")) as any;
const cursorStage = aggPlan.stages?.[0]?.$cursor ?? aggPlan;
const winning = cursorStage.queryPlanner?.winningPlan;
console.log("\nStats $match:", stages(winning?.queryPlan ?? winning).join(" ← "));
const exec = cursorStage.executionStats;
if (exec) console.log("  keysExamined:", exec.totalKeysExamined, "docsExamined:", exec.totalDocsExamined, "nReturned:", exec.nReturned);

await disconnectDb();
