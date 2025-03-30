import BigNumber from "bignumber.js";

type Operation = {
  precedence: number;
  execute: (a: BigNumber, b: BigNumber) => BigNumber;
};

const operations: Record<string, Operation> = {
  "*": { precedence: 2, execute: (a, b) => a.times(b) },
  "/": { precedence: 2, execute: (a, b) => a.div(b) },
  "+": { precedence: 1, execute: (a, b) => a.plus(b) },
  "-": { precedence: 1, execute: (a, b) => a.minus(b) },
};

export function evaluateArithmeticExpression(
  formula: string,
  variables: Record<string, string | null>
): BigNumber | null {
  const tokens = formula.match(/\d+(\.\d+)?|[+\-*/()]|\w+/g) || [];

  const outputQueue: (string | BigNumber)[] = [];
  const operatorStack: string[] = [];

  for (const token of tokens) {
    if (/^\d+(\.\d+)?$/.test(token)) {
      outputQueue.push(new BigNumber(token));
    } else if (/^\w+$/.test(token)) {
      if (!(token in variables)) {
        throw new Error(`Variable ${token} not found in data`);
      }
      const value = variables[token];
      if (value === null) {
        return null;
      }
      outputQueue.push(new BigNumber(value));
    } else if (token in operations) {
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== "(" &&
        operations[operatorStack[operatorStack.length - 1]].precedence >= operations[token].precedence
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(token);
    } else if (token === "(") {
      operatorStack.push(token);
    } else if (token === ")") {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== "(") {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length > 0) operatorStack.pop();
    }
  }

  while (operatorStack.length > 0) {
    outputQueue.push(operatorStack.pop()!);
  }

  const stack: BigNumber[] = [];
  for (const token of outputQueue) {
    if (token instanceof BigNumber) {
      stack.push(token);
    } else if (token in operations) {
      const b = stack.pop()!;
      const a = stack.pop()!;
      stack.push(operations[token].execute(a, b));
    }
  }

  return stack[0];
}
