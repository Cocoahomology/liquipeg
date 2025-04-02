import { wrapScheduledLambda } from "../utils/wrap";
import protocols from "../data/protocolData";
import { Lambda, InvocationType, InvokeCommandOutput } from "@aws-sdk/client-lambda";

async function invokeLambda(functionName: string, event: any) {
  return new Promise((resolve, _reject) => {
    const lambda = new Lambda({ region: process.env.AWS_REGION || "ap-east-1" });

    interface LambdaParams {
      FunctionName: string;
      InvocationType: InvocationType;
      Payload: string;
    }

    const params: LambdaParams = {
      FunctionName: functionName,
      InvocationType: InvocationType.Event,
      Payload: JSON.stringify(event, null, 2), // pass params
    };

    lambda.invoke(params, (err: Error | null, data?: InvokeCommandOutput) => {
      console.log(err, data);
      resolve(data);
    });
  });
}

export default wrapScheduledLambda(async (_event) => {
  for (let i = 0; i < protocols.length; i++) {
    const protocol = protocols[i];
    for (let j = 0; j < protocol.chains.length; j++) {
      await invokeLambda(`liquipeg-server-prod-runPrices`, {
        protocolId: protocol.id,
        chain: protocol.chains[j],
      });
    }
  }
});
