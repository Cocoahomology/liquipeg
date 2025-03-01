import * as sdk from "@defillama/sdk";
import { FunctionSignatureFilter } from "./adapter.type";
import { fetchWithRetry } from "./async";
const axios = require("axios");

const endpoints = {
  ethereum: "https://api.etherscan.io",
  polygon: "https://api.polygonscan.com",
  bsc: "https://api.bscscan.com",
  avax: "https://api.snowtrace.io",
  fantom: "https://api.ftmscan.com",
  arbitrum: "https://api.arbiscan.io",
  optimism: "https://api-optimistic.etherscan.io",
  aurora: "https://explorer.mainnet.aurora.dev/api",
  celo: "https://api.celoscan.io",
} as { [chain: string]: string };

const v2Endpoint = "https://api.etherscan.io/v2";

const apiKeys = ["GMUY628AIY9PY7RSUHIV5VVE2UGRPFE297"];

export const getTxsBlockRangeEtherscan = async (
  chain: string,
  address: string,
  startBlock: number,
  endBlock: number,
  functionSignatureFilter?: FunctionSignatureFilter
) => {
  const endpoint = endpoints[chain];
  const apiKey = apiKeys[0];
  let res;
  if (chain === "aurora") {
    res = (
      await axios.get(
        `${endpoint}?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlock}`
      )
    ).data as any;
  } else {
    res = (
      await axios.get(
        `${endpoint}/api?module=account&action=txlist&address=${address}&startblock=${startBlock}&endblock=${endBlock}&apikey=${apiKey}`
      )
    ).data as any;
  }
  if (res.message === "OK") {
    const filteredResults = res.result.filter((tx: any) => {
      if (functionSignatureFilter) {
        const signature = tx.input.slice(0, 8);
        if (
          functionSignatureFilter.includeSignatures &&
          !functionSignatureFilter.includeSignatures.includes(signature)
        ) {
          console.info(`Tx did not have input data matching given filter for address ${address}, SKIPPING tx.`);
          return false;
        }
        if (
          functionSignatureFilter.excludeSignatures &&
          functionSignatureFilter.excludeSignatures.includes(signature)
        ) {
          console.info(`Tx did not have input data matching given filter for address ${address}, SKIPPING tx.`);
          return false;
        }
      }
      return true;
    });
    return filteredResults;
  } else if (res.message === "No transactions found") {
    console.info(`No Etherscan txs found for address ${address}.`);
    return [];
  }
  console.log(res);
  console.error(`WARNING: Etherscan did not return valid response for address ${address}.`);
  return [];
};

export const getContractCreationDataEtherscan = async (
  chain: string,
  address: string,
  retries?: number,
  timeout?: number
) => {
  const apiKey = apiKeys[0];
  const chainId = new sdk.ChainApi({ chain: chain }).chainId;
  try {
    return (
      await fetchWithRetry(
        `${v2Endpoint}/api?chainid=${chainId}&module=contract&action=getcontractcreation&contractaddresses=${address}&apikey=${apiKey}`,
        retries ?? 1,
        timeout ?? 100000
      )
    ).result[0] as any;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `ERROR: Failed to fetch creation data for contract ${address} on chain ${chain}. ${error.message}`
      );
    } else {
      throw new Error(`ERROR: Failed to fetch creation data for contract ${address} on chain ${chain}, unknown error.`);
    }
  }
};

const etherscanDelay = 500; // in milliseconds

export const etherscanWait = () =>
  new Promise((resolve, _reject) => {
    setTimeout(() => {
      resolve("");
    }, etherscanDelay);
  });

export const wait = (ms: number) =>
  new Promise((resolve, _reject) => {
    setTimeout(() => {
      resolve("");
    }, ms);
  });

const locks = [] as ((value: unknown) => void)[];
export function getLock() {
  return new Promise((resolve) => {
    locks.push(resolve);
  });
}
function releaseLock() {
  const firstLock = locks.shift();
  if (firstLock !== undefined) {
    firstLock(null);
  }
}
function setTimer(timeBetweenTicks: number) {
  const timer = setInterval(() => {
    releaseLock();
  }, timeBetweenTicks);
  return timer;
}
setTimer(500); // Rate limit is 5 calls/s for etherscan's API
