import { ChainApi } from "@defillama/sdk";
import { EventData, CoreColImmutables, ColPoolData } from "../../utils/types";
import { getEvmEventLogs } from "../../utils/processTransactions";
import liquityFormattedEventAbi from "../helpers/abis/formattedLiquityTroveManagerAbi.json";
import { getContractCreationDataEtherscan } from "../../utils/etherscan";
import { getLatestCoreImmutables } from "../../db/read";
import { PromisePool } from "@supercharge/promise-pool";
import { getCollateralConfig } from "./collateralConfig";

const abi = {
  Troves:
    "function Troves(uint256) view returns (uint256 debt, uint256 coll, uint256 stake, uint8 status, uint64 arrayIndex, uint64 lastDebtUpdateTime, uint64 lastInterestRateAdjTime, uint256 annualInterestRate, address interestBatchManager, uint256 batchDebtShares)",
  getTroveFromTroveIdsArray: "function getTroveFromTroveIdsArray(uint256 _index) view returns (uint256)",
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
          return {
            troveId: String(troveIds[index]),
            debt: String(debt),
            coll: String(coll),
            stake: String(stake),
            status: Number(status),
            arrayIndex: Number(arrayIndex),
            lastDebtUpdateTime: String(lastDebtUpdateTime),
            lastInterestRateAdjTime: String(lastInterestRateAdjTime),
            annualInterestRate: String(annualInterestRate),
            interestBatchManager: String(interestBatchManager),
            batchDebtShares: String(batchDebtShares),
          };
        });
        return {
          getTroveManagerIndex: index,
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
        results.push(...res.map((obj) => ({ ...obj, getTroveManagerIndex: index })));
      }
    });

    return results;
  };
}

export function getImmutablesByColRegistry(colRegistryAddress: string) {
  return async (api: ChainApi) => {
    const boldToken = (await api.call({
      abi: "address:boldToken",
      target: colRegistryAddress,
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
            const creationData = await getContractCreationDataEtherscan(api.chain, troveManager, 2);
            const creationBytecode = creationData.creationBytecode;
            if (!creationBytecode) {
              throw new Error(`No creation bytecode returned for trove manager ${troveManager}.`);
            }
            const addressesRegistry = "0x" + creationBytecode.slice(-40);
            return { address: addressesRegistry, index };
          } catch (error) {
            missingAddressesRegistryIndexes.push(index);
            console.error(error);
            return null;
          }
        })
      )
    )
      .filter(
        (result): result is PromiseFulfilledResult<{ address: string; index: number } | null> =>
          result.status === "fulfilled"
      )
      .map((result) => result.value)
      .filter((item): item is { address: string; index: number } => item !== null);

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

    accInterestRouterList = [...interestRouterList];

    const rateProviderAddressList = await Promise.all(
      priceFeedList.map(async (priceFeed) => {
        try {
          return await api.call({
            abi: "address:rateProviderAddress",
            target: priceFeed,
          });
        } catch {
          return null;
        }
      })
    );

    addressesRegistryList.forEach((item, idx) => {
      const collateralConfig = getCollateralConfig(`${colRegistryAddress}-${api.chain}`, item.index);
      coreCollateralImmutablesList.push({
        getTroveManagerIndex: item.index,
        CCR: CCRList[idx],
        SCR: SCRList[idx],
        MCR: MCRList[idx],
        troveManager: troveManagersList[item.index],
        collToken: collTokenList[idx],
        activePool: activePoolsList[item.index],
        defaultPool: defaultPoolsList[idx],
        stabilityPool: stabilityPoolList[idx],
        borrowerOperationsAddress: borrowerOperationsAddressList[idx],
        sortedTroves: sortedTrovesList[idx],
        troveNFT: troveNFTList[idx],
        priceFeed: priceFeedList[idx],
        isLST: rateProviderAddressList[idx] !== null,
        rateProviderAddress: rateProviderAddressList[idx],
        LSTunderlying: collateralConfig.LSTunderlying,
        deviationThreshold: collateralConfig.deviationThreshold,
        oracleType: collateralConfig.oracleType,
      });
    });

    await Promise.all(
      missingAddressesRegistryIndexes.map(async (index) => {
        console.error(
          `Addresses registry for trove manager ${troveManagersList[index]} failed to fetch, using alternative calls.`
        );
        console.error(
          `Price feed for trove manager ${troveManagersList[index]} not found, setting it and all related values to null.`
        );
        const troveManager = troveManagersList[index];
        const activePool = activePoolsList[index];
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
        coreCollateralImmutablesList.push({
          getTroveManagerIndex: index,
          CCR: CCR,
          SCR: SCR,
          MCR: MCR,
          troveManager: troveManager,
          collToken: collToken,
          activePool: activePool,
          defaultPool: defaultPool,
          stabilityPool: stabilityPool,
          borrowerOperationsAddress: borrowerOperationsAddress,
          sortedTroves: sortedTroves,
          troveNFT: troveNFT,
          priceFeed: null,
          isLST: null,
          rateProviderAddress: null,
          LSTunderlying: null,
          deviationThreshold: null,
          oracleType: null,
        });
      })
    );

    return {
      boldToken: boldToken,
      collateralRegistry: colRegistryAddress,
      interestRouter: accInterestRouterList[0],
      coreCollateralImmutables: coreCollateralImmutablesList,
    };
  };
}

export function getCorePoolDataById(projectId: string) {
  return async (api: ChainApi) => {
    const immutableData = await getLatestCoreImmutables(Number(projectId), api.chain);
    if (!immutableData) {
      throw new Error(`No immutable data found for project with Id ${projectId}.`);
    }

    const { collateralRegistry } = immutableData;
    const [baseRate, getRedemptionRate, totalCollaterals] = await Promise.all([
      api.call({ abi: "uint256:baseRate", target: collateralRegistry }),
      api.call({ abi: "uint256:getRedemptionRate", target: collateralRegistry }),
      api.call({ abi: "uint256:totalCollaterals", target: collateralRegistry }).then((res) => Number(res)),
    ]);

    if (Object.keys(immutableData.coreCollateralImmutables).length !== totalCollaterals) {
      console.error(
        `project Id ${projectId} immutables has ${
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
      getCollBalance,
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
        getTroveManagerIndex: i,
        getEntireSystemColl: getEntireSystemColl[i],
        getEntireSystemDebt: getEntireSystemDebt[i],
        getTroveIdsCount: getTroveIdsCount[i],
        aggWeightedRecordedDebtSum: aggWeightedRecordedDebtSum[i],
        aggRecordedDebt: aggRecordedDebt[i],
        calcPendingAggInterest: calcPendingAggInterest[i],
        calcPendingSPYield: calcPendingSPYield[i],
        lastAggUpdateTime: lastAggUpdateTime[i],
        getCollBalance: getCollBalance[i],
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
