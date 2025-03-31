import { wrapScheduledLambda } from "../utils/wrap";
import { fillHourlyTroveDataSummary } from "../db/write";
import protocolData from "../data/protocolData";
import { getTroveManagersForProtocol } from "../db/read";
import { ErrorLoggerService } from "../utils/bunyan";

const handler = async (_event: any) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const currentDate = new Date();
  const currentHourUTC = currentDate.getUTCHours();
  const isStartOfDay = currentHourUTC >= 0 && currentHourUTC < 1;
  const logger = ErrorLoggerService.getInstance();

  for (const protocol of protocolData) {
    const protocolId = protocol.id;

    for (const chain of protocol.chains) {
      try {
        const troveManagers = await getTroveManagersForProtocol(protocolId, chain);

        if (!troveManagers || troveManagers.length === 0) {
          console.log(`No trove managers found for protocol ${protocolId} on chain ${chain}`);
          continue;
        }

        for (const troveMgr of troveManagers) {
          const troveManagerIndex = troveMgr.troveManagerIndex;

          try {
            console.log(
              `Filling hourly trove data summary for protocol ${protocolId}, chain ${chain}, trove manager ${troveManagerIndex}`
            );
            await fillHourlyTroveDataSummary(protocolId, chain, troveManagerIndex, currentTimestamp, true);

            if (isStartOfDay) {
              console.log(
                `Filling daily trove data summary for protocol ${protocolId}, chain ${chain}, trove manager ${troveManagerIndex}`
              );
              await fillHourlyTroveDataSummary(protocolId, chain, troveManagerIndex, currentTimestamp, false);
            }
          } catch (error) {
            const errString = `Error filling trove data summary for protocol ${protocolId}, chain ${chain}, trove manager ${troveManagerIndex}: ${error}`;
            console.error(errString);
            logger.error({
              error: errString,
              keyword: "missingValues",
              function: "fillTroveDataSummaries",
              chain,
              protocolId,
            });
            // Continue with the next trove manager even if this one fails
            continue;
          }
        }
      } catch (error) {
        const errString = `Error processing protocol ${protocolId} on chain ${chain}: ${error}`;
        console.error(errString);
        logger.error({
          error: errString,
          keyword: "missingValues",
          function: "fillTroveDataSummaries",
          chain,
          protocolId,
        });
        // Continue with the next chain even if this one fails
        continue;
      }
    }
  }

  console.log("Completed filling trove data summaries");
};

export default wrapScheduledLambda(handler);
