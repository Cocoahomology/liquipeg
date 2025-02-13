import { Adapter } from "../utils/adapter.type";
import liquity from "./liquity";

export default {
  liquity,
} as {
  [protocol: string]: Adapter;
};
