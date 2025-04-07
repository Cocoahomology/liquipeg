import { v4 as uuidv4 } from "uuid";

// Protocol types
export type Protocol = {
  id: string;
  name: string;
  category: string;
  chain: string; // Added chain field
  tvl: number;
  users: number;
  dailyVolume: number;
  weeklyChange: number;
  status: "active" | "inactive" | "pending";
  transactions: ProtocolTransaction[];
};

export type ProtocolTransaction = {
  id: string;
  date: string;
  amount: number;
  type: "deposit" | "withdrawal" | "transfer";
  status: "completed" | "pending" | "failed";
  reference: string;
  description: string;
  category: string;
};

// Yield types
export type Yield = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  marketCap: number;
  volume24h: number;
  change24h: number;
  status: "active" | "inactive" | "pending";
  transactions: YieldTransaction[];
};

export type YieldTransaction = {
  id: string;
  date: string;
  amount: number;
  type: "mint" | "burn" | "transfer";
  status: "completed" | "pending" | "failed";
  reference: string;
  description: string;
  category: string;
};

// Trove types
export type Trove = {
  id: string;
  owner: string;
  protocol: string;
  collateralType: string;
  collateralAmount: number;
  debtAmount: number;
  collateralRatio: number;
  liquidationPrice: number;
  status: "safe" | "warning" | "danger";
  transactions: TroveTransaction[];
};

export type TroveTransaction = {
  id: string;
  date: string;
  amount: number;
  type: "deposit" | "withdraw" | "borrow" | "repay";
  status: "completed" | "pending" | "failed";
  reference: string;
  description: string;
  category: string;
};

// Generate a random reference number
const generateReference = () => {
  return `REF-${Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0")}`;
};

// Generate random date within the last 3 months
const generateRandomDate = () => {
  const now = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(now.getMonth() - 3);

  const randomTimestamp =
    threeMonthsAgo.getTime() +
    Math.random() * (now.getTime() - threeMonthsAgo.getTime());
  const randomDate = new Date(randomTimestamp);

  return randomDate.toISOString().split("T")[0]; // YYYY-MM-DD format
};

// Protocol transaction descriptions by type
const protocolTransactionDescriptions = {
  deposit: [
    "Liquidity provision",
    "Staking deposit",
    "Yield farming entry",
    "LP token deposit",
    "Protocol investment",
  ],
  withdrawal: [
    "Liquidity removal",
    "Staking withdrawal",
    "Yield farming exit",
    "LP token withdrawal",
    "Protocol exit",
  ],
  transfer: [
    "Cross-chain bridge",
    "Protocol migration",
    "Governance transfer",
    "Reward distribution",
    "Fee payment",
  ],
};

// Protocol transaction categories
const protocolTransactionCategories = {
  deposit: ["Liquidity", "Staking", "Farming", "Investment", "Governance"],
  withdrawal: ["Liquidity", "Staking", "Farming", "Investment", "Governance"],
  transfer: ["Bridge", "Migration", "Governance", "Rewards", "Fees"],
};

// Yield transaction descriptions by type
const yieldTransactionDescriptions = {
  mint: [
    "New issuance",
    "Collateral backed mint",
    "Algorithmic expansion",
    "Redemption",
    "Rebalancing",
  ],
  burn: [
    "Token redemption",
    "Supply contraction",
    "Collateral release",
    "Algorithmic burn",
    "Fee burn",
  ],
  transfer: [
    "Exchange deposit",
    "Payment",
    "Cross-chain transfer",
    "Liquidity provision",
    "Yield farming",
  ],
};

// Yield transaction categories
const yieldTransactionCategories = {
  mint: ["Issuance", "Collateral", "Algorithmic", "Redemption", "Rebalance"],
  burn: ["Redemption", "Contraction", "Collateral", "Algorithmic", "Fees"],
  transfer: ["Exchange", "Payment", "Bridge", "Liquidity", "Farming"],
};

// Trove transaction descriptions by type
const troveTransactionDescriptions = {
  deposit: [
    "Collateral addition",
    "Safety buffer increase",
    "Liquidation protection",
    "Position strengthening",
    "Ratio improvement",
  ],
  withdraw: [
    "Collateral reduction",
    "Profit taking",
    "Position adjustment",
    "Partial exit",
    "Rebalancing",
  ],
  borrow: [
    "Debt increase",
    "Leverage addition",
    "New borrowing",
    "Position expansion",
    "Loan increase",
  ],
  repay: [
    "Debt reduction",
    "Loan repayment",
    "Leverage reduction",
    "Position de-risking",
    "Partial close",
  ],
};

