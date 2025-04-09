// Dummy
export interface Protocol {
  id: string;
  name: string;
  address?: string | null;
  symbol?: string | null;
  assetToken?: string | null;
  url: string;
  description?: string | null;
  chain: string;
  logo: string | null;
  audits?: string | null;
  audit_note?: string | null;
  gecko_id?: string | null;
  cmcId?: string | null;
  category?: string | null;
  chains: Array<string>;
  oracles?: Array<string>;
  oraclesByChain?: Record<string, Array<string>>;
  forkedFrom?: Array<string>;
  module: string;
  twitter?: string | null;
  language?: string;
  audit_links?: Array<string>;
  listedAt?: number;
  openSource?: boolean;
  parentProtocol?: string;
  referralUrl?: string;
  isParentProtocol?: boolean;
  defillamaId?: number;
  treasury?: string;
  governanceID?: Array<string>;
  stablecoins?: Array<string>;
  deprecated?: boolean;
  github?: Array<string>;
}
