const axios = require("axios");
const retry = require("async-retry");

export const fetchWithRetry = async (url: string, retries?: number, minTimeout?: number, maxTimeout?: number) => {
  try {
    const response = await retry(
      async () => {
        const res = await axios.get(url);
        if (res.status !== 200) {
          throw new Error(`Failed to fetch data for url ${url}. Status code: ${res.status}`);
        }
        return res.data;
      },
      {
        retries,
        minTimeout: minTimeout,
        maxTimeout: maxTimeout,
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
