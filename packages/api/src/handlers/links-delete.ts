import { lambda } from "../lib/lambda.js";
import { deleteLinkRoute } from "../routes/links.routes.js";

export const handler = lambda(deleteLinkRoute);
