import { capitalizeFirstLetter } from ".";

const blockExplorersTxs = {
  ethereum: ["https://etherscan.io/tx/", "Etherscan"],
  arbitrum: ["https://arbiscan.io/tx/", "Arbiscan"],
};

const blockExplorersAddresses = {
  ethereum: ["https://etherscan.io/address/", "Etherscan"],
  arbitrum: ["https://arbiscan.io/address/", "Arbiscan"],
};

export const getBlockExplorerForTx = (txHash: string = "") => {
  let blockExplorerLink, blockExplorerName;
  if (txHash?.includes(":")) {
    const [chain, chainHash] = txHash.split(":");
    const explorer = blockExplorersTxs[chain];
    if (explorer !== undefined) {
      blockExplorerLink = explorer[0] + chainHash;
      blockExplorerName = explorer[1];
    }
  } else {
    if (typeof txHash === "string" && txHash !== "") {
      blockExplorerLink = "https://etherscan.io/tx/" + txHash;
      blockExplorerName = "Etherscan";
    }
  }

  return {
    blockExplorerLink,
    blockExplorerName,
  };
};

export const getBlockExplorerForAddress = (txHash: string = "") => {
  let blockExplorerLink, blockExplorerName, chainName;
  if (txHash?.includes(":")) {
    const [chain, chainHash] = txHash.split(":");
    const explorer = blockExplorersAddresses[chain];
    if (explorer !== undefined) {
      blockExplorerLink = explorer[0] + chainHash;
      blockExplorerName = explorer[1];
    }
    chainName = chain
      ? chain
          .split("_")
          .map((x) => capitalizeFirstLetter(x))
          .join(" ")
      : "Ethereum";
  } else {
    if (typeof txHash === "string" && txHash !== "") {
      blockExplorerLink = "https://etherscan.io/address/" + txHash;
      blockExplorerName = "Etherscan";
      chainName = "Ethereum";
    }
  }

  return {
    blockExplorerLink,
    blockExplorerName,
    chainName,
  };
};
