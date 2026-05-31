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

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    // Ensure the timer is cleared if fn settles first.
    controller.signal.addEventListener("abort", () => clearTimeout(timeoutId));
  });

  try {
    return await Promise.race([fn(controller.signal), timeoutPromise]);
  } finally {
    controller.abort();
  }
}
