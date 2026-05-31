/**
 * Retry an async operation with exponential backoff + jitter.
 *
 * Generic and reusable — used for Gemini calls, and intended for Brave search
 * and Playwright/Cheerio fetches as well. Only retries errors classified as
 * transient by `retryableErrors` (rate limits, 5xx, timeouts, network resets).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryableErrors?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableErrors = isRetryableError,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !retryableErrors(error)) {
        throw error;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
        maxDelayMs
      );

      console.error(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms:`,
        error instanceof Error ? error.message : "Unknown error"
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Rate limit, server error, timeout, network.
    if (message.includes("429") || message.includes("rate limit")) return true;
    if (
      message.includes("500") ||
      message.includes("503") ||
      message.includes("502")
    ) {
      return true;
    }
    if (message.includes("timeout") || message.includes("timed out")) return true;
    if (message.includes("econnreset") || message.includes("econnrefused")) {
      return true;
    }
    if (message.includes("fetch failed") || message.includes("network")) {
      return true;
    }
  }
  return false;
}
