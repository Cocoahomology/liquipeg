import { ChainApi } from "@defillama/sdk";
import { EventData, CoreImmutables, CoreColImmutables, CoreImmutablesEntry, ColPoolData } from "../../utils/types";
import { getEvmEventLogs } from "../../utils/processTransactions";
import liquityFormattedEventAbi from "../helpers/abis/formattedLiquityTroveManagerAbi.json";
import { getContractCreationDataEtherscan } from "../../utils/etherscan";
import * as protocolImmutables from "../testProtocolImmutables.json";

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
            troveId: BigInt(troveIds[index]),
            debt: BigInt(debt),
            coll: BigInt(coll),
            stake: BigInt(stake),
            status: Number(status),
            arrayIndex: Number(arrayIndex),
            lastDebtUpdateTime: BigInt(lastDebtUpdateTime),
            lastInterestRateAdjTime: BigInt(lastInterestRateAdjTime),
            annualInterestRate: BigInt(annualInterestRate),
            interestBatchManager: String(interestBatchManager),
            batchDebtShares: BigInt(batchDebtShares),
          };
        });
        return {
          getTroveManagerIndex: index, //FIX: check if it's correct
          troveData: formattedTroveData,
        };
      })
    );

    // console.log(troveDataByManagerList[0].troveData)

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
    let acc = [] as EventData[];
    await Promise.all(
      troveManagersList.map(async (target, index) => {
        await Promise.all(
          Object.entries(liquityFormattedEventAbi).map(async ([eventName, eventAbi]) => {
            const res = await getEvmEventLogs(eventName, fromBlock, toBlock, api, [
              {
                target: target,
                topic: eventAbi.topic,
                abi: eventAbi.abi,
                argKeys: eventAbi.keys,
              },
            ]);
            acc = [...acc, ...res.map((obj) => ({ ...obj, getTroveManagerIndex: index }))];
          })
        );
      })
    );

    // console.dir(acc, { depth: null });

    return acc;
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
    let coreCollateralImmutablesList = [] as CoreColImmutables;

    const addressesRegistryList = (
      await Promise.all(
        troveManagersList.map(async (troveManager, index) => {
          const retryCount = 3;
          for (let i = 0; i < retryCount; i++) {
            try {
              const creationData = await getContractCreationDataEtherscan(api.chain, troveManager);
              const creationBytecode = creationData.creationBytecode;
              if (!creationBytecode) {
                throw new Error(`No creation bytecode returned for trove manager ${troveManager}.`);
              }

              const addressesRegistry = "0x" + creationBytecode.slice(-40);
              return { address: addressesRegistry, index };
            } catch (error) {
              if (i === retryCount - 1) {
                // FIX: log error
                missingAddressesRegistryIndexes.push(index);
                return null;
              }
            }
          }
        })
      )
    ).filter((item): item is { address: string; index: number } => item !== null);

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
        .then((res) => res.map((item) => BigInt(item))),
      api
        .multiCall({ abi: "uint256:SCR", calls: addressesRegistryList.map((item) => item.address) })
        .then((res) => res.map((item) => BigInt(item))),
      api
        .multiCall({ abi: "uint256:MCR", calls: addressesRegistryList.map((item) => item.address) })
        .then((res) => res.map((item) => BigInt(item))),
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

    addressesRegistryList.forEach((item, idx) => {
      coreCollateralImmutablesList[item.index] = {
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
      };
    });

    await Promise.all(
      missingAddressesRegistryIndexes.map(async (index) => {
        console.error(
          `Addresses registry for trove manager ${troveManagersList[index]} failed to fetch, using alternative calls.`
        );
        console.error(`Price feed for trove manager ${troveManagersList[index]} not found, setting it to empty.`);
        const priceFeed = "";
        const troveManager = troveManagersList[index];
        const activePool = activePoolsList[index];
        const borrowerOperationsAddress = (await api.call({
          abi: "address:borrowerOperationsAddress",
          target: activePool,
        })) as string;
        const [CCR, SCR, MCR, collToken, defaultPool, stabilityPool, interestRouter, sortedTroves, troveNFT] =
          await Promise.all([
            api.call({ abi: "uint256:CCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:SCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:MCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "address:collToken", target: activePool }),
            api.call({ abi: "address:defaultPoolAddress", target: activePool }),
            api.call({ abi: "address:stabilityPool", target: activePool }),
            api.call({ abi: "address:interestRouter", target: activePool }),
            api.call({ abi: "address:sortedTroves", target: troveManager }),
            api.call({ abi: "address:troveNFT", target: troveManager }),
          ]);
        accInterestRouterList.push(interestRouter);
        coreCollateralImmutablesList[index] = {
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
          priceFeed: priceFeed,
        };
      })
    );

    /*

    const coreColImmutablesPromises = Promise.all(
      troveManagersList.map(async (troveManager, index) => {
        let CCR,
          SCR,
          MCR,
          collToken,
          activePool,
          defaultPool,
          stabilityPool,
          borrowerOperationsAddress,
          sortedTroves,
          troveNFT,
          priceFeed;
        activePool = activePoolsList[index];
        defaultPool = defaultPoolsList[index];
        let addressesRegistry;
        try {
          const creationData = await getContractCreationDataEtherscan(api.chain, troveManager);
          const creationBytecode = creationData.creationBytecode;
          if (creationBytecode) {
            addressesRegistry = "0x" + creationBytecode.slice(-40);
            priceFeed = await api.call({
              abi: "address:priceFeed",
              target: addressesRegistry,
            });

            [
              borrowerOperationsAddress,
              CCR,
              SCR,
              MCR,
              collToken,
              stabilityPool,
              interestRouter,
              sortedTroves,
              troveNFT,
            ] = await Promise.all([
              api.call({
                abi: "address:borrowerOperationsAddress",
                target: activePool,
              }),
              api.call({ abi: "uint256:CCR", target: addressesRegistry }).then((res) => BigInt(res)),
              api.call({ abi: "uint256:SCR", target: addressesRegistry }).then((res) => BigInt(res)),
              api.call({ abi: "uint256:MCR", target: addressesRegistry }).then((res) => BigInt(res)),
              api.call({ abi: "address:collToken", target: addressesRegistry }),
              api.call({ abi: "address:stabilityPool", target: addressesRegistry }),
              api.call({ abi: "address:interestRouter", target: addressesRegistry }),
              api.call({ abi: "address:sortedTroves", target: addressesRegistry }),
              api.call({ abi: "address:troveNFT", target: addressesRegistry }),
            ]);
          } else {
            throw new Error("No creation bytecode returned for trove manager contract.");
          }
        } catch (error) {
          console.error(`Price feed for trove manager ${troveManager} not found, setting it to empty.`);
          priceFeed = "";
          console.error(
            `Addresses registry for trove manager ${troveManager} failed to fetch, using alternative calls.`
          );
          borrowerOperationsAddress = (await api.call({
            abi: "address:borrowerOperationsAddress",
            target: activePool,
          })) as string;
          [CCR, SCR, MCR, collToken, stabilityPool, interestRouter, sortedTroves, troveNFT] = await Promise.all([
            api.call({ abi: "uint256:CCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:SCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:MCR", target: borrowerOperationsAddress }).then((res) => BigInt(res)),
            api.call({ abi: "address:collToken", target: activePool }),
            api.call({ abi: "address:stabilityPool", target: activePool }),
            api.call({ abi: "address:interestRouter", target: activePool }),
            api.call({ abi: "address:sortedTroves", target: troveManager }),
            api.call({ abi: "address:troveNFT", target: troveManager }),
          ]);
        }
        coreCollateralImmutablesList[index] = {
          CCR: BigInt(CCR),
          SCR: BigInt(SCR),
          MCR: BigInt(MCR),
          troveManager: troveManager,
          collToken: collToken,
          activePool: activePool,
          defaultPool: defaultPool,
          stabilityPool: stabilityPool,
          borrowerOperationsAddress: borrowerOperationsAddress,
          sortedTroves: sortedTroves,
          troveNFT: troveNFT,
          priceFeed: priceFeed,
        };
      })
    );
    await coreColImmutablesPromises;
    */

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
    // FIX: Fetch this from db
    const fetchedProtocolImmutables = protocolImmutables as CoreImmutablesEntry;
    const immutableData = fetchedProtocolImmutables.immutableData as CoreImmutables;
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
        } collaterals stored when current number is ${totalCollaterals}. Only fetching pool data for first ${totalCollaterals} collaterals.`
      );
    }

    let collateralPoolData = [] as ColPoolData[];

    await Promise.all(
      Object.entries(immutableData.coreCollateralImmutables).map(
        async ([getTroveManagerIndex, collateralImmutables]) => {
          const { troveManager, activePool, stabilityPool } = collateralImmutables;
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
            api.call({ abi: "uint256:getEntireSystemColl", target: troveManager }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getEntireSystemDebt", target: troveManager }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getTroveIdsCount", target: troveManager }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:aggRecordedDebt", target: activePool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:calcPendingAggInterest", target: activePool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:calcPendingSPYield", target: activePool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:calcPendingAggInterest", target: activePool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:lastAggUpdateTime", target: activePool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getCollBalance", target: stabilityPool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getTotalBoldDeposits", target: stabilityPool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getYieldGainsOwed", target: stabilityPool }).then((res) => BigInt(res)),
            api.call({ abi: "uint256:getYieldGainsPending", target: stabilityPool }).then((res) => BigInt(res)),
          ]);
          collateralPoolData.push({
            getTroveManagerIndex: Number(getTroveManagerIndex),
            getEntireSystemColl: getEntireSystemColl,
            getEntireSystemDebt: getEntireSystemDebt,
            getTroveIdsCount: getTroveIdsCount,
            aggWeightedRecordedDebtSum: aggWeightedRecordedDebtSum,
            aggRecordedDebt: aggRecordedDebt,
            calcPendingAggInterest: calcPendingAggInterest,
            calcPendingSPYield: calcPendingSPYield,
            lastAggUpdateTime: lastAggUpdateTime,
            getCollBalance: getCollBalance,
            getTotalBoldDeposits: getTotalBoldDeposits,
            getYieldGainsOwed: getYieldGainsOwed,
            getYieldGainsPending: getYieldGainsPending,
          });
        }
      )
    );

    const res = {
      baseRate: BigInt(baseRate),
      getRedemptionRate: BigInt(getRedemptionRate),
      totalCollaterals: BigInt(totalCollaterals),
      collateralPoolData: collateralPoolData,
    };

    // console.dir(res, { depth: null });

    return res;
  };
}
