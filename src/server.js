import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Mounted under /api so the frontend's fetch("/api/review") calls work
// identically here and on Netlify (where the redirect in netlify.toml
// achieves the same /api/* -> route mapping).
app.use("/api", createApp());

// Static serving only happens for local dev — on Netlify, the "public"
// folder is deployed and served directly by Netlify's CDN, not by this
// Express app.
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`Code snippet reviewer running at http://localhost:${PORT}`);
});
