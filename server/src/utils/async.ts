const axios = require("axios");
const retry = require("async-retry");

export const fetchWithRetry = async (
  url: string,
  retries?: number,
  timeoutMs?: number,
  minRetryTimeoutMs?: number,
  maxRetryTimeoutMs?: number
) => {
  try {
    const response = await retry(
      async () => {
        const axiosPromise = axios.get(url);
        const res = (await withTimeout(axiosPromise, {
          milliseconds: timeoutMs ?? 5000,
          message: `Request timed out after ${timeoutMs ?? 5000}ms`,
        })) as any;

        if (res.status !== 200) {
          throw new Error(`Failed to fetch data for url ${url}. Status code: ${res.status}`);
        }
        return res.data;
      },
      {
        retries,
        minTimeout: minRetryTimeoutMs,
        maxTimeout: maxRetryTimeoutMs,
      }
    );
    return response;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch data from ${url} after ${retries} retries: ${error.message}`);
    } else {
      throw new Error(`Failed to fetch data from ${url} after ${retries} retries: Unknown error`);
    }
  }
};

type TimeoutOptions = {
  milliseconds: number;
  message?: string;
};

export async function withTimeout<T>(promise: Promise<T>, options: TimeoutOptions): Promise<T> {
  const { setTimeout } = await import("timers/promises");
  const timeoutError = new Error(options.message || `Operation timed out after ${options.milliseconds}ms`);

  return Promise.race([
    promise,
    setTimeout(options.milliseconds).then(() => {
      throw timeoutError;
    }),
  ]);
}
