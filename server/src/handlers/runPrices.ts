import * as sdk from "@defillama/sdk";
import { wrapScheduledLambda } from "../utils/wrap";
import { getLatestBlock } from "@defillama/sdk/build/util";
import { getPriceDataByProtocolId } from "../utils/prices";
import { insertPricesAndRatesEntries, insertBlockTimestampEntries } from "../db/write";
import { CollateralPricesAndRates, CollateralPricesAndRatesEntry } from "../utils/types";
import db from "../db/db";

// FIX: add logging
const handler = async (event: any) => {
  const protocolId = event.protocolId;
  const chain = event.chain;
  const fetchPriceDataFn = await getPriceDataByProtocolId(protocolId);
  const block = await getLatestBlock(chain);
  const { number: blockNumber, timestamp } = block;
  const priceData = (await fetchPriceDataFn(
    new sdk.ChainApi({
      chain: chain,
    })
  )) as CollateralPricesAndRates[];

  const formattedPriceData: CollateralPricesAndRatesEntry[] = priceData.map((d) => ({
    protocolId: protocolId,
    blockNumber,
    chain: chain,
    troveManagerIndex: d.troveManagerIndex,
    colUSDPriceFeed: d.colUSDPriceFeed,
    colUSDOracle: d.colUSDOracle,
    LSTUnderlyingCanonicalRate: d.LSTUnderlyingCanonicalRate,
    LSTUnderlyingMarketRate: d.LSTUnderlyingMarketRate,
    underlyingUSDOracle: d.underlyingUSDOracle,
    deviation: d.deviation,
    redemptionRelatedOracles: Object.fromEntries(
      Object.entries(d).filter(([k]) => k.startsWith("redemptionRelatedOracle"))
    ) as { [key: `redemptionRelatedOracle${number}`]: number },
  }));

  if (formattedPriceData) {
    console.log("Inserting price data and block timestamps.");
    await db.transaction(async (trx) => {
      await insertPricesAndRatesEntries(formattedPriceData, { allowNullDbValues: true }, trx);
      await insertBlockTimestampEntries(
        chain,
        [{ blockNumber: blockNumber, timestamp }],
        { allowNullDbValues: true },
        trx
      );
    });
    console.log("Transaction completed successfully");
  } else {
    console.log(`No price data found for protocolId ${protocolId} on chain ${chain}`);
  }
  console.log("done inserting prices");
};

export default wrapScheduledLambda(handler);
