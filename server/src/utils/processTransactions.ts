import { ChainApi } from "@defillama/sdk";
import { ethers } from "ethers";
import { Chain } from "@defillama/sdk/build/general";
import { EventParams, PartialEventParams } from "./adapter.type";
import { EventData } from "./types";
import { PromisePool } from "@supercharge/promise-pool";
import retry from "async-retry";
import { ErrorLoggerService } from "../utils/bunyan";
import { withTimeout } from "./async";

export const getEvmEventLogs = async (
  eventName: string,
  fromBlock: number,
  toBlock: number,
  api: ChainApi,
  paramsArray: (EventParams | PartialEventParams)[]
) => {
  const logger = ErrorLoggerService.getInstance();
  let eventData = [] as EventData[];

  await PromisePool.for(paramsArray).process(async (params) => {
    let {
      target,
      topic,
      abi,
      logKeys,
      argKeys,
      txKeys,
      topics,
      fixedEventData,
      inputDataExtraction,
      selectIndexesFromArrays,
      functionSignatureFilter,
      filter,
      mapTokens,
    } = params;

    if (!logKeys) {
      logKeys = {
        blockNumber: "blockNumber",
        txHash: "transactionHash",
      };
      if (!(topic && abi)) {
        throw new Error(`event ${eventName} on chain ${api.chain} with target ${target} is missing param(s).`);
      }

      let logs = [] as any[];

      await retry(
        async (bail) => {
          try {
            logs = await withTimeout(
              api.getLogs({
                target: target!,
                topic: topic,
                keys: [],
                fromBlock: fromBlock,
                toBlock: toBlock,
                topics: topics as string[],
              }),
              { milliseconds: 30000, message: `getLogs timeout for ${eventName} on chain ${api.chain}` }
            );
            if (logs.length === 0) {
              console.info(
                `No logs received for event ${eventName} on chain ${api.chain} from ${fromBlock} to ${toBlock} with topic ${topic}.`
              );
            }
          } catch (e: any) {
            console.error(target, e);
            bail(e);
          }
        },
        {
          retries: 4,
          maxTimeout: 10000,
        }
      );

      let data: {
        [key: number]: { blockNumber?: number; txHash?: string; logIndex?: number; log?: { [key: string]: any } };
      } = {};
      let dataKeysToFilter = [] as any[];
      const iface = new ethers.Interface([abi]);

      await PromisePool.for(logs)
        .withConcurrency(20)
        .process(async (txLog, i) => {
          data[i] = data[i] || {};
          data[i].blockNumber = txLog.blockNumber;
          data[i].txHash = txLog.transactionHash;
          data[i].logIndex = txLog.logIndex;

          let parsedLog = {} as any;
          try {
            parsedLog = iface.parseLog({
              topics: txLog.topics,
              data: txLog.data,
            });
          } catch (e) {
            console.error(
              `WARNING: Unable to parse log for event ${eventName} on chain ${api.chain}, SKIPPING TX with hash ${txLog.transactionHash}`
            );
            dataKeysToFilter.push(i);
            return;
          }

          if (argKeys) {
            try {
              const args = parsedLog?.args;
              if (args === undefined || args.length === 0) {
                throw new Error(
                  `Unable to get log args for event ${eventName} on chain ${api.chain} with arg keys ${argKeys}.`
                );
              }
              Object.entries(argKeys).map(([eventKey, argKey]) => {
                let value = args[argKey];
                if (typeof value === "bigint") {
                  value = value.toString();
                }

                data[i]["log"] = data[i]["log"] || {};
                data[i]["log"][eventKey] = value;
              });
              if (filter?.includeArg) {
                let toFilter = true;
                const includeArgArray = filter.includeArg;
                includeArgArray.map((argMappingToInclude) => {
                  const argKeyToInclude = Object.keys(argMappingToInclude)[0];
                  const argValueToInclude = Object.values(argMappingToInclude)[0];
                  if (args[argKeyToInclude] === argValueToInclude) {
                    toFilter = false;
                  }
                });
                if (toFilter) dataKeysToFilter.push(i);
              }
              if (filter?.excludeArg) {
                let toFilter = false;
                const excludeArgArray = filter.excludeArg;
                excludeArgArray.map((argMappingToExclude) => {
                  const argKeyToExclude = Object.keys(argMappingToExclude)[0];
                  const argValueToExclude = Object.values(argMappingToExclude)[0];
                  if (args[argKeyToExclude] === argValueToExclude) {
                    toFilter = true;
                  }
                });
                if (toFilter) dataKeysToFilter.push(i);
              }
            } catch (error) {
              const errString = `Unable to get log args for event ${eventName} on chain ${
                api.chain
              } with arg keys ${argKeys}. SKIPPING TX with hash ${txLog.transactionHash}: ${
                error instanceof Error ? error.message : String(error)
              }`;
              console.error(errString);
              logger.error({ error: errString, keyword: "missingValues", chain: api.chain });
              return;
            }
          }
          /*
            if (txKeys) {
              const tx = await provider.getTransaction(txLog.transactionHash);
              if (!tx) {
                console.error(
                  `WARNING: Unable to get transaction data for ${adapterName}, SKIPPING tx.`
                );
                dataKeysToFilter.push(i);
              } else {
                Object.entries(txKeys).map(([eventKey, logKey]) => {
                  const value = tx[logKey];
                  if (typeof value !== EventKeyTypes[eventKey]) {
                    throw new Error(
                      `Type of ${eventKey} retrieved using ${logKey} is ${typeof value} when it must be ${
                        EventKeyTypes[eventKey]
                      }.`);
                  }
                  data[i][eventKey] = value;
                });
              }
            }
            if (filter?.includeTxData) {
              const tx = await provider.getTransaction(txLog.transactionHash);
              if (!tx) {
                console.error(
                  `WARNING: Unable to get transaction data for ${adapterName}, SKIPPING tx.`
                );
                dataKeysToFilter.push(i);
              } else {
                let toFilter = true;
                const includeTxDataArray = filter.includeTxData;
                includeTxDataArray.map((txMappingToInclude) => {
                  const txKeyToInclude = Object.keys(txMappingToInclude)[0];
                  const txValueToInclude = Object.values(txMappingToInclude)[0];
                  if (
                    tx[txKeyToInclude] === txValueToInclude ||
                    tx[txKeyToInclude]?.toLowerCase() === txValueToInclude
                  ) {
                    toFilter = false;
                  }
                });
                if (toFilter) dataKeysToFilter.push(i);
              }
            }
            if (functionSignatureFilter) {
              const tx = await provider.getTransaction(txLog.transactionHash);
              if (!tx) {
                console.error(
                  `WARNING: Unable to get transaction data for ${adapterName}, SKIPPING tx.`
                );
                dataKeysToFilter.push(i);
                return;
              } else {
                const signature = tx.data.slice(0, 8);
                if (
                  functionSignatureFilter.includeSignatures &&
                  !functionSignatureFilter.includeSignatures.includes(signature)
                ) {
                  console.info(
                    `Tx did not have input data matching given filter for ${adapterName}, SKIPPING tx.`
                  );
                  dataKeysToFilter.push(i);
                  return;
                }
                if (
                  functionSignatureFilter.excludeSignatures &&
                  functionSignatureFilter.excludeSignatures.includes(signature)
                ) {
                  console.info(
                    `Tx did not have input data matching given filter for ${adapterName}, SKIPPING tx.`
                  );
                  dataKeysToFilter.push(i);
                  return;
                }
              }
            }
            if (inputDataExtraction) {
              const tx = await provider.getTransaction(txLog.transactionHash);
              try {
                let inputData = [];
                if (inputDataExtraction.useDefaultAbiEncoder) {
                  inputData = ethers.utils.defaultAbiCoder.decode(
                    inputDataExtraction.inputDataABI,
                    ethers.utils.hexDataSlice(tx.data, 4)
                  );
                } else {
                  const iface = new ethers.utils.Interface(
                    inputDataExtraction.inputDataABI
                  );
                  inputData = iface.decodeFunctionData(
                    inputDataExtraction.inputDataFnName || "",
                    tx.data
                  );
                }
                Object.entries(inputDataExtraction.inputDataKeys).map(
                  ([eventKey, inputDataKey]) => {
                    let value = "";
                    if (inputDataExtraction?.useDefaultAbiEncoder) {
                      value = inputData[parseInt(inputDataKey)];
                    } else {
                      value = inputData[inputDataKey];
                    }
                    if (typeof value !== EventKeyTypes[eventKey]) {
                      throw new Error(
                        `Type of ${eventKey} retrieved using ${inputDataKey} with inputDataExtraction is ${typeof value} when it must be ${
                          EventKeyTypes[eventKey]
                        }.`);
                    }
                    data[i][eventKey] = value;
                  }
                );
              } catch (e) {
                console.error(
                  `Unable to extract Input Data. Check this transaction: ${txLog.transactionHash}`
                );
                dataKeysToFilter.push(i);
                return;
              }
            }
            if (selectIndexesFromArrays) {
              Object.entries(selectIndexesFromArrays).map(
                ([eventKey, value]) => {
                  if (!Array.isArray(data[i][eventKey])) {
                    throw new Error(
                      `${eventKey} is not an array, but it has been specified as being one in 'selectIndexesFromArrays' in adapter.`
                    );
                  }
                  const extractedValue = data[i][eventKey][parseInt(value)];
                  data[i][eventKey] = extractedValue;
                }
              );
            }
            if (mapTokens) {
              const map = mapTokens;
              const token = data[i].token;
              if (token && map[token]) {
                data[i].token = map[token];
              }
            }
            if (fixedEventData) {
              Object.entries(fixedEventData).map(([eventKey, value]) => {
                if (typeof value !== EventKeyTypes[eventKey]) {
                  throw new Error(
                    `Type of ${eventKey} in fixedEventData is ${typeof value} when it must be ${
                      EventKeyTypes[eventKey]
                    }.`);
                }
                data[i][eventKey] = value;
              });
            }
            */
        });

      dataKeysToFilter.map((key) => {
        delete data[key];
      });

      Object.values(data).map((event) => {
        const eventEntry: EventData = {
          txHash: String(event.txHash || ""),
          blockNumber: Number(event.blockNumber || 0),
          chain: String(api.chain || ""),
          eventName: String(eventName || ""),
          logIndex: Number(event.logIndex || 0),
          operation: null,
          eventData: event.log || {},
        };
        eventData.push(eventEntry);
      });

      /*        
        const filteredData = eventData.filter((log) => {
          let toFilter = false;
          toFilter =
            toFilter ||
            (filter?.excludeFrom?.includes(log.from) ?? false) ||
            (filter?.excludeTo?.includes(log.to) ?? false) ||
            (filter?.excludeToken?.includes(log.token) ?? false);
          toFilter =
            toFilter ||
            !(filter?.includeFrom?.includes(log.from) ?? true) ||
            !(filter?.includeTo?.includes(log.to) ?? true) ||
            !(filter?.includeToken?.includes(log.token) ?? true);
          return !toFilter;
        });
        accEventData = [...accEventData, ...filteredData];
        */
    }
  });

  return eventData;
};

