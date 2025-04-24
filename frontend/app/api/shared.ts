import {
  PROTOCOL_CONFIG_API,
  POOL_DATA_CHART_API,
  LATEST_TROVE_DATA_API,
  EVENTS_API,
} from "~/constants";

const defaultChartDaysToFetch = 60;

const PROTOCOLS_TO_IGNORE = [1] as const;

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

export const getProtocols = async (protocolId?: number) => {
  try {
    let data;
    if (protocolId !== undefined) {
      data = await fetch(
        `${PROTOCOL_CONFIG_API}?protocolId=${protocolId}`
      ).then((resp) => resp.json());
      return data;
    } else {
      data = await fetch(`${PROTOCOL_CONFIG_API}`).then((resp) => resp.json());
      // Filter out ignored protocols
      return Array.isArray(data)
        ? data.filter(
            (protocol) => !PROTOCOLS_TO_IGNORE.includes(protocol.protocolId)
          )
        : data;
    }
  } catch (error) {
    console.error("Failed to fetch protocols:", error);
    return [];
  }
};

export const getLatestTroves = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  attachPoolData?: boolean
) => {
  let url = `${LATEST_TROVE_DATA_API}/${protocolId}/${chain}`;
  if (troveManagerIndex !== undefined) {
    url += `?troveManagerIndex=${troveManagerIndex}`;
  }
  if (attachPoolData) {
    url += (url.includes("?") ? "&" : "?") + "attachPoolData=true";
  }
  for (let i = 0; i < 5; i++) {
    try {
      return await fetch(url).then((resp) => resp.json());
    } catch (e) {}
  }
  throw new Error(`${url} is broken`);
};

const getStartTimestampForChart = (daysToFetch: number) => {
  const currentDate = new Date();
  const startDate = new Date(currentDate);
  startDate.setDate(startDate.getDate() - daysToFetch);
  return Math.floor(startDate.getTime() / 1000); // Convert to seconds
};

export const getPoolDataChart = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  useDefaultStartTimestamp?: boolean
) => {
  for (let i = 0; i < 5; i++) {
    try {
      let url = `${POOL_DATA_CHART_API}/${protocolId}/${chain}`;

      if (troveManagerIndex !== undefined) {
        url += `?troveManagerIndex=${troveManagerIndex}`;
      }

      if (useDefaultStartTimestamp) {
        const startTimestamp = getStartTimestampForChart(
          defaultChartDaysToFetch
        );
        url +=
          troveManagerIndex !== undefined
            ? `&startTimestamp=${startTimestamp}`
            : `?startTimestamp=${startTimestamp}`;
      }

      return await fetch(url).then((resp) => resp.json());
    } catch (e) {}
  }
  throw new Error(
    `${POOL_DATA_CHART_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};

export const getEvents = async (
  protocolId: number,
  chain: string,
  troveManagerIndex?: number,
  useDefaultStartTimestamp?: boolean
) => {
  for (let i = 0; i < 5; i++) {
    try {
      let url = `${EVENTS_API}/${protocolId}/${chain}`;

      if (troveManagerIndex !== undefined) {
        url += `?troveManagerIndex=${troveManagerIndex}`;
      }

      if (useDefaultStartTimestamp) {
        const startTimestamp = getStartTimestampForChart(
          defaultChartDaysToFetch
        );
        url +=
          troveManagerIndex !== undefined
            ? `&startTimestamp=${startTimestamp}`
            : `?startTimestamp=${startTimestamp}`;
      }

      return await fetch(url).then((resp) => resp.json());
    } catch (e) {}
  }
  throw new Error(
    `${EVENTS_API}/${protocolId}/${chain}?troveManagerIndex=${troveManagerIndex} is broken`
  );
};
