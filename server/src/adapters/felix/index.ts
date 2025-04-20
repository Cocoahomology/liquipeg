import { Adapter } from "../../utils/adapter.type";
import {
  getTrovesByColRegistry,
  getTroveOperationsByColRegistry,
  getImmutablesByColRegistry,
  getCorePoolDataByProtocolId,
} from "../helpers/liquity";
import felixImmutablesAbi from "./felixImmutablesAbi.json";
import felixCorePoolAbi from "./felixCorePoolAbi.json";

const adapter: any = {
  fetchTroves: { hyperliquid: getTrovesByColRegistry("0x9De1e57049c475736289Cb006212F3E1DCe4711B") },
  fetchTroveOperations: { hyperliquid: getTroveOperationsByColRegistry("0x9De1e57049c475736289Cb006212F3E1DCe4711B") },
  fetchImmutables: {
    hyperliquid: getImmutablesByColRegistry("0x9De1e57049c475736289Cb006212F3E1DCe4711B", 2, felixImmutablesAbi, {
      "0": "0x7201fb5c3ba06f10a858819f62221ae2f473815d",
      "1": "0xfC4e20bd9F0e4F8782beA92a7bd8002367882407",
    }),
  },
  fetchCorePoolData: { hyperliquid: getCorePoolDataByProtocolId(2, felixCorePoolAbi) },
};

export default adapter;
