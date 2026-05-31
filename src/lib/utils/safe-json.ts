/**
 * Parse JSON returned by an LLM safely.
 *
 * Strips markdown code fences (```json ... ```) and never throws — returns a
 * discriminated result so a bad model response can be logged and skipped
 * instead of crashing a whole batch.
 */
export type SafeJsonResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function safeParseJson<T>(
  text: string,
  label: string = "JSON"
): SafeJsonResult<T> {
  let cleaned = (text || "").trim();

  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const data = JSON.parse(cleaned) as T;
    return { success: true, data };
  } catch (error) {
    console.error(`Failed to parse ${label}:`, error);
    console.error(`Raw text (first 500 chars): ${(text || "").substring(0, 500)}`);
    return {
      success: false,
      error: `Failed to parse ${label}: ${
        error instanceof Error ? error.message : "Unknown parse error"
      }`,
    };
  }
}
