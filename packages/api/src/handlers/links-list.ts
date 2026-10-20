import { lambda } from "../lib/lambda.js";
import { listLinksRoute } from "../routes/links.routes.js";

export const handler = lambda(listLinksRoute);
