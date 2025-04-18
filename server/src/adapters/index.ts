import { Adapter } from "../utils/adapter.type";
import liquity from "./liquity";
import felix from "./felix";

export default {
  liquity,
  felix,
} as {
  [protocol: string]: Adapter;
};
