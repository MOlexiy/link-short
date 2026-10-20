import { lambda } from "../lib/lambda.js";
import { createLinkRoute } from "../routes/links.routes.js";

export const handler = lambda(createLinkRoute);
