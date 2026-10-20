/**
 * Creates/updates indexes declared in the Mongoose schemas and drops indexes
 * that are no longer declared. Run after deploys (CI does it automatically):
 *
 *   MONGODB_URI="mongodb+srv://..." npm run db:indexes
 */
import { connectDb, disconnectDb } from "../db/connection.js";
import { Link } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { RateLimit } from "../models/rate-limit.model.js";

await connectDb();
for (const model of [Link, Click, RateLimit]) {
  const dropped = await model.syncIndexes();
  const indexes = await model.listIndexes();
  console.log(
    `${model.collection.collectionName}: ${indexes.map((i) => i.name).join(", ")}` +
      (dropped.length ? ` (dropped: ${dropped.join(", ")})` : ""),
  );
}
await disconnectDb();
