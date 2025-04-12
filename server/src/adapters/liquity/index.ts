import { Adapter } from "../../utils/adapter.type";
import {
  getCorePoolDataByProtocolId,
  getImmutablesByColRegistry,
  getTrovesByColRegistry,
  getTroveOperationsByColRegistry,
} from "../helpers/liquity";
import liquityImmutablesAbi from "./liquityImmutablesAbi.json";
import liquidityCorePoolAbi from "./liquityCorePoolAbi.json";

const adapter: Adapter = {
  fetchTroves: { ethereum: getTrovesByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7") },
  fetchTroveOperations: { ethereum: getTroveOperationsByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7") },
  fetchImmutables: {
    ethereum: getImmutablesByColRegistry("0xd99dE73b95236F69A559117ECD6F519Af780F3f7", 1, liquityImmutablesAbi),
  },
  fetchCorePoolData: { ethereum: getCorePoolDataByProtocolId(1, liquidityCorePoolAbi) },
};

export default adapter;
