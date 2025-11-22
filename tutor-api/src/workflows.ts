import { DBOS } from "@dbos-inc/dbos-sdk";

async function stepOne(): Promise<void> {
  DBOS.logger.info("Step one: Hello from DBOS!");
}

async function stepTwo(): Promise<void> {
  DBOS.logger.info("Step two: Workflow executing...");
}

async function greetingWorkflowFunction(): Promise<string> {
  await DBOS.runStep(() => stepOne(), { name: "stepOne" });
  await DBOS.runStep(() => stepTwo(), { name: "stepTwo" });
  return "Greeting workflow completed successfully!";
}

export const greetingWorkflow = DBOS.registerWorkflow(greetingWorkflowFunction);

