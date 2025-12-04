// IMPORTANT: Load environment variables BEFORE any other imports
// Clerk requires env vars to be loaded before it's imported
// Use side-effect import for immediate execution
import "dotenv/config";

import { DBOS } from "@dbos-inc/dbos-sdk";
import {
  fastifyTRPCPlugin,
  type FastifyTRPCPluginOptions,
} from "@trpc/server/adapters/fastify";
import fastify from "fastify";
import { clerkPlugin } from "@clerk/fastify";
import { createContext } from "./context.js";
import { appRouter, type AppRouter } from "./router.js";
import { registerDrillSSERoutes, closeAllSSEConnections } from "./routes/drill-sse.js";
import { ablyClient } from "./lib/ably.js";

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

  // Register Clerk plugin for authentication
  await server.register(clerkPlugin);

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

  // Register SSE routes
  await registerDrillSSERoutes(server);

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

    // Set a timeout to force exit if graceful shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      DBOS.logger.error('Graceful shutdown timed out after 10 seconds, forcing exit');
      process.exit(1);
    }, 10000);

    try {
      // Step 1: Close all active SSE connections
      DBOS.logger.info('Closing active SSE connections...');
      closeAllSSEConnections();
      DBOS.logger.info('SSE connections closed');

      // Step 2: Close Ably realtime connection
      DBOS.logger.info('Closing Ably connection...');
      await new Promise<void>((resolve) => {
        ablyClient.close();
        ablyClient.connection.once('closed', () => {
          DBOS.logger.info('Ably connection closed');
          resolve();
        });
        // Fallback timeout for Ably close
        setTimeout(() => {
          DBOS.logger.warn('Ably close timed out, continuing shutdown');
          resolve();
        }, 2000);
      });

      // Step 3: Close Fastify server
      DBOS.logger.info('Closing Fastify server...');
      await server.close();
      DBOS.logger.info('Fastify server closed');

      // Step 4: Shutdown DBOS
      DBOS.logger.info('Shutting down DBOS...');
      await DBOS.shutdown();
      DBOS.logger.info('DBOS shutdown complete');

      clearTimeout(forceExitTimeout);
      process.exit(0);
    } catch (err) {
      DBOS.logger.error(`Error during shutdown: ${(err as Error).message}`);
      clearTimeout(forceExitTimeout);
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

