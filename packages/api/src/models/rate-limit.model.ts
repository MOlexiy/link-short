import mongoose, { type InferSchemaType } from "mongoose";

const { Schema } = mongoose;

/**
 * Fixed-window counters: one tiny document per (key, window), e.g.
 * "create:ip:<hash>:3600:1760965200000" → { count: 4 }.
 * The TTL index removes each counter once its window is over.
 */
const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: "rate_limits",
    versionKey: false,
  },
);

rateLimitSchema.index({ expiresAt: 1 }, { name: "window_ttl", expireAfterSeconds: 0 });

export type RateLimitDoc = InferSchemaType<typeof rateLimitSchema>;

const createModel = () => mongoose.model("RateLimit", rateLimitSchema);
type RateLimitModel = ReturnType<typeof createModel>;

export const RateLimit: RateLimitModel = (mongoose.models.RateLimit as RateLimitModel | undefined) ?? createModel();
