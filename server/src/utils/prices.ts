import { getLatestCoreImmutables } from "../db/read";
import { type ChainApi } from "@defillama/sdk";
import BigNumber from "bignumber.js";
import { getContractCreationDataEtherscan } from "./etherscan";
import { CoreImmutables, CollateralPricesAndRates } from "./types";
import { OracleAddress, OraclePurpose, OracleCreationCode, CollateralConfig } from "../collateralConfig";
import { getCollateralConfig } from "../collateralConfig";
import { ErrorLoggerService } from "./bunyan";
import { evaluateArithmeticExpression } from "./arithmeticExpressionEvaluator";

BigNumber.config({ DECIMAL_PLACES: 18, ROUNDING_MODE: BigNumber.ROUND_DOWN });

function extractConstructorArgs(bytecode: string) {
  // Each argument is 64 characters (32 bytes) long
  const argLength = 64;
  const args = [];

  // Skip any potential function/contract bytecode and get only the arguments portion
  const argsData = bytecode.slice(-384); // 6 arguments * 64 characters each

  // Extract each argument
  for (let i = 0; i < 6; i++) {
    const start = i * argLength;
    const arg = argsData.slice(start, start + argLength);
    args.push(arg);
  }

  return {
    0: "0x" + args[0].slice(24), // owner
    1: "0x" + args[1].slice(24), // oracle, varies for what
    2: "0x" + args[2].slice(24), // oracle, varies for what
    3: "0x" + args[3].slice(24), // col token
  };
}

async function getOracleAddressFromCreationData(
  chain: string,
  priceFeed: string | null,
  creationCodeMapping:
    | {
        [key in OraclePurpose]?: OracleCreationCode;
      }
    | null,
  creationCodeMappingKey: OraclePurpose
): Promise<OracleAddress | null> {
  try {
    if (!creationCodeMapping?.[creationCodeMappingKey] || !priceFeed) return null;
    const creationData = await getContractCreationDataEtherscan(chain, priceFeed, 2);
    if (!creationData.creationBytecode) {
      return null;
    }
    const [argNumber, oracleType] = creationCodeMapping[creationCodeMappingKey];
    return { address: extractConstructorArgs(creationData.creationBytecode)[argNumber], oracleType };
  } catch (error) {
    const logger = ErrorLoggerService.getInstance();
    logger.error({
      error: `Failed to get oracle address from creation data for priceFeed ${priceFeed}: ${error}`,
      keyword: "critical",
      chain: chain,
      function: "getOracleAddressFromCreationData",
    });
    return null;
  }
}

function adjustByDecimals(value: string, decimals: string | number): string {
  return new BigNumber(value).div(new BigNumber(10).pow(decimals)).toFixed(18);
}

async function getChainlinkPrice(api: ChainApi, oracleAddress: string): Promise<string | null> {
  try {
    const [latestAnswer, decimals] = (await Promise.all([
      api.call({ abi: "int256:latestAnswer", target: oracleAddress }),
      api.call({ abi: "uint8:decimals", target: oracleAddress }),
    ])) as [string, string];
    return adjustByDecimals(latestAnswer, decimals);
  } catch (error) {
    const logger = ErrorLoggerService.getInstance();
    logger.error({
      error: `Failed to get Chainlink price from oracle ${oracleAddress}: ${error}`,
      keyword: "critical",
      chain: api.chain,
      function: "getChainlinkPrice",
    });
    return null;
  }
}

