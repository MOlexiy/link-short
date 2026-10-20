import mongoose from "mongoose";
import { config } from "../config.js";

mongoose.set("strictQuery", true);
mongoose.set("autoIndex", config.autoIndex);

/**
 * The connection lives in module scope, OUTSIDE the Lambda handler, so warm
 * invocations of the same container reuse it instead of opening a new one.
 * Without this every request would open a fresh connection and an Atlas M0
 * cluster (500 connections max) would be exhausted under modest load.
 *
 * We cache the *promise* rather than the connection so that concurrent calls
 * during a cold start share a single connect().
 */
let connecting: Promise<typeof mongoose> | null = null;

export async function connectDb(uri: string = config.mongoUri): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === mongoose.ConnectionStates.connected) return mongoose;

  connecting ??= mongoose
    .connect(uri, {
      appName: "link-short",
      // Fail fast instead of silently queueing queries while disconnected.
      bufferCommands: false,
      // One Lambda container handles one request at a time — a small pool is enough.
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 5_000,
      socketTimeoutMS: 20_000,
    })
    .catch((err: unknown) => {
      connecting = null; // allow the next invocation to retry
      throw err;
    });

  return connecting;
}

export async function disconnectDb(): Promise<void> {
  connecting = null;
  await mongoose.disconnect();
}
