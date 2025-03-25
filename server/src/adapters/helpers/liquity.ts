import { type ChainApi } from "@defillama/sdk";
import { EventData, CoreColImmutables, ColPoolData } from "../../utils/types";
import { getEvmEventLogs } from "../../utils/processTransactions";
import liquityFormattedEventAbi from "../helpers/abis/formattedLiquityTroveManagerAbi.json";
import { getContractCreationDataEtherscan } from "../../utils/etherscan";
import { getLatestCoreImmutables } from "../../db/read";
import { PromisePool } from "@supercharge/promise-pool";
import { getCollateralConfig, getProtocolConfig } from "../../collateralConfig";

const abi = {
  Troves:
    "function Troves(uint256) view returns (uint256 debt, uint256 coll, uint256 stake, uint8 status, uint64 arrayIndex, uint64 lastDebtUpdateTime, uint64 lastInterestRateAdjTime, uint256 annualInterestRate, address interestBatchManager, uint256 batchDebtShares)",
  getTroveFromTroveIdsArray: "function getTroveFromTroveIdsArray(uint256 _index) view returns (uint256)",
  getLatestTroveData:
    "function getLatestTroveData(uint256 _troveId) view returns (uint256 entireDebt, uint256 entireColl, uint256 redistBoldDebtGain, uint256 redistCollGain, uint256 accruedInterest, uint256 recordedDebt, uint256 annualInterestRate, uint256 weightedRecordedDebt, uint256 accruedBatchManagementFee, uint256 lastInterestRateAdjTime)",
};

export function getTrovesByColRegistry(colRegistryAddress: string) {
  return async (api: ChainApi) => {
    const troveManagersList = await api.fetchList({
      lengthAbi: "totalCollaterals",
      itemAbi: "getTroveManager",
      target: colRegistryAddress,
    });

    const troveCountList = await api.multiCall({
      abi: "uint256:getTroveIdsCount",
      calls: troveManagersList,
    });

    const troveIdsList = await Promise.all(
      troveCountList.map(async (troveCount, index) => {
        const troveCountArray = Array.from({ length: troveCount }, (_, index) => index);
        return await api.multiCall({
          abi: abi.getTroveFromTroveIdsArray,
          calls: troveCountArray.map((count) => {
            return { target: troveManagersList[index], params: count };
          }),
        });
      })
    );

    const troveDataByManagerList = await Promise.all(
      troveCountList.map(async (_troveCount, index) => {
        const troveIds = troveIdsList[index];
        const troveData = (await api.multiCall({
          abi: abi.Troves,
          calls: troveIds.map((troveId) => {
            return { target: troveManagersList[index], params: troveId };
          }),
        })) as { [prop: string]: number }[];
        const latestTroveData = (await api.multiCall({
          abi: abi.getLatestTroveData,
          calls: troveIds.map((troveId) => {
            return { target: troveManagersList[index], params: troveId };
          }),
        })) as { [prop: string]: number }[];
        const formattedTroveData = troveData.map((data, index) => {
          const {
            debt,
            coll,
            stake,
            status,
            arrayIndex,
            lastDebtUpdateTime,
            lastInterestRateAdjTime,
            annualInterestRate,
            interestBatchManager,
            batchDebtShares,
          } = data;
          const { entireDebt, accruedInterest } = latestTroveData[index];
          return {
            troveId: String(troveIds[index]),
            entireDebt: String(entireDebt),
            debt: String(debt),
            coll: String(coll),
            stake: String(stake),
            status: Number(status),
            arrayIndex: Number(arrayIndex),
            lastDebtUpdateTime: String(lastDebtUpdateTime),
            lastInterestRateAdjTime: String(lastInterestRateAdjTime),
            annualInterestRate: String(annualInterestRate),
            accruedInterest: String(accruedInterest),
            interestBatchManager: String(interestBatchManager),
            batchDebtShares: String(batchDebtShares),
          };
        });
        return {
          troveManagerIndex: index,
          troveData: formattedTroveData,
        };
      })
    );

    return troveDataByManagerList;
  };
}

