export const fetchWithRetries = async <T>(
  fetchFn: () => Promise<T>,
  errorMsg: string,
  maxRetries = 5
): Promise<T | null> => {
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const data = await fetchFn();
      if (data) {
        return data;
      }
    } catch (error) {}
    retryCount++;
    await new Promise((resolve) => setTimeout(resolve, 200 * retryCount));
  }

  if (retryCount === maxRetries) {
    console.warn(errorMsg);
    return null;
  }
};

export function withErrorLogging<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  shouldThrow = true,
  note?: string
): (...args: T) => Promise<R> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (error) {
      const name = fn.name || "unknown function";
      const message =
        (note ? `[${name}] [error] ` + `[${note}] <` : `<`) +
        JSON.stringify(args) +
        ">";
      postRuntimeLogs(message);
      if (shouldThrow) {
        throw error;
      }
    }
  };
}

export async function fetchWithErrorLogging(
  url: RequestInfo | URL,
  options?: RequestInit,
  retry: boolean = false
): Promise<Response> {
  const start = Date.now();
  try {
    const res = await fetch(url, options);
    if (res.status >= 400) {
      const end = Date.now();
      postRuntimeLogs(
        `[HTTP] [error] [${res.status}] [${end - start}ms] <${url}>`
      );
    }
    return res;
  } catch (error) {
    if (retry) {
      try {
        const res = await fetch(url, options);
        if (res.status >= 400) {
          const end = Date.now();
          postRuntimeLogs(
            `[HTTP] [1] [error] [${res.status}] [${end - start}ms] <${url}>`
          );
        }
        return res;
      } catch (error) {
        try {
          const res = await fetch(url, options);
          if (res.status >= 400) {
            const end = Date.now();
            postRuntimeLogs(
              `[HTTP] [2] [error] [${res.status}] [${end - start}ms] <${url}>`
            );
          }
          return res;
        } catch (error) {
          const end = Date.now();
          postRuntimeLogs(
            `[HTTP] [3] [error] [fetch] [${(error as Error).name}] [${
              (error as Error).message
            }] [${end - start}ms] <${url}>`
          );
          return null;
        }
      }
    }
    throw error;
  }
}

export async function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController();
  const promise = fetchWithErrorLogging(url, {
    signal: controller.signal,
    ...options,
  });
  const timeout = setTimeout(() => controller.abort(), ms);
  return promise.finally(() => clearTimeout(timeout));
}

const dataCache: {
  [key: string]: any;
} = {};

export async function wrappedFetch(
  endpoint: string,
  { retries = 0, cache = false }: { retries?: number; cache?: boolean } = {}
): Promise<any> {
  if (cache) {
    retries++;
    if (!dataCache[endpoint]) {
      dataCache[endpoint] = _getData(retries);
    }
    return dataCache[endpoint];
  }
  return _getData(retries);

  async function _getData(retiresLeft = 0, attempts = 0) {
    try {
      const res = await fetchWithErrorLogging(endpoint).then((res) =>
        res.json()
      );
      return res;
    } catch (error) {
      if (retiresLeft > 0) {
        attempts++;
        await sleep(attempts * 30 * 1000); // retry after 30 seconds * attempts
        return _getData(retiresLeft - 1, attempts);
      }
      throw error;
    }
  }
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const fetchApi = async (url: string | Array<string>) => {
  if (!url) return null;
  try {
    const data =
      typeof url === "string"
        ? await fetchWithErrorLogging(url).then(async (res) => {
            if (!res.ok) {
              throw new Error(res.statusText ?? `Failed to fetch ${url}`);
            }
            const data = await res.json();
            return data;
          })
        : await Promise.all(
            url.map((u) =>
              fetchWithErrorLogging(u).then(async (res) => {
                if (!res.ok) {
                  throw new Error(res.statusText ?? `Failed to fetch ${u}`);
                }
                const data = await res.json();
                return data;
              })
            )
          );
    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : `Failed to fetch ${typeof url === "string" ? url : url.join(", ")}`
    );
  }
};

export function postRuntimeLogs(log) {
  console.log(log);
}

