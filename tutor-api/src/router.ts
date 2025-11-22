import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context.js";
import { greetingWorkflow } from "./workflows.js";
import { learningTopicsRouter } from "./routers/learning-topics.js";
import { publicProcedure, protectedProcedure } from "./procedures.js";

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  greeting: t.router({
    hello: publicProcedure
      .input(z.object({ name: z.string().optional() }).optional())
      .query((opts) => {
        const name = opts.input?.name ?? "anonymous";
        return {
          message: `Hello, ${name}!`,
        };
      }),
    execute: publicProcedure.mutation(async () => {
      const result = await greetingWorkflow();
      return {
        success: true,
        message: result,
      };
    }),
  }),
  user: t.router({
    welcome: protectedProcedure.query(async ({ ctx }) => {
      const user = await ctx.getUser();
      const firstName = user?.firstName ?? "User";
      return {
        message: `Welcome, ${firstName}!`,
      };
    }),
  }),
  learningTopics: t.router(learningTopicsRouter),
});

export type AppRouter = typeof appRouter;

