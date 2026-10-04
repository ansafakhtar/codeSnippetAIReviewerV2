import { streamReview } from "./reviewStreamClient.js";

const codeInput = document.getElementById("codeInput");
const counter = document.getElementById("counter");
const reviewBtn = document.getElementById("reviewBtn");
const stateEl = document.getElementById("state");
const streamRaw = document.getElementById("streamRaw");
const summaryEl = document.getElementById("summary");
const summaryText = document.getElementById("summaryText");
const langGuess = document.getElementById("langGuess");
const commentsEl = document.getElementById("comments");

let MAX_LENGTH = 5000; // overwritten once we confirm the server's actual limit
const API_BASE = window.APP_CONFIG?.apiBaseUrl || "";

init();

async function init() {
  try {
    const res = await fetch(`${API_BASE}/api/limit`);
    const data = await res.json();
    if (data.maxLength) {
      MAX_LENGTH = data.maxLength;
      codeInput.setAttribute("maxlength", String(MAX_LENGTH));
    }
  } catch {
    // Fall back to the HTML maxlength attribute already in place.
  }
  updateCounter();
}

codeInput.addEventListener("input", updateCounter);
reviewBtn.addEventListener("click", runReview);

function updateCounter() {
  // Client-side limit is a UX convenience only — the server re-checks
  // this independently, since a client-side check can always be bypassed.
  const len = codeInput.value.length;
  counter.textContent = `${len} / ${MAX_LENGTH}`;
  counter.classList.toggle("near-limit", len > MAX_LENGTH * 0.9 && len <= MAX_LENGTH);
  counter.classList.toggle("at-limit", len >= MAX_LENGTH);
  reviewBtn.disabled = len === 0 || len > MAX_LENGTH;
}

function runReview() {
  const code = codeInput.value;
  reset();
  reviewBtn.disabled = true;
  reviewBtn.textContent = "Reviewing…";
  showState("Talking to Claude…");
  streamRaw.hidden = false;
  streamRaw.textContent = "";

  streamReview(code, {
    apiBase: API_BASE,
    onChunk: (fullTextSoFar) => {
      // Live progress: the raw JSON building up as Claude generates it.
      // Not pretty, but it proves the connection is alive and streaming —
      // it gets replaced by the structured view the moment we're done.
      streamRaw.textContent = fullTextSoFar;
    },
    onDone: (fullText) => {
      // streamRaw.hidden = true;
      let data;
      try {
        data = parseReviewJson(fullText);
      } catch {
        showState("Could not parse the review response.", true);
        finishReview();
        return;
      }

      hideState();
      summaryEl.hidden = false;
      summaryText.textContent = data.summary;
      langGuess.textContent = `Detected: ${data.language_guess}`;
      renderComments(data.comments || []);
      finishReview();
    },
    onError: (err) => {
      streamRaw.hidden = true;
      showState(err.message || "Could not reach the server. Is it running?", true);
      finishReview();
    },
  });
}

function finishReview() {
  reviewBtn.disabled = false;
  reviewBtn.textContent = "Review code";
  updateCounter();
}

function parseReviewJson(rawText) {
  // Mirrors the server's parseJson in reviewSnippet.js — the system
  // prompt asks for raw JSON, but models sometimes wrap it in fences anyway.
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  return JSON.parse(cleaned);
}

function renderComments(comments) {
  commentsEl.innerHTML = "";

  if (comments.length === 0) {
    showState("No issues found. Looks good.");
    return;
  }

  for (const c of comments) {
    const li = document.createElement("li");
    li.className = "comment";
    li.dataset.severity = c.severity || "suggestion";

    // Built with textContent assignments below, not innerHTML with
    // interpolated strings, so nothing the model (or the pasted code
    // it was reviewing) returns can inject markup into the page.
    const top = document.createElement("div");
    top.className = "comment-top";

    const lineEl = document.createElement("span");
    lineEl.className = "comment-line";
    lineEl.textContent = c.line_hint || "general";

    const sevEl = document.createElement("span");
    sevEl.className = "comment-severity";
    sevEl.textContent = c.severity || "";

    top.append(lineEl, sevEl);

    const issueEl = document.createElement("p");
    issueEl.className = "comment-issue";
    issueEl.textContent = c.issue || "";

    const detailEl = document.createElement("p");
    detailEl.className = "comment-detail";
    detailEl.textContent = c.detail || "";

    li.append(top, issueEl, detailEl);
    commentsEl.appendChild(li);
  }
}

function reset() {
  hideState();
  summaryEl.hidden = true;
  commentsEl.innerHTML = "";
}

function showState(message, isError = false) {
  stateEl.hidden = false;
  stateEl.textContent = message;
  stateEl.classList.toggle("error", isError);
}

function hideState() {
  stateEl.hidden = true;
  stateEl.classList.remove("error");
}
