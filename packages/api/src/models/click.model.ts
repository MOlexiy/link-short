import mongoose, { type InferSchemaType, type Types } from "mongoose";
import { UNKNOWN_COUNTRY } from "../lib/visitor.js";

const { Schema } = mongoose;

export const CLICK_RETENTION_DAYS = 400;

const clickSchema = new Schema(
  {
    linkId: { type: Schema.Types.ObjectId, ref: "Link", required: true },
    ts: { type: Date, required: true, default: () => new Date() },
    /** Daily-rotating salted hash, see lib/visitor.ts. Never a raw IP. */
    visitorId: { type: String, required: true },
    country: { type: String, uppercase: true, minlength: 2, maxlength: 2, default: UNKNOWN_COUNTRY },
    browser: { type: String, maxlength: 64, default: "Unknown" },
    os: { type: String, maxlength: 64, default: "Unknown" },
    device: { type: String, enum: ["desktop", "mobile", "tablet", "other"], default: "other" },
    referrer: { type: String, maxlength: 255, default: "direct" },
    isBot: { type: Boolean, default: false },
  },
  {
    collection: "clicks",
    versionKey: false,
  },
);

// Every stats query is "clicks of link X, humans only, in time range" →
// ESR rule: Equality fields (linkId, isBot) first, Range field (ts) last.
// The same index also serves deleteMany({ linkId }) via its prefix.
clickSchema.index({ linkId: 1, isBot: 1, ts: 1 }, { name: "link_bot_ts" });

// Raw click events are kept for a limited time; MongoDB deletes them automatically.
clickSchema.index({ ts: 1 }, { name: "retention_ttl", expireAfterSeconds: CLICK_RETENTION_DAYS * 24 * 60 * 60 });

export type ClickDoc = InferSchemaType<typeof clickSchema> & { _id: Types.ObjectId };

const createModel = () => mongoose.model("Click", clickSchema);
type ClickModel = ReturnType<typeof createModel>;

export const Click: ClickModel = (mongoose.models.Click as ClickModel | undefined) ?? createModel();
