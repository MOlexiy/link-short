import mongoose, { type InferSchemaType, type Types } from "mongoose";
import { SLUG_PATTERN, isReservedSlug } from "../lib/slug.js";
import { MAX_URL_LENGTH, isHttpUrl } from "../lib/url.js";

const { Schema } = mongoose;

const linkSchema = new Schema(
  {
    slug: {
      type: String,
      required: true,
      trim: true,
      match: [SLUG_PATTERN, "slug may contain only letters, digits, '-' and '_' (3–32 chars)"],
      validate: {
        validator: (value: string) => !isReservedSlug(value),
        message: "slug '{VALUE}' is reserved",
      },
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: MAX_URL_LENGTH,
      validate: { validator: isHttpUrl, message: "url must be an absolute http(s) URL" },
    },
    /** Anonymous owner id kept in a cookie by the dashboard (no accounts in this demo). */
    ownerId: { type: String, required: true, minlength: 8, maxlength: 64 },
    /** Denormalised counter — lets the links list show totals without an aggregation. */
    clicks: { type: Number, default: 0, min: 0 },
    lastClickAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    /** Set by an operator (npm run link:disable) for abusive links — redirect stops, data is kept. */
    disabledAt: { type: Date, default: null },
    disabledReason: { type: String, maxlength: 200, default: null },
  },
  {
    collection: "links",
    timestamps: true,
    versionKey: false,
  },
);

// Point lookups on the redirect hot path.
linkSchema.index({ slug: 1 }, { name: "slug_unique", unique: true });

// "My links" page: equality on ownerId, newest first, cursor-paginated by _id.
linkSchema.index({ ownerId: 1, _id: -1 }, { name: "owner_recent" });

// MongoDB removes a document once expiresAt is in the past (the TTL monitor runs
// every ~60s, so the redirect handler also checks expiry itself). The partial
// filter keeps links without an expiry out of the index entirely.
linkSchema.index(
  { expiresAt: 1 },
  {
    name: "expires_ttl",
    expireAfterSeconds: 0,
    partialFilterExpression: { expiresAt: { $type: "date" } },
  },
);

export type LinkDoc = InferSchemaType<typeof linkSchema> & { _id: Types.ObjectId };

const createModel = () => mongoose.model("Link", linkSchema);
type LinkModel = ReturnType<typeof createModel>;

export const Link: LinkModel = (mongoose.models.Link as LinkModel | undefined) ?? createModel();
