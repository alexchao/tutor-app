import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context.js";

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

