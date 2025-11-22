import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context.js";
import { greetingWorkflow } from "./workflows.js";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  greeting: t.router({
    hello: t.procedure
      .input(z.object({ name: z.string().optional() }).optional())
      .query((opts) => {
        const name = opts.input?.name ?? opts.ctx.user.name;
        return {
          message: `Hello, ${name}!`,
        };
      }),
    execute: t.procedure.mutation(async () => {
      const result = await greetingWorkflow();
      return {
        success: true,
        message: result,
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;

