import { lambda } from "../lib/lambda.js";
import { homeRoute } from "../routes/redirect.routes.js";

export const handler = lambda(homeRoute, { db: false });