export async function batchFetchWithRateLimit<T>(
  requests: Array<string | { url: string; options?: RequestInit }>,
  config: {
    batchSize?: number; // Number of requests to process in parallel
    requestGapMs?: number; // Delay between individual requests (ms)
    batchGapMs?: number; // Delay between batches (ms)
    maxRetries?: number; // Maximum retry attempts per request
    retryDelayMs?: number; // Base delay between retries (ms)
    timeoutMs?: number; // Timeout for each request (ms)
    retryStatusCodes?: number[]; // HTTP status codes that should trigger a retry
  } = {}
): Promise<Array<T | null>> {
  const {
    batchSize = 5,
    requestGapMs = 200,
    batchGapMs = 1000,
    maxRetries = 3,
    retryDelayMs = 1000,
    timeoutMs = 10000,
    retryStatusCodes = [429, 408, 500, 502, 503, 504],
  } = config;

  // Normalize requests to a common format
  const normalizedRequests = requests.map((req) =>
    typeof req === "string" ? { url: req, options: {} } : req
  );

  const results: Array<T | null> = new Array(normalizedRequests.length).fill(
    null
  );

  // Process requests in batches
  for (let i = 0; i < normalizedRequests.length; i += batchSize) {
    const batch = normalizedRequests.slice(i, i + batchSize);
    const batchPromises = batch.map((request, batchIndex) => {
      // Add delay between requests in the same batch
      return sleep(batchIndex * requestGapMs).then(async () => {
        const index = i + batchIndex;
        const result = await fetchWithRetriesAndTimeout<T>(
          request.url,
          request.options,
          maxRetries,
          retryDelayMs,
          timeoutMs,
          retryStatusCodes
        );
        results[index] = result;
      });
    });

    await Promise.all(batchPromises);

    // Add delay between batches if we're not at the end
    if (i + batchSize < normalizedRequests.length) {
      await sleep(batchGapMs);
    }
  }

  return results;
}

async function fetchWithRetriesAndTimeout<T>(
  url: string,
  options: RequestInit = {},
  maxRetries: number,
  retryDelayMs: number,
  timeoutMs: number,
  retryStatusCodes: number[]
): Promise<T | null> {
  let retries = 0;

  while (retries <= maxRetries) {
    try {
      const controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchWithErrorLogging(url, {
          ...options,
          signal,
        });

        clearTimeout(timeoutId);

        // Check if the response status code indicates a retry is needed
        if (retryStatusCodes.includes(response.status)) {
          if (retries >= maxRetries) {
            postRuntimeLogs(
              `[RateLimitedFetch] Maximum retries (${maxRetries}) reached for ${url} with status ${response.status}`
            );
            return null;
          }

          // Calculate exponential backoff with jitter
          const delay =
            retryDelayMs * Math.pow(2, retries) * (0.5 + Math.random() * 0.5);
          postRuntimeLogs(
            `[RateLimitedFetch] Got status ${
              response.status
            }, retrying in ${Math.round(delay)}ms (${
              retries + 1
            }/${maxRetries})`
          );
          retries++;
          await sleep(delay);
          continue;
        }

        if (!response.ok) {
          postRuntimeLogs(
            `[RateLimitedFetch] Failed with status ${response.status}: ${url} - not retrying`
          );
          return null;
        }

        try {
          // Put the JSON parsing in its own try-catch block
          return await response.json();
        } catch (jsonError) {
          postRuntimeLogs(
            `[RateLimitedFetch] Failed to parse JSON from ${url}: ${jsonError.message}`
          );

          if (retries >= maxRetries) {
            return null;
          }

          const delay =
            retryDelayMs * Math.pow(2, retries) * (0.5 + Math.random() * 0.5);
          retries++;
          await sleep(delay);
          continue;
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === "AbortError") {
          postRuntimeLogs(
            `[RateLimitedFetch] Request timed out after ${timeoutMs}ms: ${url}`
          );
        } else {
          postRuntimeLogs(
            `[RateLimitedFetch] Network error: ${error.message} for ${url}`
          );
        }

        if (retries >= maxRetries) {
          postRuntimeLogs(
            `[RateLimitedFetch] Maximum retries (${maxRetries}) reached for ${url}`
          );
          return null;
        }

        const delay =
          retryDelayMs * Math.pow(2, retries) * (0.5 + Math.random() * 0.5);
        postRuntimeLogs(
          `[RateLimitedFetch] Retrying in ${Math.round(delay)}ms (${
            retries + 1
          }/${maxRetries})`
        );
        retries++;
        await sleep(delay);
      }
    } catch (error) {
      postRuntimeLogs(
        `[RateLimitedFetch] Unexpected error: ${error.message} for ${url}`
      );
      return null;
    }
  }

  return null;
}
