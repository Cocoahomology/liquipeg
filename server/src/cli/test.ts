import * as sdk from "@defillama/sdk";
import { getProvider } from "@defillama/sdk/build/general";
import adapters from "../adapters";
import { importProtocol } from "../data/importProtocol";
import { PromisePool } from "@supercharge/promise-pool";

if (process.argv.length < 4) {
  console.error(`Missing argument, you need to provide the exported name of adapter to test and how many blocks into the past to query.
        Eg: npx ts-node test liquity 250`);
  process.exit(1);
}

const adapterName = process.argv[2];

const testAdapter = async () => {
  console.log("starting test");
  const adapter = adapters[adapterName];
  if (!adapter) {
    throw new Error(`Adapter for ${adapterName} not found, check it is exported correctly.`);
  }
  const protocol = importProtocol(adapterName);
  if (!protocol) {
    throw new Error(`No entry for protocol found in src/data/protocolData. Add an entry there before testing.`);
  }

  /*
  if (adapter.fetchTroves) {
    const fetchTrovesFns = adapter.fetchTroves;
    console.log("Fetching Troves");
    Object.entries(fetchTrovesFns).map(async ([chain, fetchTrovesFn]) => {
      try {
        const troves = await fetchTrovesFn(
          new sdk.ChainApi({
            chain: chain,
          })
        );
        console.log("Troves fetched successfully:");
        console.dir(troves, { depth: null });
      } catch (error) {
        console.error(`Error fetching troves for chain ${chain}:`, error);
      }
    });
  }
    */

  /*
  if (adapter.fetchTroveOperations) {
    console.log("Fetching Trove Operations");
    const fetchTroveOperationsFns = adapter.fetchTroveOperations;
    Object.entries(fetchTroveOperationsFns).map(async ([_chain, fetchTroveOperationsFn]) => {
      try {
        const troveOperations = await fetchTroveOperationsFn(
          21759245,
          21759786,
          new sdk.ChainApi({ chain: "ethereum" })
        );
        console.log("Trove operations fetched successfully:");
        console.log(troveOperations);
      } catch (error) {
        console.error(`Error fetching trove operations:`, error);
      }
    });
  }
    */

  if (adapter.fetchImmutables) {
    console.log("Fetching Immutables");
    const fetchImmutablesFns = adapter.fetchImmutables;
    Object.entries(fetchImmutablesFns).map(async ([chain, fetchImmutablesFn]) => {
      try {
        const immutables = await fetchImmutablesFn(
          new sdk.ChainApi({
            chain: chain,
          })
        );
        console.log("Immutables fetched successfully:");
        console.dir(immutables, { depth: null });
      } catch (error) {
        console.error(`Error fetching immutables for chain ${chain}:`, error);
      }
    });
  }

  /*
  if (adapter.fetchCorePoolData) {
    console.log("Fetching Core Pool Data");
    const fetchCorePoolDataFns = adapter.fetchCorePoolData;
    Object.entries(fetchCorePoolDataFns).map(async ([chain, fetchCorePoolFn]) => {
      try {
        const poolData = await fetchCorePoolFn(
          new sdk.ChainApi({
            chain: chain,
          })
        );
        console.log("Pool data fetched successfully:");
        console.dir(poolData, { depth: null });
      } catch (error) {
        console.error(`Error fetching core pool data for chain ${chain}:`, error);
      }
    });
  }
    */

  /*
  Object.entries(adapter).map(async ([chain, adapterChainEventsFn]) => {
    let uniqueTokens = {} as { [token: string]: boolean };
    let tokensForPricing = [] as any;
    const contractsChain = bridgeNetwork.chainMapping?.[chain as Chain]
      ? bridgeNetwork.chainMapping?.[chain as Chain]
      : chain;
    let { number, timestamp } = await getLatestBlock(contractsChain);
    if (!(number && timestamp)) {
      throw new Error(`Unable to get blocks for ${adapterName} adapter on chain ${contractsChain}.`);
    }
    const startBlock = number - parseInt(numberOfBlocks);
    console.log(`Getting event logs on chain ${contractsChain} from block ${startBlock} to ${number}.`);
    const eventLogs = await adapterChainEventsFn(startBlock, number);
    console.log(eventLogs);
    console.log(`${eventLogs.length} transactions found.`);
    const { results: eventPromises } = await PromisePool
      .for(eventLogs)
      .withTaskTimeout(9999)
      .process(async (log: any) => {
        ["txHash", "blockNumber", "from", "to", "token", "amount", "isDeposit"].map((key) => {
          if (key === "amount") {
            const amount = log.amount;
            if (!(amount && amount._isBigNumber)) {
              throw new Error(
                `Amount is missing, null, or wrong type in log. It is of type ${typeof amount} and should be of type BigNumber.`
              );
            }
          } else if (!(log[key] !== null && typeof log[key] === logTypes[key])) {
            throw new Error(
              `${key} is missing, null, or wrong type in log. It is of type ${typeof log[key]} and should be of type ${
                logTypes[key]
              }.`
            );
          }
        });
        const tokenKey = transformTokens[contractsChain]?.[log.token]
          ? transformTokens[contractsChain]?.[log.token]
          : `${contractsChain}:${log.token}`;
        uniqueTokens[tokenKey] = true;
      });
    await eventPromises;
    console.log(`Values for event logs have correct types on chain ${chain}.`);
    tokensForPricing = Object.keys(uniqueTokens);
    const llamaPrices = await getLlamaPrices(tokensForPricing, timestamp);
    console.log(
      `Over the past ${numberOfBlocks} blocks, ${tokensForPricing.length} unique tokens were transferred and ${
        Object.keys(llamaPrices).length
      } prices for them were found on ${chain}.`
    );
    for (const token of tokensForPricing) {
      if (!llamaPrices?.[token]) {
        console.log(`token ${token} is missing price.`);
      }
    }
  });
  */
};

testAdapter();
