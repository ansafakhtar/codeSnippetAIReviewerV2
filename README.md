# Code Snippet Reviewer

Paste a code snippet, get an AI review. Built as a standalone app.

## Setup

```bash
npm install
cp .env.example .env
# edit .env and add your ANTHROPIC_API_KEY, CLAUDE_MODEL and PORT
npm start
```

Open http://localhost:3000.

## Security model

Pasted code is untrusted input on two fronts, and this app defends both:

**1. It could try to manipulate the AI (prompt injection).**
The snippet is wrapped in `<untrusted_code>` tags and the system prompt
explicitly instructs Claude to treat that content as data to review, never
as instructions to follow — even if it contains text pretending to be a
system message or admin override.

**2. It could try to exploit the app itself.**
- The snippet is **never executed** — in Node or the browser. It's read as
  text and sent to the Claude API as text. Nothing ever calls `eval`,
  `new Function()`, or a subprocess on user input.
- A hard character limit (`MAX_CODE_LENGTH` in `src/reviewSnippet.js`,
  currently 5000) is enforced **server-side**, independent of the
  frontend's textarea limit — a client-side check alone can always be
  bypassed by calling the API directly.
- `express.json({ limit: "20kb" })` rejects oversized request bodies
  before they reach any application logic.
- `express-rate-limit` caps requests per IP (3/hour by default) to
  prevent cost abuse or scripted hammering of your API key.
- `helmet` sets a Content Security Policy and other security headers.
- The API key lives only in `.env` on the server; the browser never sees it.
- Review results are rendered by building DOM nodes and setting
  `.textContent`, never by inserting strings into `innerHTML` — so nothing
  in the model's response (or the code it reviewed) can become live markup.

None of this makes prompt injection impossible to attempt — it makes it
unlikely to succeed and, just as importantly, ensures that even a
successful attempt can't do anything beyond producing a weird chat
response. The app never grants the AI's output any special permissions.

## Files

- `src/app.js` — Express app: routes, validation, security middleware (shared by local dev and the Netlify function)
- `src/reviewSnippet.js` — the hardened Claude API call and validation
- `src/server.js` — local dev entrypoint: mounts app.js under /api, serves public/, listens on a port
- `netlify/functions/api.js` — wraps app.js as a Netlify serverless function
- `netlify.toml` — Netlify build/routing config
- `public/config.js` — single place to point the frontend at a different backend origin if you're not using the same-origin default
- `public/` — vanilla HTML/CSS/JS frontend