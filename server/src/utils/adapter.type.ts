import { Chain } from "@defillama/sdk/build/general";
import { ChainApi } from "@defillama/sdk";
import { TroveDataByManager, EventData, CoreImmutables, CorePoolData } from "./types";

export type Adapter = {
  fetchTroves?: { [chain: string]: (api: ChainApi) => Promise<TroveDataByManager[]> };
  fetchTroveOperations?: {
    [chain: string]: (fromBlock: number, toBlock: number, api: ChainApi) => Promise<EventData[]>;
  };
  fetchCorePoolData?: { [chain: string]: (api: ChainApi) => Promise<CorePoolData> };
  fetchImmutables?: { [chain: string]: (api: ChainApi) => Promise<CoreImmutables> };
};

export type EventLogFilter = {
  includeToken?: string[];
  includeFrom?: string[];
  includeTo?: string[];
  excludeToken?: string[];
  excludeFrom?: string[];
  excludeTo?: string[];
  includeArg?: { [key: string]: string }[];
  excludeArg?: { [key: string]: string }[];
  includeTxData?: { [key: string]: string }[];
};

export type FunctionSignatureFilter = {
  includeSignatures?: string[]; // require initial 8 characters of input data be one of those supplied in array (this is incorrect, should be changed to be 10 characters)
  excludeSignatures?: string[];
};

type InputDataExtraction = {
  inputDataABI: string[];
  inputDataFnName?: string;
  inputDataKeys: { [keyName: string]: string };
  useDefaultAbiEncoder?: boolean;
};

// FIX the {[keyName:string]: string}'s, either check they are correct when fetching or inserting into db
export type EventParams = {
  target: string | null;
  topic: string;
  abi: string;
  logKeys?: { [keyName: string]: string }; // retrieve data from event log
  argKeys?: { [keyName: string]: string }; // retrieve data from parsed event log
  txKeys?: { [keyName: string]: string }; // retrieve data from transaction referenced in event log
  topics?: (string | null)[];
  chain?: Chain; // override chain given as parameter in getTxDataFromEVMEventLogs
  isTransfer?: boolean;
  fixedEventData?: { [keyName: string]: string }; // hard-code any final values
  inputDataExtraction?: InputDataExtraction; // retrieve data from event log's input data field
  selectIndexesFromArrays?: { [keyName: string]: string }; // extract data returned as an array by specifying the index of element
  functionSignatureFilter?: FunctionSignatureFilter;
  filter?: EventLogFilter;
  mapTokens?: { [token: string]: string }; // can expand to map other keys if needed
  getTokenFromReceipt?: {
    token: boolean;
    amount?: boolean;
    native?: string; // if provided native token address, will return amount of native token transferred if there are no ercs transferred
  }; // attempt to get the token transferred from the tx receipt data, only use if only 1 token is transferred per tx
};

export type PartialEventParams = {
  target: string | null;
  topic?: string;
  abi?: string;
  logKeys?: { [keyName: string]: string };
  argKeys?: { [keyName: string]: string };
  txKeys?: { [keyName: string]: string };
  topics?: (string | null)[];
  chain?: Chain;
  isTransfer?: boolean;
  fixedEventData?: { [keyName: string]: string };
  inputDataExtraction?: InputDataExtraction;
  selectIndexesFromArrays?: { [keyName: string]: string };
  functionSignatureFilter?: FunctionSignatureFilter;
  filter?: EventLogFilter;
  mapTokens?: { [token: string]: string };
  getTokenFromReceipt?: {
    token: boolean;
    amount?: boolean;
    native?: string;
  };
};
