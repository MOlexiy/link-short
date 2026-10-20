import { connectDb } from "../db/connection.js";
import { Link } from "../models/link.model.js";
import { Click } from "../models/click.model.js";
import { RateLimit } from "../models/rate-limit.model.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 4000);

await connectDb();
// Locally it's convenient to have indexes created automatically.
await Promise.all([Link.syncIndexes(), Click.syncIndexes(), RateLimit.syncIndexes()]);

createApp().listen(port, () => {
  console.log(`link-short API listening on http://localhost:${port}`);
});
