// src/reviewSnippetStream.js
//
// Streaming counterpart to reviewSnippet.js. Uses the same raw-fetch
// approach (no Anthropic SDK dependency) and the same validation/error
// style, so the two files stay consistent.
import { API_URL, MAX_CODE_LENGTH, SYSTEM_PROMPT } from "./constants.js";
import { ValidationError } from "./reviewSnippet.js";

/**
 * Streams a code review from Claude to the client over Server-Sent Events.
 * Throws ValidationError / Error for problems that occur *before* any
 * bytes are sent to the client, so the caller (app.js) can respond with a
 * normal JSON error response — exactly like reviewSnippet() does. Once
 * streaming has actually started, errors are instead written into the
 * SSE stream itself, since the response headers are already committed.
 *
 * @param {string} code
 * @param {string} apiKey
 * @param {string} model
 * @param {import('express').Response} res
 */
export async function reviewSnippetStream(code, apiKey, model, res) {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new ValidationError("No code provided.");
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new ValidationError(`Code exceeds the ${MAX_CODE_LENGTH} character limit.`);
  }

  const userMessage = `<untrusted_code>\n${code}\n</untrusted_code>\n\nReview the code above.`;

  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      stream: true,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const errBody = await upstream.text().catch(() => "");
    // Thrown before any client-facing headers are set — app.js's catch
    // block will turn this into a normal res.status(500).json(...).
    throw new Error(`Claude API error (${upstream.status}): ${errBody}`);
  }

  // From here on, the response is committed to SSE — any further error
  // must be written into the stream, not returned as a JSON status.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop(); // last piece may be incomplete — keep for next read

      for (const evt of events) {
        const dataLine = evt.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;

        let json;
        try {
          json = JSON.parse(dataLine.slice(6));
        } catch {
          continue; // ignore malformed SSE lines rather than crashing the stream
        }

        // This is Claude's raw Messages-API SSE event shape (see the
        // event types you were taught: message_start, content_block_delta,
        // message_stop, etc.) — since we skipped the SDK, we parse it by hand.
        if (json.type === "content_block_delta" && json.delta?.type === "text_delta") {
          if (!clientDisconnected) {
            res.write(`data: ${JSON.stringify({ text: json.delta.text })}\n\n`);
          }
        }
      }
    }

    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
  } catch (err) {
    console.error("Stream read error:", err);
    if (!clientDisconnected) {
      res.write(`data: ${JSON.stringify({ error: "Review generation failed" })}\n\n`);
    }
  } finally {
    if (!clientDisconnected) res.end();
  }
}
