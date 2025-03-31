import { wrapScheduledLambda } from "../utils/wrap";
import { fillTimeSamplePoints } from "../db/write";

const handler = async (_event: any) => {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const currentDate = new Date();
  const currentHourUTC = currentDate.getUTCHours();
  const isStartOfDay = currentHourUTC >= 0 && currentHourUTC < 1;

  console.log(`Running hourly fillTimeSamplePoints at timestamp ${currentTimestamp}`);
  await fillTimeSamplePoints(currentTimestamp, true);

  if (isStartOfDay) {
    console.log(`Running daily fillTimeSamplePoints at timestamp ${currentTimestamp}`);
    await fillTimeSamplePoints(currentTimestamp, false);
  }

  console.log("Completed fillTimeSamplePoints");
};

export default wrapScheduledLambda(handler);