export const getPriceDataByProtocolId = async (protocolId: number) => {
  return async (api: ChainApi) => {
    console.log(`Getting price data for protocol with Id ${protocolId}`);
    const logger = ErrorLoggerService.getInstance();
    let coreImmutables = null as CoreImmutables | null;
    try {
      coreImmutables = await getLatestCoreImmutables(protocolId, api.chain);
      if (!coreImmutables) throw new Error("No core immutables found");
    } catch (error) {
      const errString = `Fetching latest core immutables for ${protocolId} on chain ${api.chain} failed, price data not fetched.`;
      logger.error({
        error: errString,
        keyword: "critical",
        table: "pricesAndRates",
        chain: api.chain,
        protocolId: protocolId,
        function: "getPriceDataByProtocolId",
      });
      console.error(errString);
      return;
    }

    const coreColImmutables = coreImmutables.coreCollateralImmutables;
    let priceData = [] as CollateralPricesAndRates[];

    await Promise.allSettled(
      coreColImmutables.map(async (colImmutables) => {
        const { troveManagerIndex, priceFeed } = colImmutables;
        let collateralConfig = null as CollateralConfig | null;
        try {
          collateralConfig = getCollateralConfig(protocolId, api.chain, troveManagerIndex);
          if (!collateralConfig) throw new Error("No collateral config found");
        } catch (error) {
          const errString = `No collateral config found for id ${protocolId}, chain ${api.chain}, troveManagerIndex ${troveManagerIndex} check it has been added to collateralConfig.ts.`;
          logger.error({
            error: errString,
            keyword: "critical",
            table: "pricesAndRates",
            chain: api.chain,
            protocolId: protocolId,
            function: "getPriceDataByProtocolId",
          });
          console.error(errString);
          return;
        }

        const {
          isLST,
          rateProviderAddress,
          priceFeedType,
          priceFeedLastGoodPriceDecimals,
          deviationFormula,
          colUSDOracle,
          underlyingUSDOracle,
          LSTUnderlyingMarketRateOracle,
          creationCodeMapping,
          LSTUnderlyingCanonicalRateAbi,
          redemptionRelatedOracles,
        } = collateralConfig;

        const entry: CollateralPricesAndRates = {
          troveManagerIndex,
          colUSDPriceFeed: null,
          colUSDOracle: null,
          LSTUnderlyingCanonicalRate: null,
          LSTUnderlyingMarketRate: null,
          underlyingUSDOracle: null,
          deviation: null,
        };

        if (priceFeedType === "mainnet" || priceFeedType === "composite") {
          const colUSDOracleAddress =
            colUSDOracle ??
            (await getOracleAddressFromCreationData(api.chain, priceFeed, creationCodeMapping ?? null, "colUSDOracle"));

          if (colUSDOracleAddress) {
            if (colUSDOracleAddress.oracleType === "chainlink") {
              const price = await getChainlinkPrice(api, colUSDOracleAddress.address);
              if (price) {
                entry.colUSDOracle = price;
              }
            }
          }

          if (priceFeed && priceFeedLastGoodPriceDecimals) {
            try {
              const lastGoodPrice = (await api.call({
                abi: "uint256:lastGoodPrice",
                target: priceFeed,
              })) as string;

              entry.colUSDPriceFeed = adjustByDecimals(lastGoodPrice, priceFeedLastGoodPriceDecimals);
            } catch (error) {
              const errString = `Failed to get last good price for priceFeed ${priceFeed}: ${error}`;
              logger.error({
                error: errString,
                keyword: "missingValues",
                chain: api.chain,
                protocolId: protocolId,
                function: "getPriceDataByProtocolId",
              });
              console.error(errString);
            }
          }

          if (isLST) {
            let rateProvider = rateProviderAddress;
            if (!rateProvider && priceFeed) {
              try {
                rateProvider = (await api.call({
                  abi: "address:rateProviderAddress",
                  target: priceFeed,
                })) as string;
              } catch (error) {
                const errString = `Failed to get rate provider address from priceFeed ${priceFeed}: ${error}`;
                logger.error({
                  error: errString,
                  keyword: "missingValues",
                  chain: api.chain,
                  protocolId: protocolId,
                  function: "getPriceDataByProtocolId",
                });
                console.error(errString);
              }
            }

            if (rateProvider && LSTUnderlyingCanonicalRateAbi) {
              try {
                const [LSTUnderlyingCanonicalRate, decimals] = (await Promise.all([
                  api.call({ abi: LSTUnderlyingCanonicalRateAbi, target: rateProvider }),
                  api.call({ abi: "uint8:decimals", target: rateProvider }),
                ])) as [string, string];
                entry.LSTUnderlyingCanonicalRate = adjustByDecimals(LSTUnderlyingCanonicalRate, decimals);
              } catch (error) {
                const errString = `Failed to get LST underlying canonical rate for rateProvider ${rateProvider}: ${error}`;
                logger.error({
                  error: errString,
                  keyword: "missingValues",
                  chain: api.chain,
                  protocolId: protocolId,
                  function: "getPriceDataByProtocolId",
                });
                console.error(errString);
              }
            } else {
              const errString = `Failed to get LST underlying canonical rate for rateProvider ${rateProvider}.`;
              logger.error({
                error: errString,
                keyword: "missingValues",
                chain: api.chain,
                protocolId: protocolId,
                function: "getPriceDataByProtocolId",
              });
              console.error(errString);
            }

            const underlyingUSDOracleAddress =
              underlyingUSDOracle ??
              (await getOracleAddressFromCreationData(
                api.chain,
                priceFeed,
                creationCodeMapping ?? null,
                "underlyingUSDOracle"
              ));

            if (underlyingUSDOracleAddress) {
              if (underlyingUSDOracleAddress.oracleType === "chainlink") {
                const price = await getChainlinkPrice(api, underlyingUSDOracleAddress.address);
                if (price) {
                  entry.underlyingUSDOracle = price;
                }
              }
            } else {
              const errString = `No underlyingUSDOracle address found${
                priceFeed ? ` for price feed ${priceFeed}` : ""
              }`;
              logger.error({
                error: errString,
                keyword: "missingValues",
                chain: api.chain,
                protocolId: protocolId,
                function: "getPriceDataByProtocolId",
              });
              console.error(errString);
            }

            const LSTUnderlyingMarketRateOracleAddress =
              LSTUnderlyingMarketRateOracle ??
              (await getOracleAddressFromCreationData(
                api.chain,
                priceFeed,
                creationCodeMapping ?? null,
                "LSTUnderlyingMarketRateOracle"
              ));

            if (LSTUnderlyingMarketRateOracleAddress) {
              if (LSTUnderlyingMarketRateOracleAddress.oracleType === "chainlink") {
                const price = await getChainlinkPrice(api, LSTUnderlyingMarketRateOracleAddress.address);
                if (price) {
                  entry.LSTUnderlyingMarketRate = price;
                }
              }
            } else {
              // Do nothing, most won't have this
            }
          }
        }
        await Promise.allSettled(
          Object.entries(redemptionRelatedOracles ?? {}).map(async ([key, redemptionRelatedOracleAddress]) => {
            if (redemptionRelatedOracleAddress) {
              if (redemptionRelatedOracleAddress.oracleType === "chainlink") {
                const price = await getChainlinkPrice(api, redemptionRelatedOracleAddress.address);
                if (price) {
                  entry[`redemptionRelatedOracle${Number(key)}`] = price;
                }
              }
            }
          })
        );

        if (!entry.colUSDOracle && entry.LSTUnderlyingCanonicalRate && entry.underlyingUSDOracle) {
          entry.colUSDOracle = new BigNumber(entry.LSTUnderlyingCanonicalRate)
            .times(entry.underlyingUSDOracle)
            .toFixed(18);
        }

        // Ensure deviation calculation is done as final step
        if (deviationFormula) {
          try {
            entry.deviation = evaluateArithmeticExpression(deviationFormula, {
              ...entry,
              troveManagerIndex: String(entry.troveManagerIndex),
            });
          } catch (error) {
            const errString = `Error calculating deviation for troveManagerIndex ${troveManagerIndex}: ${error}`;
            logger.error({
              error: errString,
              keyword: "missingValues",
              chain: api.chain,
              protocolId: protocolId,
              function: "getPriceDataByProtocolId",
            });
            console.error(errString);
          }
        }

        const checkFields = {
          colUSDPriceFeed: entry.colUSDPriceFeed,
          colUSDOracle: entry.colUSDOracle,
        };

        Object.entries(checkFields).forEach(([field, value]) => {
          if (value === null) {
            const errString = `Missing value: ${field} is null for troveManagerIndex ${troveManagerIndex}`;
            logger.error({
              error: errString,
              keyword: "missingValues",
              chain: api.chain,
              protocolId: protocolId,
              function: "getPriceDataByProtocolId",
            });
            console.error(errString);
          }
        });

        priceData.push(entry);
      })
    );
    return priceData;
  };
};