/*
export const getTxDataFromHashAndToken = async (
  chain: Chain,
  hashData: { hash: string; token: string; isDeposit: boolean }[]
) => {
  const provider = getProvider(chain) as any;
  const transactions = (
    await Promise.all(
      hashData.map(async (data) => {
        const { hash, token, isDeposit } = data;
        // TODO: add timeout
        const tx = await provider.getTransaction(hash);
        const logs = (await provider.getTransactionReceipt(hash)).logs;
        if (!tx || !logs) {
          console.error(`WARNING: Unable to get transaction data on chain ${chain}, SKIPPING tx.`);
          return;
        }
        const { blockNumber, from, to } = tx;
        let totalAmount = ethers.toBigInt(0);
        logs
          .filter((log: any) => log.address === token)
          .map((log: any) => {
            const { data } = log;
            totalAmount = totalAmount + data; // FIX: Ethers v6 changes BigInt logic, no idea if this works
          });
        const ethersBnAmount = totalAmount as unknown;
        return {
          blockNumber: blockNumber,
          txHash: hash,
          from: from,
          to: to,
          token: token,
          amount: ethersBnAmount,
          isDeposit: isDeposit,
        } as EventData;
      })
    )
  ).filter((tx) => tx) as EventData[];
  return transactions;
};

export const makeTxHashesUnique = (eventData: EventData[]) => {
  let hashCounts = {} as { [hash: string]: number };
  return eventData.map((event) => {
    const hash = event.txHash;
    const hashCount = hashCounts[hash] ?? 0;
    if (hashCount > 0) {
      hashCounts[hash] = (hashCounts[hash] ?? 0) + 1;
      const newHash = `${hash}#duplicate${hashCount}`;
      return { ...event, txHash: newHash };
    }
    hashCounts[hash] = (hashCounts[hash] ?? 0) + 1;
    return event;
  });
};
*/
