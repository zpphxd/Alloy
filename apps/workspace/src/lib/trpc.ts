import { createTRPCNext } from '@trpc/next';
import { httpBatchLink, loggerLink } from '@trpc/client';
import { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';

import { type AppRouter } from '@/server/api/root';

const getBaseUrl = () => {
  if (typeof window !== 'undefined') return ''; // browser should use relative url
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`; // SSR should use vercel url
  return `http://localhost:${process.env.PORT ?? 3000}`; // dev SSR should use localhost
};

export const api = createTRPCNext<AppRouter>({
  config() {
    return {
      transformer: superjson,
      links: [
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            // You can add any custom headers here
            return {};
          },
        }),
      ],
      queryClientConfig: {
        defaultOptions: {
          queries: {
            // Don't retry on 4xx errors
            retry: (failureCount, error: any) => {
              if (error?.data?.httpStatus === 401) return false;
              if (error?.data?.httpStatus >= 400 && error?.data?.httpStatus < 500) return false;
              return failureCount < 3;
            },
            // Stale time for caching
            staleTime: 30 * 1000, // 30 seconds
            // Refetch on window focus for critical data
            refetchOnWindowFocus: true,
          },
          mutations: {
            // Don't retry mutations by default
            retry: false,
          },
        },
      },
    };
  },
  ssr: false,
});

/**
 * Inference helpers for input and output types.
 * These provide type-safety for your tRPC calls.
 */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// Helper types for common router outputs
export type Organization = RouterOutputs['organizations']['list'][0];
export type Project = RouterOutputs['projects']['list'][0];
export type Environment = RouterOutputs['environments']['list'][0];
export type ChangeRequest = RouterOutputs['changeRequests']['list'][0];
export type AgentExecution = RouterOutputs['agents']['list'][0];