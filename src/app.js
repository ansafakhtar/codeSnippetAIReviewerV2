import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { reviewSnippet, ValidationError } from "./reviewSnippet.js";
import { reviewSnippetStream } from "./reviewSnippetStream.js";
import { MAX_CODE_LENGTH } from "./constants.js";

export function createApp() {
  const app = express();

  // Netlify's /api/* redirect preserves the ORIGINAL request path
  // ("/api/limit") when proxying to this function, rather than rewriting
  // it to the function's own path. A direct call to the function's raw
  // URL, on the other hand, arrives as "/.netlify/functions/api/limit".
  // Normalize both shapes down to the same thing ("/limit") before
  // routing, so it works no matter which way the request arrived.
  app.use((req, res, next) => {
    req.url = req.url.replace(/^\/\.netlify\/functions\/api/, "").replace(/^\/api/, "");
    if (req.url === "") req.url = "/";
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "https://fonts.googleapis.com"],
          fontSrc: ["https://fonts.gstatic.com"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  app.use(express.json({ limit: "20kb" }));

  // Note: on Netlify, each function invocation may run in a fresh,
  // short-lived instance, so this in-memory limiter's counts don't
  // reliably persist across requests the way they do on a normal always-on server.
  // For real abuse protection on Netlify, prefer their built-in rate
  // limiting/firewall rules (in Site settings) as the primary defense.
  const reviewLimiter = rateLimit({
    windowMs: 3600 * 1000,
    max: 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please wait a moment and try again." },
  });

  app.post("/review", reviewLimiter, async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
    }
    const model = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
    const code = req.body?.code;

    try {
      const review = await reviewSnippet(code, apiKey, model);
      res.json(review);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: "Review failed. Please try again." });
    }
  });

  // Shares reviewLimiter with /review since both hit the paid API and
  // should count against the same hourly budget.
  app.post("/review-stream", reviewLimiter, async (req, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY." });
    }
    const model = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
    const code = req.body?.code;

    try {
      // reviewSnippetStream writes the SSE response itself; it only
      // throws for problems that occur before any bytes are sent, so
      // this catch block mirrors the /review route's error handling.
      await reviewSnippetStream(code, apiKey, model, res);
    } catch (err) {
      if (err instanceof ValidationError) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Review failed. Please try again." });
      }
    }
  });

  app.get("/limit", (req, res) => {
    res.json({ maxLength: MAX_CODE_LENGTH });
  });

  return app;
}
