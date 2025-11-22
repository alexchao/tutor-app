import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getAuth, clerkClient } from "@clerk/fastify";

export function createContext({ req, res }: CreateFastifyContextOptions) {
  const { userId } = getAuth(req);
  
  return { 
    req, 
    res, 
    userId: userId ?? null,
    getUser: async () => {
      if (!userId) return null;
      return await clerkClient.users.getUser(userId);
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

