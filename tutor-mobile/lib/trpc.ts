import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../tutor-api/src/router';
import { useAuth } from '@clerk/clerk-expo';
import { useMemo } from 'react';

export const trpc = createTRPCReact<AppRouter>();

// Hook to create tRPC client with auth (must be used inside ClerkProvider)
export function useTRPCClient() {
  const { getToken } = useAuth();
  
  return useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: `${process.env.EXPO_PUBLIC_API_URL}/trpc`,
            async headers() {
              const token = await getToken();
              return {
                authorization: token ? `Bearer ${token}` : '',
              };
            },
            fetch(url, options) {
              // Add timeout to fetch requests (30 seconds)
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 30000);
              
              return fetch(url, {
                ...options,
                signal: controller.signal,
              }).finally(() => {
                clearTimeout(timeoutId);
              });
            },
          }),
        ],
      }),
    [getToken]
  );
}

