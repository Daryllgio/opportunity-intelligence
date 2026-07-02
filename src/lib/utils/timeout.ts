/**
 * Run an async operation with a hard timeout.
 *
 * If `fn` honours the AbortController (e.g. fetch with `signal`), pass the
 * signal through; otherwise this still rejects after `timeoutMs` so callers
 * don't hang forever. Generic and reusable across Gemini, Brave, and captures.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  label: string = "Operation"
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    // Only clear the timer. Do NOT abort on success: callers that return a
    // Response read its body after this resolves, and aborting here would
    // cancel the still-unread body stream (surfacing as an AbortError).
    clearTimeout(timeoutId);
  }
}
