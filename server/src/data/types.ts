import { Chain } from "@defillama/sdk/build/general";

export type Protocol = {
  id: number;
  displayName: string;
  protocolDbName: string;
  iconLink: string;
  chains: string[];
  token?: string;
  symbol?: string;
  url?: string;
  twitter?: string;
};
