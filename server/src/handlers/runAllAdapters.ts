import { wrapScheduledLambda } from "../utils/wrap";
import protocols from "../data/protocolData";
import aws from "aws-sdk";

async function invokeLambda(functionName: string, event: any) {
  return new Promise((resolve, _reject) => {
    new aws.Lambda().invoke(
      {
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: JSON.stringify(event, null, 2), // pass params
      },
      function (error, data) {
        console.log(error, data);
        resolve(data);
      }
    );
  });
}

export default wrapScheduledLambda(async (_event) => {
  for (let i = 0; i < protocols.length; i++) {
    await invokeLambda(`liquipeg-server-prod-runAdapter`, {
      protocolIndex: i,
    });
  }
});
