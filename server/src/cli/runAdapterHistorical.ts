import { Chain } from "@defillama/sdk/build/general";
import { lookupBlock } from "@defillama/sdk/build/util";
import bridgeNetworkData from "../data/bridgeNetworkData";
import { wait } from "../utils/etherscan";
import { runAdapterHistorical } from "../utils/adapter";

async function fillAdapterHistorical(
  startTimestamp: number,
  endTimestamp: number,
  bridgeDbName: string,
  restrictChainTo?: string
) {
  const adapter = bridgeNetworkData.find((x) => x.bridgeDbName === bridgeDbName);
  if (!adapter) throw new Error("Invalid adapter");
  console.log(`Found ${bridgeDbName}`);
  const promises = Promise.all(
    adapter.chains.map(async (chain, i) => {
      let nChain;
      if (adapter.chainMapping && adapter.chainMapping[chain.toLowerCase()]) {
        nChain = adapter.chainMapping[chain.toLowerCase()];
      } else {
        nChain = chain.toLowerCase();
      }
      if (restrictChainTo && nChain !== restrictChainTo) return;
      console.log(`Running adapter for ${chain} for ${bridgeDbName}`);
      await wait(500 * i);
      const startBlock = await lookupBlock(startTimestamp, { chain: nChain as Chain });
      const endBlock = await lookupBlock(endTimestamp, { chain: nChain as Chain });
      await runAdapterHistorical(
        startBlock.block,
        endBlock.block,
        adapter.id,
        chain.toLowerCase(),
        true,
        false,
        "upsert"
      );
    })
  );
  await promises;
  console.log(`Finished running adapter from ${startTimestamp} to ${endTimestamp} for ${bridgeDbName}`);
}

fillAdapterHistorical(1661990400, 1681719878, "allbridge");
