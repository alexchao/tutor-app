import dotenv from "dotenv";
import { DBOS } from "@dbos-inc/dbos-sdk";

// Only load dotenv in development
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.development" });
}
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { createContext } from "./context.js";
import { appRouter, type AppRouter } from "./router.js";

async function main(): Promise<void> {
  // Initialize DBOS
  DBOS.setConfig({
    name: "tutor-api",
    systemDatabaseUrl: process.env.DBOS_SYSTEM_DATABASE_URL ?? '',
  });
  await DBOS.launch();

  // Create Fastify server
  const server = fastify({
    logger: true,
    requestIdLogLabel: "reqId",
    disableRequestLogging: false,
    maxParamLength: 5000,
  });

  // Register tRPC plugin
  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ path, error }) {
        DBOS.logger.error(`Error in tRPC handler on path '${path}':`, error);
      },
    } satisfies FastifyTRPCPluginOptions<AppRouter>["trpcOptions"],
  });

  // Start the server
  const PORT = 3000;
  try {
    await server.listen({ port: PORT, host: "0.0.0.0" });
    DBOS.logger.info(`🚀 Server is running on http://localhost:${PORT}`);
    DBOS.logger.info(`📡 tRPC endpoints available at http://localhost:${PORT}/trpc`);
  } catch (err) {
    server.log.error(err);
    await DBOS.shutdown();
    process.exit(1);
  }

  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string): Promise<void> => {
    DBOS.logger.info(`${signal} received, shutting down gracefully...`);
    try {
      await server.close();
      await DBOS.shutdown();
      process.exit(0);
    } catch (err) {
      DBOS.logger.error(`Error during shutdown: ${(err as Error).message}`);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});

