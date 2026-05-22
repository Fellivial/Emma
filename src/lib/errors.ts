// ─── Typed Errors ────────────────────────────────────────────────────────────

export class EmmaError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public retryable: boolean = false
  ) {
    super(message);
    this.name = "EmmaError";
  }
}

export class ApiError extends EmmaError {
  constructor(message: string, status: number) {
    super(message, "API_ERROR", status, status >= 500);
  }
}

export class AuthError extends EmmaError {
  constructor(message: string = "Authentication required") {
    super(message, "AUTH_ERROR", 401, false);
  }
}

export class RateLimitError extends EmmaError {
  constructor(public retryAfter: number = 60) {
    super("Rate limit exceeded", "RATE_LIMIT", 429, true);
  }
}

// ─── Retry Logic ─────────────────────────────────────────────────────────────

interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  retryOn?: number[]; // HTTP status codes to retry on
  connectionTimeoutMs?: number; // Abort if no response headers within this window
}

const DEFAULT_RETRY: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryOn: [429, 500, 502, 503, 529],
};

/**
 * Fetch with exponential backoff retry.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOpts: Partial<RetryOptions> = {}
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY, ...retryOpts };

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    let abortController: AbortController | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      if (opts.connectionTimeoutMs) {
        abortController = new AbortController();
        timeoutId = setTimeout(() => abortController!.abort(), opts.connectionTimeoutMs);
      }

      const res = await fetch(url, abortController ? { ...options, signal: abortController.signal } : options);

      // Headers received — connection succeeded, clear the timeout
      if (timeoutId) clearTimeout(timeoutId);

      // Success or non-retryable error
      if (res.ok || !opts.retryOn?.includes(res.status)) {
        return res;
      }

      // Retryable error — check if we have attempts left
      if (attempt === opts.maxRetries) {
        return res; // Return the error response on final attempt
      }

      // Wait with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        opts.maxDelay
      );

      console.warn(
        `[EMMA] Retry ${attempt + 1}/${opts.maxRetries} for ${url} (status ${res.status}) in ${Math.round(delay)}ms`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      // Connection timed out — don't retry, surface as 504
      if (err instanceof Error && err.name === "AbortError") {
        throw new EmmaError("Connection timed out", "TIMEOUT", 504, false);
      }

      // Network error
      if (attempt === opts.maxRetries) throw err;

      const delay = Math.min(
        opts.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        opts.maxDelay
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Should never reach here
  throw new EmmaError("Max retries exceeded", "RETRY_EXHAUSTED", 500, false);
}

// ─── In-Persona Error Messages ───────────────────────────────────────────────

export function getPersonaErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return "Mmm. Something's misconfigured on my end. Check the server logs?";
    case 401:
      return "Mmm. Looks like your session expired, baby. Sign in again for me?";
    case 429:
      return "Easy, baby. You're going too fast. Give me a second to catch up.";
    case 500:
    case 502:
    case 503:
      return "Something went wrong on my end. Give me a moment… I'll be right back.";
    case 504:
      return "Mmm. I couldn't reach my brain in time. Try again in a moment?";
    case 529:
      return "Mmm. I'm a little overwhelmed right now. Try again in a minute?";
    default:
      return "Something broke, baby. But I'm still here. Try again?";
  }
}