// Trove transaction categories
const troveTransactionCategories = {
  deposit: ["Collateral", "Safety", "Protection", "Position", "Ratio"],
  withdraw: ["Reduction", "Profit", "Adjustment", "Exit", "Rebalance"],
  borrow: ["Debt", "Leverage", "Loan", "Expansion", "Increase"],
  repay: ["Reduction", "Repayment", "Deleveraging", "De-risk", "Close"],
};

// Generate random protocol transactions
const generateProtocolTransactions = (count: number): ProtocolTransaction[] => {
  const transactions: ProtocolTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const type = ["deposit", "withdrawal", "transfer"][
      Math.floor(Math.random() * 3)
    ] as "deposit" | "withdrawal" | "transfer";
    const status = ["completed", "pending", "failed"][
      Math.floor(Math.random() * 3)
    ] as "completed" | "pending" | "failed";
    const descriptionIndex = Math.floor(Math.random() * 5);
    const categoryIndex = Math.floor(Math.random() * 5);

    transactions.push({
      id: uuidv4(),
      date: generateRandomDate(),
      amount: Math.floor(Math.random() * 100000) / 100,
      type,
      status,
      reference: generateReference(),
      description: protocolTransactionDescriptions[type][descriptionIndex],
      category: protocolTransactionCategories[type][categoryIndex],
    });
  }

  return transactions;
};

// Generate random yield transactions
const generateYieldTransactions = (count: number): YieldTransaction[] => {
  const transactions: YieldTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const type = ["mint", "burn", "transfer"][Math.floor(Math.random() * 3)] as
      | "mint"
      | "burn"
      | "transfer";
    const status = ["completed", "pending", "failed"][
      Math.floor(Math.random() * 3)
    ] as "completed" | "pending" | "failed";
    const descriptionIndex = Math.floor(Math.random() * 5);
    const categoryIndex = Math.floor(Math.random() * 5);

    transactions.push({
      id: uuidv4(),
      date: generateRandomDate(),
      amount: Math.floor(Math.random() * 1000000) / 100,
      type,
      status,
      reference: generateReference(),
      description: yieldTransactionDescriptions[type][descriptionIndex],
      category: yieldTransactionCategories[type][categoryIndex],
    });
  }

  return transactions;
};

// Generate random trove transactions
const generateTroveTransactions = (count: number): TroveTransaction[] => {
  const transactions: TroveTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const type = ["deposit", "withdraw", "borrow", "repay"][
      Math.floor(Math.random() * 4)
    ] as "deposit" | "withdraw" | "borrow" | "repay";
    const status = ["completed", "pending", "failed"][
      Math.floor(Math.random() * 3)
    ] as "completed" | "pending" | "failed";
    const descriptionIndex = Math.floor(Math.random() * 5);
    const categoryIndex = Math.floor(Math.random() * 5);

    transactions.push({
      id: uuidv4(),
      date: generateRandomDate(),
      amount: Math.floor(Math.random() * 50000) / 100,
      type,
      status,
      reference: generateReference(),
      description: troveTransactionDescriptions[type][descriptionIndex],
      category: troveTransactionCategories[type][categoryIndex],
    });
  }

  return transactions;
};

