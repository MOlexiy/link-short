import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, disconnectDb } from "../../src/db/connection.js";
import { Link } from "../../src/models/link.model.js";
import { Click } from "../../src/models/click.model.js";
import { RateLimit } from "../../src/models/rate-limit.model.js";

let server: MongoMemoryServer | undefined;

/** Starts a throwaway MongoDB, connects Mongoose and creates the schema indexes. */
export async function startTestDb() {
  server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri("link-short-test");
  await connectDb(process.env.MONGODB_URI);
  // autoIndex is off (as in Lambda) — create indexes explicitly, like `npm run db:indexes`.
  await Promise.all([Link.syncIndexes(), Click.syncIndexes(), RateLimit.syncIndexes()]);
}

export async function stopTestDb() {
  await disconnectDb();
  await server?.stop();
}

export async function clearDb() {
  await Promise.all([Link.deleteMany({}), Click.deleteMany({}), RateLimit.deleteMany({})]);
}
