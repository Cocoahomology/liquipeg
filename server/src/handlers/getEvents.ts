import { getEventsWithTimestamps } from "../db/read";

const operationsToFetch = [5, 6];

export async function getEvents(protocolPk: number, chain: string, troveManagerIndex?: number) {
  const events = await getEventsWithTimestamps(protocolPk, chain, operationsToFetch, undefined, troveManagerIndex);
  return events;
}