export function getTroveOperationsByColRegistry(colRegistryAddress: string) {
  return async (fromBlock: number, toBlock: number, api: ChainApi) => {
    const troveManagersList = (await api.fetchList({
      lengthAbi: "totalCollaterals",
      itemAbi: "getTroveManager",
      target: colRegistryAddress,
    })) as string[];

    let results = [] as EventData[];
    await PromisePool.for(troveManagersList).process(async (target, index) => {
      for (const [eventName, eventAbi] of Object.entries(liquityFormattedEventAbi)) {
        const res = await getEvmEventLogs(eventName, fromBlock, toBlock, api, [
          {
            target: target,
            topic: eventAbi.topic,
            abi: eventAbi.abi,
            argKeys: eventAbi.keys,
          },
        ]);
        results.push(...res.map((obj) => ({ ...obj, troveManagerIndex: index })));
      }
    });

    return results;
  };
}

export function getImmutablesByColRegistry(colRegistryAddress: string, protocolId: number) {
  return async (api: ChainApi) => {
    const boldToken = (await api.call({
      abi: "address:boldToken",
      target: colRegistryAddress,
    })) as string;
    const boldTokenSymbol = (await api.call({
      abi: "string:symbol",
      target: boldToken,
    })) as string;
    const troveManagersList = (await api.fetchList({
      lengthAbi: "totalCollaterals",
      itemAbi: "getTroveManager",
      target: colRegistryAddress,
    })) as string[];

    const activePoolsList = await api.multiCall({
      abi: "address:activePool",
      calls: troveManagersList,
    });

    let accInterestRouterList = [] as string[];
    let missingAddressesRegistryIndexes = [] as number[];
    let coreCollateralImmutablesList = [] as CoreColImmutables[];

    const addressesRegistryList = (
      await Promise.allSettled(
        troveManagersList.map(async (troveManager, index) => {
          try {
            const creationData = await getContractCreationDataEtherscan(api.chain, troveManager, 2, 30000);
            const creationBytecode = creationData.creationBytecode;
            if (!creationBytecode) {
              throw new Error(`No creation bytecode returned for trove manager ${troveManager}.`);
            }
            const addressesRegistry = "0x" + creationBytecode.slice(-40);
            return { address: addressesRegistry, troveManagerIndex: index };
          } catch (error) {
            missingAddressesRegistryIndexes.push(index);
            console.error(error);
            return null;
          }
        })
      )
    )
      .filter(
        (result): result is PromiseFulfilledResult<{ address: string; troveManagerIndex: number } | null> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value)
      .filter((item): item is { address: string; troveManagerIndex: number } => item !== null);

    const [
      defaultPoolsList,
      CCRList,
      SCRList,
      MCRList,
      interestRouterList,
      collTokenList,
      stabilityPoolList,
      borrowerOperationsAddressList,
      sortedTrovesList,
      troveNFTList,
      priceFeedList,
    ] = await Promise.all([
      api.multiCall({ abi: "address:defaultPoolAddress", calls: activePoolsList }),
      api
        .multiCall({ abi: "uint256:CCR", calls: addressesRegistryList.map((item) => item.address) })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:SCR", calls: addressesRegistryList.map((item) => item.address) })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:MCR", calls: addressesRegistryList.map((item) => item.address) })
        .then((res) => res.map((item) => String(item))),
      api.multiCall({ abi: "address:interestRouter", calls: addressesRegistryList.map((item) => item.address) }),
      api.multiCall({ abi: "address:collToken", calls: addressesRegistryList.map((item) => item.address) }),
      api.multiCall({ abi: "address:stabilityPool", calls: addressesRegistryList.map((item) => item.address) }),
      api.multiCall({
        abi: "address:borrowerOperationsAddress",
        calls: activePoolsList,
      }),
      api.multiCall({ abi: "address:sortedTroves", calls: addressesRegistryList.map((item) => item.address) }),
      api.multiCall({ abi: "address:troveNFT", calls: addressesRegistryList.map((item) => item.address) }),
      api.multiCall({ abi: "address:priceFeed", calls: addressesRegistryList.map((item) => item.address) }),
    ]);

    const collTokenDecimalsList = await api
      .multiCall({ abi: "uint8:decimals", calls: collTokenList })
      .then((res) => res.map((item) => String(item)));

    const collTokenSymbolList = await api
      .multiCall({ abi: "string:symbol", calls: collTokenList })
      .then((res) => res.map((item) => String(item)));

    accInterestRouterList = [...interestRouterList];

    addressesRegistryList.forEach((item, idx) => {
      const troveManagerIndex = item.troveManagerIndex;
      const collateralConfig = getCollateralConfig(protocolId, api.chain, troveManagerIndex);
      // FIX: do some check to make sure given id is correct
      coreCollateralImmutablesList.push({
        troveManagerIndex: troveManagerIndex,
        CCR: CCRList[idx],
        SCR: SCRList[idx],
        MCR: MCRList[idx],
        troveManager: troveManagersList[troveManagerIndex],
        collToken: collTokenList[idx],
        collTokenSymbol: collTokenSymbolList[idx],
        collTokenDecimals: collTokenDecimalsList[idx],
        activePool: activePoolsList[troveManagerIndex],
        defaultPool: defaultPoolsList[idx],
        stabilityPool: stabilityPoolList[idx],
        borrowerOperationsAddress: borrowerOperationsAddressList[idx],
        sortedTroves: sortedTrovesList[idx],
        troveNFT: troveNFTList[idx],
        priceFeed: priceFeedList[idx],
        isLST: collateralConfig.isLST ?? null,
        LSTunderlying: collateralConfig.LSTunderlying ?? null,
        collAlternativeChainAddresses: collateralConfig.collAlternativeChainAddresses ?? null,
      });
    });

    await Promise.all(
      // FIX: test this again
      missingAddressesRegistryIndexes.map(async (index) => {
        const troveManagerIndex = index;
        const collateralConfig = getCollateralConfig(protocolId, api.chain, troveManagerIndex);
        console.error(
          `Addresses registry for trove manager ${troveManagersList[troveManagerIndex]} failed to fetch, using alternative calls.`
        );
        console.error(
          `Price feed for trove manager ${troveManagersList[troveManagerIndex]} not found, setting it to null.`
        );
        const troveManager = troveManagersList[troveManagerIndex];
        const activePool = activePoolsList[troveManagerIndex];
        const borrowerOperationsAddress = (await api.call({
          abi: "address:borrowerOperationsAddress",
          target: activePool,
        })) as string;
        const [CCR, SCR, MCR, collToken, defaultPool, stabilityPool, interestRouter, sortedTroves, troveNFT] =
          await Promise.all([
            api.call({ abi: "uint256:CCR", target: borrowerOperationsAddress }).then((res) => String(res)),
            api.call({ abi: "uint256:SCR", target: borrowerOperationsAddress }).then((res) => String(res)),
            api.call({ abi: "uint256:MCR", target: borrowerOperationsAddress }).then((res) => String(res)),
            api.call({ abi: "address:collToken", target: activePool }),
            api.call({ abi: "address:defaultPoolAddress", target: activePool }),
            api.call({ abi: "address:stabilityPool", target: activePool }),
            api.call({ abi: "address:interestRouter", target: activePool }),
            api.call({ abi: "address:sortedTroves", target: troveManager }),
            api.call({ abi: "address:troveNFT", target: troveManager }),
          ]);
        accInterestRouterList.push(interestRouter);
        const collTokenDecimals = String(await api.call({ abi: "uint8:decimals", target: collToken }));
        const collTokenSymbol = String(await api.call({ abi: "string:symbol", target: collToken }));
        coreCollateralImmutablesList.push({
          troveManagerIndex: troveManagerIndex,
          CCR: CCR,
          SCR: SCR,
          MCR: MCR,
          troveManager: troveManager,
          collToken: collToken,
          collTokenSymbol: collTokenSymbol,
          collTokenDecimals: collTokenDecimals,
          activePool: activePool,
          defaultPool: defaultPool,
          stabilityPool: stabilityPool,
          borrowerOperationsAddress: borrowerOperationsAddress,
          sortedTroves: sortedTroves,
          troveNFT: troveNFT,
          priceFeed: null,
          isLST: collateralConfig.isLST ?? null,
          LSTunderlying: collateralConfig.LSTunderlying ?? null,
          collAlternativeChainAddresses: collateralConfig.collAlternativeChainAddresses ?? null,
        });
      })
    );

    const protocolConfig = getProtocolConfig(protocolId, api.chain);

    return {
      boldToken: boldToken,
      boldTokenSymbol: boldTokenSymbol,
      nativeToken: protocolConfig.nativeToken ?? null,
      collateralRegistry: colRegistryAddress,
      interestRouter: accInterestRouterList[0],
      coreCollateralImmutables: coreCollateralImmutablesList,
    };
  };
}

