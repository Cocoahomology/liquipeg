import { fillTimeSamplePoints } from "../handlers/fillTimeSamplePoints";
import { fillMissingBlockTimestamps } from "../handlers/fillMissingBlockTimestamps";
import * as sdk from "@defillama/sdk";

const test = async () => {
  /*
  console.log("Testing fillMissingBlockTimestamps");
  await fillMissingBlockTimestamps();
  console.log("Successfully completed fillMissingBlockTimestamps");
  */

  const timestamp = 1742922083;

  console.log(`Testing fillTimeSamplePoints with timestamp: ${timestamp}`);
  console.log(`Date: ${new Date(timestamp * 1000).toISOString()}`);

  try {
    await fillTimeSamplePoints(timestamp, true);
    console.log("Successfully completed fillTimeSamplePoints");
  } catch (error) {
    console.error("Error executing fillTimeSamplePoints:");
    console.error(error);
  }
};

(async () => {
  await test();
})();
