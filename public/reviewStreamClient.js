// public/reviewStreamClient.js
//
// Consumes the /review-stream SSE endpoint. Reports progress via onChunk
// (the accumulated text so far — useful for a live raw preview) and the
// complete text via onDone, since the server's response is a single JSON
// object built up over the stream, not something safe to parse mid-flight.

export async function streamReview(code, { apiBase = "", onChunk, onDone, onError } = {}) {
  let full = "";

  let res;
  try {
    res = await fetch(`${apiBase}/api/review-stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
  } catch (networkErr) {
    onError?.(networkErr);
    return;
  }

  if (!res.ok || !res.body) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) message = data.error;
    } catch {
      // response wasn't JSON (e.g. rate limiter's plain text) — keep the HTTP status message
    }
    onError?.(new Error(message));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop(); // last piece may be incomplete — keep it for next read

    for (const chunk of chunks) {
      if (!chunk.startsWith("data: ")) continue;

      let payload;
      try {
        payload = JSON.parse(chunk.slice(6));
      } catch {
        continue; // ignore malformed lines rather than crashing the UI
      }

      if (payload.text) {
        full += payload.text;
        onChunk?.(full);
      }
      if (payload.done) {
        onDone?.(full);
      }
      if (payload.error) {
        onError?.(new Error(payload.error));
      }
    }
  }
}