export function getCorePoolDataByProtocolId(protocolId: number) {
  return async (api: ChainApi) => {
    const immutableData = await getLatestCoreImmutables(protocolId, api.chain);
    if (!immutableData) {
      throw new Error(`No immutable data found for project with Id ${protocolId}.`);
    }

    const { collateralRegistry } = immutableData;
    const [baseRate, getRedemptionRate, totalCollaterals] = await Promise.all([
      api.call({ abi: "uint256:baseRate", target: collateralRegistry }),
      api.call({ abi: "uint256:getRedemptionRate", target: collateralRegistry }),
      api.call({ abi: "uint256:totalCollaterals", target: collateralRegistry }).then((res) => Number(res)),
    ]);

    if (Object.keys(immutableData.coreCollateralImmutables).length !== totalCollaterals) {
      console.error(
        `project Id ${protocolId} immutables has ${
          Object.keys(immutableData.coreCollateralImmutables).length
        } collaterals stored when current number should be ${totalCollaterals}. Attempting to fetch pool data for first ${totalCollaterals} collaterals.`
      );
    }

    const coreCollateralImmutablesValues = immutableData.coreCollateralImmutables;

    const troveManagerList = coreCollateralImmutablesValues.map(
      (collateralImmutables) => collateralImmutables.troveManager
    );
    const activePoolList = coreCollateralImmutablesValues.map(
      (collateralImmutables) => collateralImmutables.activePool
    );
    const defaultPoolList = coreCollateralImmutablesValues.map(
      (collateralImmutables) => collateralImmutables.defaultPool
    );
    const stabilityPoolList = coreCollateralImmutablesValues.map(
      (collateralImmutables) => collateralImmutables.stabilityPool
    );

    const [
      getEntireSystemColl,
      getEntireSystemDebt,
      getTroveIdsCount,
      aggWeightedRecordedDebtSum,
      aggRecordedDebt,
      calcPendingAggInterest,
      calcPendingSPYield,
      lastAggUpdateTime,
      getCollBalanceActivePool,
      getCollBalanceDefaultPool,
      getCollBalanceStabilityPool,
      getTotalBoldDeposits,
      getYieldGainsOwed,
      getYieldGainsPending,
    ] = await Promise.all([
      api
        .multiCall({ abi: "uint256:getEntireSystemColl", calls: troveManagerList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getEntireSystemDebt", calls: troveManagerList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getTroveIdsCount", calls: troveManagerList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:aggRecordedDebt", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:calcPendingAggInterest", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:calcPendingSPYield", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:calcPendingAggInterest", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:lastAggUpdateTime", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getCollBalance", calls: activePoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getCollBalance", calls: defaultPoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getCollBalance", calls: stabilityPoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getTotalBoldDeposits", calls: stabilityPoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getYieldGainsOwed", calls: stabilityPoolList })
        .then((res) => res.map((item) => String(item))),
      api
        .multiCall({ abi: "uint256:getYieldGainsPending", calls: stabilityPoolList })
        .then((res) => res.map((item) => String(item))),
    ]);

    let collateralPoolData = [] as ColPoolData[];

    for (let i = 0; i < troveManagerList.length; i++) {
      collateralPoolData.push({
        troveManagerIndex: i,
        getEntireSystemColl: getEntireSystemColl[i],
        getEntireSystemDebt: getEntireSystemDebt[i],
        getTroveIdsCount: getTroveIdsCount[i],
        aggWeightedRecordedDebtSum: aggWeightedRecordedDebtSum[i],
        aggRecordedDebt: aggRecordedDebt[i],
        calcPendingAggInterest: calcPendingAggInterest[i],
        calcPendingSPYield: calcPendingSPYield[i],
        lastAggUpdateTime: lastAggUpdateTime[i],
        getCollBalanceActivePool: getCollBalanceActivePool[i],
        getCollBalanceDefaultPool: getCollBalanceDefaultPool[i],
        getCollBalanceStabilityPool: getCollBalanceStabilityPool[i],
        getTotalBoldDeposits: getTotalBoldDeposits[i],
        getYieldGainsOwed: getYieldGainsOwed[i],
        getYieldGainsPending: getYieldGainsPending[i],
      });
    }

    const res = {
      baseRate: String(baseRate),
      getRedemptionRate: String(getRedemptionRate),
      totalCollaterals: String(totalCollaterals),
      collateralPoolData: collateralPoolData,
    };

    return res;
  };
}
