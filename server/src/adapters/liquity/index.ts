import { Adapter } from "../../utils/adapter.type";
import {
  getTrovesByColRegistry,
  getTroveOperationsByColRegistry,
  getImmutablesByColRegistry,
  getCorePoolDataByProtocolId,
} from "../helpers/liquity";

const adapter: Adapter = {
  fetchTroves: { ethereum: getTrovesByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7") },
  fetchTroveOperations: { ethereum: getTroveOperationsByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7") },
  fetchImmutables: { ethereum: getImmutablesByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7", 1) },
  fetchCorePoolData: { ethereum: getCorePoolDataByProtocolId(1) },
};

export default adapter;
