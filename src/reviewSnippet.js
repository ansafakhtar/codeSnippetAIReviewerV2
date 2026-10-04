/**
 * Sends a code snippet to Claude for review. The snippet is wrapped in an
 * explicit untrusted-content boundary so the model treats it as data, not
 * as instructions to follow.
 */
import { API_URL, MAX_CODE_LENGTH, SYSTEM_PROMPT } from "./constants.js";

export async function reviewSnippet(code, apiKey, model) {
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new ValidationError("No code provided.");
  }
  if (code.length > MAX_CODE_LENGTH) {
    throw new ValidationError(`Code exceeds the ${MAX_CODE_LENGTH} character limit.`);
  }

  const userMessage = `<untrusted_code>\n${code}\n</untrusted_code>\n\nReview the code above.`;

  const response = await fetch(API_URL, {
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
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const rawText = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return parseJson(rawText);
}

function parseJson(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error("Could not parse the model's response as JSON.");
  }
}

export class ValidationError extends Error {}