// Generate protocols data
export const generateProtocolsData = (): Protocol[] => {
  const protocols: Protocol[] = [
    {
      id: "1",
      name: "Aave",
      category: "Lending",
      chain: "Ethereum", // Added chain value
      tvl: 5240000000,
      users: 324500,
      dailyVolume: 125000000,
      weeklyChange: 3.2,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "2",
      name: "Uniswap",
      category: "DEX",
      chain: "Ethereum", // Added chain value
      tvl: 7850000000,
      users: 892300,
      dailyVolume: 345000000,
      weeklyChange: -1.8,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "3",
      name: "Compound",
      category: "Lending",
      chain: "Ethereum", // Added chain value
      tvl: 3120000000,
      users: 187600,
      dailyVolume: 78000000,
      weeklyChange: 0.5,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "4",
      name: "Curve",
      category: "DEX",
      chain: "Ethereum", // Added chain value
      tvl: 4560000000,
      users: 156700,
      dailyVolume: 210000000,
      weeklyChange: 2.7,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "5",
      name: "MakerDAO",
      category: "Lending",
      chain: "Ethereum", // Added chain value
      tvl: 6780000000,
      users: 134200,
      dailyVolume: 95000000,
      weeklyChange: -0.8,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "6",
      name: "Synthetix",
      category: "Derivatives",
      chain: "Optimism", // Added chain value
      tvl: 1950000000,
      users: 87300,
      dailyVolume: 65000000,
      weeklyChange: 4.2,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
    {
      id: "7",
      name: "Balancer",
      category: "DEX",
      chain: "Polygon", // Added chain value
      tvl: 1230000000,
      users: 76500,
      dailyVolume: 42000000,
      weeklyChange: 1.3,
      status: "active",
      transactions: generateProtocolTransactions(5),
    },
  ];

  return protocols;
};

// Generate yields data
export const generateYieldsData = (): Yield[] => {
  const yields: Yield[] = [
    {
      id: "1",
      name: "USD Coin",
      symbol: "USDC",
      price: 1.0002,
      marketCap: 43500000000,
      volume24h: 2750000000,
      change24h: 0.02,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "2",
      name: "Tether",
      symbol: "USDT",
      price: 0.9998,
      marketCap: 83200000000,
      volume24h: 4850000000,
      change24h: -0.01,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "3",
      name: "Dai",
      symbol: "DAI",
      price: 1.0005,
      marketCap: 5600000000,
      volume24h: 420000000,
      change24h: 0.05,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "4",
      name: "Binance USD",
      symbol: "BUSD",
      price: 1.0001,
      marketCap: 16800000000,
      volume24h: 1250000000,
      change24h: 0.01,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "5",
      name: "TrueUSD",
      symbol: "TUSD",
      price: 0.9997,
      marketCap: 1200000000,
      volume24h: 85000000,
      change24h: -0.03,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "6",
      name: "Frax",
      symbol: "FRAX",
      price: 0.9999,
      marketCap: 1450000000,
      volume24h: 110000000,
      change24h: -0.01,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
    {
      id: "7",
      name: "Pax Dollar",
      symbol: "USDP",
      price: 1.0003,
      marketCap: 950000000,
      volume24h: 65000000,
      change24h: 0.03,
      status: "active",
      transactions: generateYieldTransactions(5),
    },
  ];

  return yields;
};

export function generateYieldsTableData() {
  return {
    headers: [
      { id: "name", label: "Name" },
      { id: "apr", label: "APR" },
      { id: "tvl", label: "TVL" },
      { id: "chain", label: "Chain" },
      { id: "protocol", label: "Protocol" },
    ],
    rows: [
      {
        id: "1",
        name: "ETH Staking",
        apr: "5.2%",
        tvl: "$14.2B",
        chain: "Ethereum",
        protocol: "Lido",
      },
      {
        id: "2",
        name: "BTC Yield",
        apr: "3.8%",
        tvl: "$5.7B",
        chain: "Bitcoin",
        protocol: "Babylon",
      },
      {
        id: "3",
        name: "USDC Lending",
        apr: "8.4%",
        tvl: "$2.1B",
        chain: "Solana",
        protocol: "Solend",
      },
      {
        id: "4",
        name: "MATIC Staking",
        apr: "6.7%",
        tvl: "$890M",
        chain: "Polygon",
        protocol: "Polygon PoS",
      },
      {
        id: "5",
        name: "DOT Parachain",
        apr: "12.3%",
        tvl: "$520M",
        chain: "Polkadot",
        protocol: "Acala",
      },
    ],
  };
}

// Generate troves data
export const generateTrovesData = (): Trove[] => {
  const troves: Trove[] = [
    {
      id: "1",
      owner: "0x7a16ff8270133f063aab6c9977183d9e72835428",
      protocol: "Liquity",
      collateralType: "ETH",
      collateralAmount: 125.5,
      debtAmount: 75000,
      collateralRatio: 210,
      liquidationPrice: 450,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "2",
      owner: "0x3d2e397f94e415d7bb993eb2e6b639de9c9dc72e",
      protocol: "Liquity",
      collateralType: "ETH",
      collateralAmount: 42.8,
      debtAmount: 32000,
      collateralRatio: 168,
      liquidationPrice: 560,
      status: "warning",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "3",
      owner: "0x9e5a52f57b4571c149e727a0de7d734c7895c76d",
      protocol: "MakerDAO",
      collateralType: "BTC",
      collateralAmount: 3.2,
      debtAmount: 45000,
      collateralRatio: 195,
      liquidationPrice: 9200,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "4",
      owner: "0x1f28ed9d5319c3c384d7775b83d14f3cc08a79c4",
      protocol: "Aave",
      collateralType: "ETH",
      collateralAmount: 18.5,
      debtAmount: 16500,
      collateralRatio: 140,
      liquidationPrice: 630,
      status: "danger",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "5",
      owner: "0x6a8c7f52b27e0906c9fb6d4b2f2b1a7c935d8ab5",
      protocol: "MakerDAO",
      collateralType: "BTC",
      collateralAmount: 1.8,
      debtAmount: 22000,
      collateralRatio: 225,
      liquidationPrice: 8100,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "6",
      owner: "0x4b3a0c6d668b43f3f07904e124328659b90bb4ca",
      protocol: "Aave",
      collateralType: "ETH",
      collateralAmount: 65.2,
      debtAmount: 52000,
      collateralRatio: 157,
      liquidationPrice: 530,
      status: "warning",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "7",
      owner: "0x2d7e7d45ba3d8e903b1911209e29ac6de68cae46",
      protocol: "MakerDAO",
      collateralType: "BTC",
      collateralAmount: 4.5,
      debtAmount: 68000,
      collateralRatio: 182,
      liquidationPrice: 9800,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "8",
      owner: "0x8f4e2b9a91e07e3f7b7c6c6e48b2e4e3f3f3f3f3",
      protocol: "Liquity",
      collateralType: "WBTC",
      collateralAmount: 2.3,
      debtAmount: 28000,
      collateralRatio: 225,
      liquidationPrice: 8050,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "9",
      owner: "0x9a2e4b8c5d6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b",
      protocol: "Aave",
      collateralType: "WBTC",
      collateralAmount: 1.5,
      debtAmount: 18000,
      collateralRatio: 230,
      liquidationPrice: 7900,
      status: "safe",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "10",
      owner: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      protocol: "MakerDAO",
      collateralType: "ETH",
      collateralAmount: 32.7,
      debtAmount: 25000,
      collateralRatio: 164,
      liquidationPrice: 510,
      status: "warning",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "11",
      owner: "0xb0a9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1",
      protocol: "Aave",
      collateralType: "USDC",
      collateralAmount: 50000,
      debtAmount: 35000,
      collateralRatio: 143,
      liquidationPrice: 0.7,
      status: "danger",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "12",
      owner: "0xc1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0",
      protocol: "MakerDAO",
      collateralType: "USDC",
      collateralAmount: 75000,
      debtAmount: 45000,
      collateralRatio: 167,
      liquidationPrice: 0.6,
      status: "warning",
      transactions: generateTroveTransactions(5),
    },
    {
      id: "13",
      owner: "0xd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0",
      protocol: "Liquity",
      collateralType: "USDC",
      collateralAmount: 100000,
      debtAmount: 65000,
      collateralRatio: 154,
      liquidationPrice: 0.65,
      status: "warning",
      transactions: generateTroveTransactions(5),
    },
  ];

  return troves;
};

// Add helper function to get unique protocols and collaterals
export const getUniqueProtocols = (troves: Trove[]): string[] => {
  return Array.from(new Set(troves.map((trove) => trove.protocol)));
};

export const getCollateralsByProtocol = (
  troves: Trove[],
  protocol: string
): string[] => {
  return Array.from(
    new Set(
      troves
        .filter((trove) => trove.protocol === protocol)
        .map((trove) => trove.collateralType)
    )
  );
};

// Generate monthly data for charts
export const generateMonthlyData = (
  dataType: "protocols" | "yields" | "troves"
) => {
  const months = 12;
  const result = [];
  const currentDate = new Date();

  for (let i = 0; i < months; i++) {
    const date = new Date(currentDate);
    date.setMonth(currentDate.getMonth() - (months - 1 - i));

    const data: any = {
      date: date.toISOString().slice(0, 7), // YYYY-MM format
    };

    if (dataType === "protocols") {
      data.deposits = Math.floor(Math.random() * 5000000) + 1000000;
      data.withdrawals = Math.floor(Math.random() * 3000000) + 500000;
      data.transfers = Math.floor(Math.random() * 2000000) + 300000;
    } else if (dataType === "yields") {
      data.mints = Math.floor(Math.random() * 8000000) + 2000000;
      data.burns = Math.floor(Math.random() * 6000000) + 1000000;
      data.transfers = Math.floor(Math.random() * 10000000) + 5000000;
    } else if (dataType === "troves") {
      data.deposits = Math.floor(Math.random() * 2000000) + 500000;
      data.withdrawals = Math.floor(Math.random() * 1500000) + 300000;
      data.borrows = Math.floor(Math.random() * 3000000) + 1000000;
      data.repayments = Math.floor(Math.random() * 2500000) + 800000;
    }

    result.push(data);
  }

  return result;
};
