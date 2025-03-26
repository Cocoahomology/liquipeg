import * as sdk from "@defillama/sdk";
import { getLatestBlock } from "@defillama/sdk/build/util";
import { getPriceDataByProtocolId } from "../utils/prices";
import { insertPricesAndRatesEntries, insertBlockTimestampEntries } from "../db/write";
import { CollateralPricesAndRates, CollateralPricesAndRatesEntry } from "../utils/types";
import db from "../db/db";

// FIX: move to job
(async () => {
  const fetchPriceDataFn = await getPriceDataByProtocolId(1);
  console.log("Fetching Block Number");
  const blockNumber = (await getLatestBlock("ethereum")).number;
  console.log("blockNumber", blockNumber);
  console.log("Fetching Price Data");
  const priceData = (await fetchPriceDataFn(
    new sdk.ChainApi({
      chain: "ethereum",
    })
  )) as CollateralPricesAndRates[];

  const formattedPriceData: CollateralPricesAndRatesEntry[] = priceData.map((d) => ({
    protocolId: 1,
    blockNumber,
    chain: "ethereum",
    troveManagerIndex: d.troveManagerIndex,
    colUSDPriceFeed: d.colUSDPriceFeed,
    colUSDOracle: d.colUSDOracle,
    LSTUnderlyingCanonicalRate: d.LSTUnderlyingCanonicalRate,
    LSTUnderlyingMarketRate: d.LSTUnderlyingMarketRate,
    underlyingUSDOracle: d.underlyingUSDOracle,
    deviation: d.deviation,
    redemptionRelatedOracles: Object.fromEntries(
      Object.entries(d).filter(([k]) => k.startsWith("redemptionRelatedOracle"))
    ) as { [key: `redemptionRelatedOracle${number}`]: string },
  }));

  console.dir(formattedPriceData, { depth: null });

  if (formattedPriceData) {
    console.log("Inserting price data and block timestamps.");
    await db.transaction(async (trx) => {
      await insertPricesAndRatesEntries(formattedPriceData, { allowNullDbValues: true }, trx);
      await insertBlockTimestampEntries("ethereum", [{ blockNumber: blockNumber }], { allowNullDbValues: true }, trx);
    });
    console.log("Transaction completed successfully");
  }
  console.log("done");
})();
