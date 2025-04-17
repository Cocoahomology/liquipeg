"use client";
import { DashboardLayout } from "@/components/dashboard-layout";
import {
  useGetProtocolsOverviewData,
  formatProtocolDataForUI,
} from "@/app/api/protocols/client";
import { useState, useMemo, useEffect } from "react";
import { batchFetchWithRateLimit } from "~/utils/async";
import { topStablesByChain } from "~/constants";

// Interface for our formatted protocol data
interface FormattedProtocolData {
  id: string;
  name: string;
  chain: string;
  tvl: number;
  tvlChange1d: number | null;
  tvlChange7d: number | null;
  collateralRatio: number;
  collateralRatioChange1d: number | null;
  collateralRatioChange7d: number | null;
  stableDebt: number;
  stableDebtChange1d: number | null;
  stableDebtChange7d: number | null;
  spTvl: number;
  spTvlChange1d: number | null;
  spTvlChange7d: number | null;
  prev7DayProtocolRedemptionTotal: number; // New field for protocol level redemption total
  troveManagers: {
    // Change from array to Record/object type
    [troveManagerIndex: number]: {
      index: number;
      collToken: string | null;
      collateralSymbol: string;
      tvl: number;
      prevDayTvl: number | null;
      prev7DayTvl: number | null;
      tvlChange1d: number | null;
      tvlChange7d: number | null;
      collateralRatio: number;
      prevDayCollateralRatio: number | null;
      prev7DayCollateralRatio: number | null;
      collateralRatioChange1d: number | null;
      collateralRatioChange7d: number | null;
      ratioSettings: string;
      currentColUSDOracle: string | number;
      prevDayColUSDOracle: string | number | null;
      prev7DayColUSDOracle: string | number | null;
      colUSDOracleChange1d: number | null;
      colUSDOracleChange7d: number | null;
      avgIR?: string | number;
      minIR?: string | number;
      maxLiqPrice?: string | number;
      prev7DayRedemptionTotal: number; // Keeps the trove manager level field
    };
  };
  displayName: string;
  iconLink: string;
  url: string;
  chartData?: any;
  troveManagerChartData?: any; // New field for trove manager chart data
}

interface ProtocolsPageProps {
  changePeriod: "none" | "1d" | "7d" | "30d";
}

// Helper function to create Kyberswap API request objects
function createKyberswapRouteRequest(
  chain: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: number
) {
  const bigIntAmount = BigInt(Math.floor(amountIn));
  const amountInStr = bigIntAmount.toString();

  return {
    url: `https://aggregator-api.kyberswap.com/${chain}/api/v1/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountInStr}`,
    options: {
      headers: {
        "X-Client-Id": "liquipeg",
      },
    },
  };
}

