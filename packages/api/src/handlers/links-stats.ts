import { lambda } from "../lib/lambda.js";
import { linkStatsRoute } from "../routes/links.routes.js";

export const handler = lambda(linkStatsRoute);
