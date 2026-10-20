import { lambda } from "../lib/lambda.js";
import { redirectRoute } from "../routes/redirect.routes.js";

export const handler = lambda(redirectRoute);
