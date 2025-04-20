import * as sdk from "@defillama/sdk";
import { getLatestBlock } from "@defillama/sdk/build/util";
import { getPriceDataByProtocolId } from "../utils/prices";
import { CollateralPricesAndRates, CollateralPricesAndRatesEntry } from "../utils/types";

const protocolId = parseInt(process.argv[2], 10);
const chain = process.argv[3];

const runPrices = async () => {
  const fetchPriceDataFn = await getPriceDataByProtocolId(protocolId);
  const blockNumber = (await getLatestBlock(chain)).number;
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

  console.dir(formattedPriceData, { depth: null });
};

(async () => {
  await runPrices();
})();
