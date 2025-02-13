import protocols from "./protocolData";

export const importProtocol = (protocolDbName?: string, protocolId?: number) => {
  if (protocolDbName) {
    return protocols.filter((protocol) => protocol.protocolDbName === protocolDbName)[0];
  }
  if (protocolId) {
    return protocols.filter((protocol) => protocol.id === protocolId)[0];
  }
  return null;
};
