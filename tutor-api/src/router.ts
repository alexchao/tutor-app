import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Context } from "./context.js";
import { greetingWorkflow } from "./workflows.js";

const t = initTRPC.context<Context>().create();

// Authentication middleware
const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ 
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource" 
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId, // Now TypeScript knows userId is non-null
    },
  });
});

// Public procedure - anyone can access
export const publicProcedure = t.procedure;

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(isAuthenticated);

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
});

export type AppRouter = typeof appRouter;

