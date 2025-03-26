import { getDailyPricesAndRates } from "../db/read";

// FIX: make into handler
// FIX: remove date field from priceDataByDay after testing is finished
export async function getPricesChart(
  protocolId: number,
  chain: string,
  troveManagerIndex: number,
  startTimestamp?: number,
  endTimestamp?: number,
  replaceLastEntryWithHourly?: boolean
) {
  const rawData = await getDailyPricesAndRates(
    protocolId,
    chain,
    troveManagerIndex,
    startTimestamp,
    endTimestamp,
    replaceLastEntryWithHourly
  );

  if (!rawData) return null;
  const { dates, priceData } = rawData;

  const priceDataByDay = dates
    .filter((dateInfo) => priceData[dateInfo.timestamp] !== undefined) // Filter out dates with no price data
    .map((dateInfo) => {
      const { date, timestamp } = dateInfo;
      const rawPriceData = priceData[timestamp];

      // Clean the price data by removing null/empty values
      const cleanedPriceData = Object.entries(rawPriceData).reduce((acc, [key, value]) => {
        // Skip empty objects, null values, and the timestamp field
        if (
          key === "timestamp" ||
          value === null ||
          (typeof value === "object" && value !== null && Object.keys(value).length === 0)
        ) {
          return acc;
        }
        acc[key] = value;
        return acc;
      }, {} as Record<string, any>);

      return {
        date,
        timestamp,
        priceData: cleanedPriceData,
      };
    });

  return {
    protocolId: rawData.protocolId,
    chain: rawData.chain,
    troveManagerIndex: rawData.troveManagerIndex,
    priceDataByDay,
  };
}