export function ProtocolsPage({ changePeriod = "1d" }: ProtocolsPageProps) {
  const {
    data: protocolsData = [],
    isLoading,
    error,
  } = useGetProtocolsOverviewData();

  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(
    null
  );
  const [selectedTroveManagerIndex, setSelectedTroveManagerIndex] = useState<
    number | null
  >(null);

  // For tracking liquidity depth calculation status
  const [isCalculatingLiquidity, setIsCalculatingLiquidity] = useState(false);
  const [liquidityDepthData, setLiquidityDepthData] = useState<
    Record<string, any>
  >({});

  // Format protocol data for UI
  const formattedData = useMemo(() => {
    if (!protocolsData) return [];

    return formatProtocolDataForUI(protocolsData as any, selectedProtocolId);
  }, [protocolsData, selectedProtocolId]);

  // Auto-select the first protocol when data is loaded
  useEffect(() => {
    if (!selectedProtocolId && formattedData.length > 0) {
      const firstProtocol = formattedData[0];
      setSelectedProtocolId(firstProtocol.id);
    }
  }, [formattedData, selectedProtocolId]);

  // Calculate enhanced data with liquidity depth info
  useEffect(() => {
    if (!selectedProtocolId || !formattedData.length) return;

    // Set calculation status to true at the beginning
    setIsCalculatingLiquidity(true);

    // FIX: disabled for now so we don't spam
    /*
    // Run the calculation in an async function
    const calculateLiquidity = async () => {
      try {
        const result = await calculateLiquidityDepthData(
          formattedData,
          selectedProtocolId
        );
        setLiquidityDepthData((prev) => ({
          ...prev,
          [selectedProtocolId]: result,
        }));
      } catch (error) {
        console.error("Error calculating liquidity depth:", error);
      } finally {
        setIsCalculatingLiquidity(false);
      }
    };

    calculateLiquidity();
    */
  }, [formattedData, selectedProtocolId]);

  // Combine formatted data with liquidity depth data using useMemo
  const enhancedData = useMemo(() => {
    if (!selectedProtocolId || !formattedData.length) {
      return formattedData;
    }

    // If we have calculated liquidity data for this protocol, use it
    if (liquidityDepthData[selectedProtocolId]) {
      return liquidityDepthData[selectedProtocolId];
    }

    // Otherwise return the original data
    return formattedData;
  }, [formattedData, selectedProtocolId, liquidityDepthData]);

  // Get chart data for selected protocol or trove manager
  const selectedChartData = useMemo(() => {
    console.log("selectedProtocolId:", selectedProtocolId);
    console.log("selectedTroveManagerIndex:", selectedTroveManagerIndex);
    console.log("enhancedData length:", enhancedData?.length);
    console.log("ENHANCED DATA", enhancedData);

    if (!selectedProtocolId || !enhancedData?.length) {
      return {};
    }

    const selectedProtocol = enhancedData.find(
      (p) => p.id === selectedProtocolId
    );

    // If a trove manager index is selected and exists in the troveManagerChartData
    if (
      selectedTroveManagerIndex !== null &&
      selectedProtocol?.troveManagerChartData
    ) {
      const troveManagerData =
        selectedProtocol.troveManagerChartData[selectedTroveManagerIndex];
      if (troveManagerData) {
        return troveManagerData;
      } else {
      }
    }

    // Use protocol level data if no trove manager is selected or if trove manager data not found
    if (selectedProtocol?.chartData) {
      return selectedProtocol.chartData;
    } else {
      return {};
    }
  }, [selectedProtocolId, selectedTroveManagerIndex, enhancedData]);

  // Get liquidation events for display in the table chart
  const liquidationEventsToShow = useMemo(() => {
    if (!selectedProtocolId || !enhancedData?.length) {
      return [];
    }

    const selectedProtocol = enhancedData.find(
      (p) => p.id === selectedProtocolId
    );

    if (!selectedProtocol) return [];

    // If a trove manager is selected, show only its liquidation events
    if (selectedTroveManagerIndex !== null) {
      const selectedTroveManager = selectedProtocol.troveManagers.find(
        (tm) => tm.index === selectedTroveManagerIndex
      );

      if (!selectedTroveManager) return [];

      // Add the collateralSymbol to each event if it's missing
      return selectedTroveManager.liquidationEvents.map((event) => ({
        ...event,
        collateralSymbol: selectedTroveManager.collateralSymbol,
      }));
    }

    // Otherwise, show all liquidation events for the protocol
    return selectedProtocol.liquidationEvents || [];
  }, [selectedProtocolId, selectedTroveManagerIndex, enhancedData]);

  // Similar function for redemption events
  const redemptionEventsToShow = useMemo(() => {
    if (!selectedProtocolId || !enhancedData?.length) {
      return [];
    }

    const selectedProtocol = enhancedData.find(
      (p) => p.id === selectedProtocolId
    );

    if (!selectedProtocol) return [];

    // If a trove manager is selected, show only its redemption events
    if (selectedTroveManagerIndex !== null) {
      const selectedTroveManager = selectedProtocol.troveManagers.find(
        (tm) => tm.index === selectedTroveManagerIndex
      );

      if (!selectedTroveManager) return [];

      // Add the collateralSymbol to each event if it's missing
      return selectedTroveManager.redemptionEvents.map((event) => ({
        ...event,
        collateralSymbol: selectedTroveManager.collateralSymbol,
      }));
    }

    // Otherwise, show all redemption events for the protocol
    return selectedProtocol.redemptionEvents || [];
  }, [selectedProtocolId, selectedTroveManagerIndex, enhancedData]);

  // Handler for when a protocol is selected in the table
  const handleSelectItem = (item: any) => {
    setSelectedProtocolId(item.id);
    setSelectedTroveManagerIndex(item.index !== undefined ? item.index : null);
    console.log(
      `Selected protocol ID: ${item.id}, trove manager index: ${
        item.index !== undefined ? item.index : "none"
      }`
    );
  };

  async function calculateLiquidityDepthData(
    formattedData: FormattedProtocolData[],
    selectedProtocolId: string
  ) {
    // Create a copy of the formatted data to avoid mutating the original
    const enhancedData = JSON.parse(JSON.stringify(formattedData));

    // Find the selected protocol
    const selectedProtocol = enhancedData.find(
      (p) => p.id === selectedProtocolId
    );
    if (!selectedProtocol) return enhancedData;

    // Extract chain from the protocol ID
    const chain = selectedProtocol.chain;

    // Process each trove manager in the selected protocol
    for (const troveManager of selectedProtocol.troveManagers) {
      const troveManagerIndex = troveManager.index;
      const collToken = troveManager.collToken;
      const collSymbol = troveManager.collateralSymbol;

      if (!collToken) {
        console.warn(
          `No collateral token for trove manager ${troveManagerIndex}`
        );
        continue;
      }

      // Initialize chart data for this trove manager if it doesn't exist
      if (!selectedProtocol.troveManagerChartData) {
        selectedProtocol.troveManagerChartData = {};
      }

      if (!selectedProtocol.troveManagerChartData[troveManagerIndex]) {
        selectedProtocol.troveManagerChartData[troveManagerIndex] = {};
      }

      let bestTokenOut = null;
      let greatestAmountOutUsd = 0;
      const collAddress = collToken;

      const outTokens = topStablesByChain[chain];

      if (!outTokens || !outTokens.length) {
        console.warn(`No output tokens for chain ${chain}`);
        continue;
      }

      const initialQuoteRequests = outTokens
        .filter((outToken) => collAddress !== outToken)
        .map((outToken) =>
          createKyberswapRouteRequest(chain, collAddress, outToken, 1000000000)
        );

      try {
        // Use batchFetchWithRateLimit to fetch all quotes with rate limiting
        const initialQuotes = await batchFetchWithRateLimit(
          initialQuoteRequests,
          {
            batchSize: 2, // Process 2 requests in parallel
            requestGapMs: 500, // 500ms between requests in a batch
            batchGapMs: 1500, // 1.5s between batches
            maxRetries: 2, // Retry up to 2 times
            retryDelayMs: 1000, // Start with 1s delay for retries
            timeoutMs: 10000, // 10s timeout
            retryStatusCodes: [429, 408, 500, 502, 503, 504], // Standard retry codes
          }
        );

        // Process the quotes to find the best token
        let anyValueGreaterThanOne = false;

        initialQuotes.forEach((quote, index) => {
          if (
            !quote ||
            (quote as any).code !== 0 ||
            !(quote as any).data?.routeSummary?.amountOutUsd
          ) {
            return; // Skip invalid responses
          }

          const tokenOut = outTokens[index];
          const amountOutUsd = parseFloat(
            (quote as any).data.routeSummary.amountOutUsd
          );

          // Check if any value is greater than 1
          if (amountOutUsd > 1) {
            anyValueGreaterThanOne = true;
          }

          // Track which token has the greatest amountOutUsd
          if (amountOutUsd > greatestAmountOutUsd) {
            greatestAmountOutUsd = amountOutUsd;
            bestTokenOut = tokenOut;
          }
        });

        // If any value is greater than 1, don't return a best token
        if (anyValueGreaterThanOne) {
          bestTokenOut = null;
          greatestAmountOutUsd = 0;
        }

        // Calculate liquidity depth data for different amounts
        let depthTestAmounts: number[] = [];
        let depthSeries: { log: number; value: number }[] = [];

        if (greatestAmountOutUsd !== 0 && bestTokenOut) {
          // Create an array of multipliers for testing liquidity depth
          const multipliers = [
            100, 1000, 10000, 100000, 500000, 1000000, 5000000, 10000000,
            50000000,
          ];

          const baseAmount = Math.floor(1000000000 / greatestAmountOutUsd);

          // Generate the array of test amounts, ensuring they're all integers
          depthTestAmounts = multipliers.map((multiplier) => {
            // Make sure to convert to a full integer, not a float that could use scientific notation
            return Math.floor(multiplier * baseAmount);
          });

          const depthQuoteRequests = depthTestAmounts.map((amount) =>
            createKyberswapRouteRequest(
              chain,
              collAddress,
              bestTokenOut,
              amount // No need for Math.floor here since we already did it
            )
          );

          try {
            // Fetch depth quotes
            const depthQuotes = await batchFetchWithRateLimit(
              depthQuoteRequests,
              {
                batchSize: 2,
                requestGapMs: 500,
                batchGapMs: 1500,
                maxRetries: 2,
                retryDelayMs: 1000,
                timeoutMs: 10000,
                retryStatusCodes: [429, 408, 500, 502, 503, 504],
              }
            );

            // Process each response and pair with its multiplier
            depthSeries = depthQuotes
              .map((quote, index) => {
                if (
                  !quote ||
                  (quote as any).code !== 0 ||
                  !(quote as any).data?.routeSummary?.amountOutUsd ||
                  !(quote as any).data?.routeSummary?.amountInUsd
                ) {
                  return null; // Skip invalid responses
                }

                const multiplier = multipliers[index];
                const amountOutUsd = parseFloat(
                  (quote as any).data.routeSummary.amountOutUsd
                );
                const amountInUsd = parseFloat(
                  (quote as any).data.routeSummary.amountInUsd
                );

                // Calculate ratio of output to input
                const ratio = 1 - amountOutUsd / amountInUsd;

                return {
                  log: multiplier,
                  value: ratio,
                };
              })
              .filter(Boolean); // Remove null entries

            // Add an initial point at 1 with perfect ratio
            depthSeries.unshift({ log: 1, value: 0 });
          } catch (error) {
            console.error(
              `Error fetching depth quotes for ${collSymbol}:`,
              error
            );
          }
        }

        // Create a chart series with the liquidity depth data
        const liqDepthSeries = [
          {
            name: `${collSymbol} Liquidity Depth`,
            type: "line",
            data:
              depthSeries.length > 0
                ? depthSeries.map((point) => ({
                    log: point.log,
                    value: point.value,
                  }))
                : [],
            color: "#c084fc",
          },
        ];

        // Attach the chart series to the trove manager chart data
        selectedProtocol.troveManagerChartData[troveManagerIndex].liqDepthData =
          {
            title: `${collSymbol} Liquidity Depth`,
            series: liqDepthSeries,
            axisName: "Slippage (%)",
          };
      } catch (error) {
        console.error(
          `Error fetching liquidity depth for ${collSymbol}:`,
          error
        );
      }
    }

    console.log("ENHANCED DATA:", enhancedData);
    return enhancedData;
  }

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error loading protocols data</div>;
  }

  return (
    <div>
      <div className="mb-4"></div>
      <DashboardLayout
        data={enhancedData}
        customTitle="Analytics"
        changePeriod={changePeriod}
        onSelectItem={handleSelectItem}
        selectedItemChartData={selectedChartData}
        selectedTroveManagerIndex={selectedTroveManagerIndex}
        liquidationEvents={liquidationEventsToShow}
        redemptionEvents={redemptionEventsToShow}
      />
    </div>
  );
}
