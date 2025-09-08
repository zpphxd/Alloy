import { createTRPCRouter } from './trpc'
import { organizationsRouter } from './routers/organizations'
import { projectsRouter } from './routers/projects'
import { environmentsRouter } from './routers/environments'
import { secretsRouter } from './routers/secrets'
import { changeRequestsRouter } from './routers/change-requests'
import { auditEventsRouter } from './routers/audit-events'
import { agentExecutionsRouter } from './routers/agent-executions'

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  organizations: organizationsRouter,
  projects: projectsRouter,
  environments: environmentsRouter,
  secrets: secretsRouter,
  changeRequests: changeRequestsRouter,
  auditEvents: auditEventsRouter,
  agents: agentExecutionsRouter,
})

// export type definition of API
export type AppRouter = typeof appRouter