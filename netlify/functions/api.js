import serverless from "serverless-http";
import { createApp } from "../../src/app.js";

const app = createApp();

// Wraps the same Express app used locally so the route logic, validation,
// and prompt-injection defenses are identical in both environments.
export const handler = serverless(app);
