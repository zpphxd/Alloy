import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  readProcedure,
  writeProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'

// Agent type definitions
const agentTypes = [
  'CODE_ANALYZER',
  'DEPLOYMENT_VALIDATOR', 
  'SECURITY_SCANNER',
  'PERFORMANCE_TESTER',
  'DEPENDENCY_CHECKER',
] as const

const agentStatuses = [
  'PENDING',
  'RUNNING', 
  'COMPLETED',
  'FAILED',
  'CANCELLED',
] as const

// Agent input schemas by type
const agentInputSchemas = {
  CODE_ANALYZER: z.object({
    repository: z.string().url().optional(),
    branch: z.string().default('main'),
    analysisType: z.enum(['security', 'quality', 'complexity', 'all']).default('all'),
    includePaths: z.array(z.string()).optional(),
    excludePaths: z.array(z.string()).optional(),
  }),
  DEPLOYMENT_VALIDATOR: z.object({
    changeRequestId: z.string().optional(),
    environment: z.string(),
    validationRules: z.array(z.string()).optional(),
    checkSecrets: z.boolean().default(true),
    checkDependencies: z.boolean().default(true),
  }),
  SECURITY_SCANNER: z.object({
    scanType: z.enum(['vulnerabilities', 'secrets', 'dependencies', 'all']).default('all'),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    repository: z.string().url().optional(),
  }),
  PERFORMANCE_TESTER: z.object({
    testType: z.enum(['load', 'stress', 'spike', 'volume']),
    duration: z.number().min(1).max(3600).default(300), // seconds
    concurrentUsers: z.number().min(1).max(1000).default(10),
    endpoints: z.array(z.string().url()),
  }),
  DEPENDENCY_CHECKER: z.object({
    packageManager: z.enum(['npm', 'yarn', 'pnpm', 'pip', 'composer']),
    checkOutdated: z.boolean().default(true),
    checkVulnerabilities: z.boolean().default(true),
    autoUpdate: z.boolean().default(false),
  }),
}

export const agentExecutionsRouter = createTRPCRouter({
  /**
   * List agent executions for an environment or project
   */
  list: readProcedure
    .input(z.object({
      environmentId: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      agentType: z.enum(agentTypes).optional(),
      status: z.enum(agentStatuses).optional(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { environmentId, projectId, agentType, status, limit, cursor } = input

        // Build where clause
        let where: any = {}

        if (environmentId) {
          // Verify environment belongs to organization
          const environment = await ctx.db.environment.findFirst({
            where: {
              id: environmentId,
              project: {
                organizationId: organization.id,
              },
            },
          })

          if (!environment) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Environment not found',
            })
          }

          where.environmentId = environmentId
        } else if (projectId) {
          // Verify project belongs to organization
          const project = await ctx.db.project.findFirst({
            where: {
              id: projectId,
              organizationId: organization.id,
            },
          })

          if (!project) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Project not found',
            })
          }

          where.environment = {
            projectId,
          }
        } else {
          // List all executions for organization
          where.environment = {
            project: {
              organizationId: organization.id,
            },
          }
        }

        if (agentType) {
          where.agentType = agentType
        }

        if (status) {
          where.status = status
        }

        const executions = await ctx.db.agentExecution.findMany({
          where,
          include: {
            triggeredBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { createdAt: 'desc' },
        })

        const hasMore = executions.length > limit
        const items = hasMore ? executions.slice(0, -1) : executions

        // Calculate duration for completed/failed executions
        const enrichedItems = items.map(execution => ({
          ...execution,
          duration: execution.startedAt && execution.completedAt 
            ? execution.completedAt.getTime() - execution.startedAt.getTime()
            : null,
        }))

        return formatPaginatedResponse(enrichedItems, items[items.length - 1]?.id, hasMore)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get agent execution by ID
   */
  get: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const execution = await ctx.db.agentExecution.findFirst({
          where: {
            id,
            environment: {
              project: {
                organizationId: organization.id,
              },
            },
          },
          include: {
            triggeredBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
        })

        if (!execution) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Agent execution not found',
          })
        }

        const duration = execution.startedAt && execution.completedAt 
          ? execution.completedAt.getTime() - execution.startedAt.getTime()
          : null

        return formatApiResponse({
          ...execution,
          duration,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Invoke agent execution
   */
  invoke: writeProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      agentType: z.enum(agentTypes),
      input: z.record(z.any()), // Will be validated based on agent type
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { environmentId, agentType, input: agentInput } = input

        // Verify environment belongs to organization
        const environment = await ctx.db.environment.findFirst({
          where: {
            id: environmentId,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        })

        if (!environment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Environment not found',
          })
        }

        // Validate agent input based on type
        const schema = agentInputSchemas[agentType]
        let validatedInput: any
        
        try {
          validatedInput = schema.parse(agentInput)
        } catch (error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Invalid input for agent type ${agentType}: ${error}`,
          })
        }

        // Check for existing running executions of the same type
        const existingExecution = await ctx.db.agentExecution.findFirst({
          where: {
            environmentId,
            agentType,
            status: {
              in: ['PENDING', 'RUNNING'],
            },
          },
        })

        if (existingExecution) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Agent of type ${agentType} is already running for this environment`,
          })
        }

        const execution = await ctx.db.$transaction(async (tx) => {
          const newExecution = await tx.agentExecution.create({
            data: {
              agentType,
              input: validatedInput,
              status: 'PENDING',
              environmentId,
              triggeredById: user.id,
            },
            include: {
              triggeredBy: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'INVOKE_AGENT',
              entityType: 'AGENT_EXECUTION',
              entityId: newExecution.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                agentType,
                environmentId: environment.id,
                environmentName: environment.name,
                projectId: environment.project.id,
                projectName: environment.project.name,
              },
            },
          })

          return newExecution
        })

        // TODO: Queue the agent execution for processing
        // This would integrate with your agent orchestration system

        return formatApiResponse(execution, 'Agent execution started successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Cancel agent execution
   */
  cancel: writeProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        const execution = await ctx.db.agentExecution.findFirst({
          where: {
            id,
            environment: {
              project: {
                organizationId: organization.id,
              },
            },
          },
          include: {
            environment: {
              include: {
                project: true,
              },
            },
          },
        })

        if (!execution) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Agent execution not found',
          })
        }

        if (!['PENDING', 'RUNNING'].includes(execution.status)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only pending or running executions can be cancelled',
          })
        }

        // Only the trigger user or admin can cancel
        if (execution.triggeredById !== user.id) {
          // Check if user is admin - this would normally be handled by middleware
          // but we'll add an explicit check here
          const userRole = await ctx.db.userOrganization.findFirst({
            where: {
              userId: user.id,
              organizationId: organization.id,
            },
          })

          if (!userRole || !['OWNER', 'ADMIN'].includes(userRole.role)) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'Only the trigger user or admin can cancel this execution',
            })
          }
        }

        const updatedExecution = await ctx.db.$transaction(async (tx) => {
          const updated = await tx.agentExecution.update({
            where: { id },
            data: {
              status: 'CANCELLED',
              completedAt: new Date(),
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'CANCEL_AGENT_EXECUTION',
              entityType: 'AGENT_EXECUTION',
              entityId: updated.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                agentType: execution.agentType,
                originalTriggeredById: execution.triggeredById,
                environmentId: execution.environment.id,
                environmentName: execution.environment.name,
              },
            },
          })

          return updated
        })

        // TODO: Signal the agent orchestration system to cancel the execution

        return formatApiResponse(updatedExecution, 'Agent execution cancelled successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get agent execution logs (simplified for demo)
   */
  getLogs: readProcedure
    .input(z.object({
      id: z.string().min(1),
      limit: z.number().min(1).max(1000).default(100),
      startTime: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id, limit, startTime } = input

        const execution = await ctx.db.agentExecution.findFirst({
          where: {
            id,
            environment: {
              project: {
                organizationId: organization.id,
              },
            },
          },
        })

        if (!execution) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Agent execution not found',
          })
        }

        // In a real implementation, this would fetch logs from your logging system
        // For demo purposes, we'll generate some mock logs based on the execution state
        const mockLogs = generateMockLogs(execution, limit, startTime)

        return formatApiResponse({
          executionId: id,
          logs: mockLogs,
          hasMore: false, // In real implementation, you'd check if there are more logs
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get agent execution statistics
   */
  getStats: readProcedure
    .input(z.object({
      projectId: z.string().min(1).optional(),
      timeRange: z.enum(['24h', '7d', '30d']).default('7d'),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { projectId, timeRange } = input

        const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 * 24 : 30 * 24
        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        let where: any = {
          createdAt: { gte: since },
          environment: {
            project: {
              organizationId: organization.id,
            },
          },
        }

        if (projectId) {
          where.environment.project.id = projectId
        }

        const executions = await ctx.db.agentExecution.findMany({
          where,
          select: {
            agentType: true,
            status: true,
            createdAt: true,
            startedAt: true,
            completedAt: true,
          },
        })

        const stats = {
          total: executions.length,
          byStatus: executions.reduce((acc, exec) => {
            acc[exec.status] = (acc[exec.status] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          byAgentType: executions.reduce((acc, exec) => {
            acc[exec.agentType] = (acc[exec.agentType] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          averageExecutionTime: (() => {
            const completedExecs = executions.filter(e => e.startedAt && e.completedAt)
            if (completedExecs.length === 0) return null

            const totalTime = completedExecs.reduce((acc, exec) => {
              return acc + (exec.completedAt!.getTime() - exec.startedAt!.getTime())
            }, 0)

            return Math.round(totalTime / completedExecs.length / 1000) // seconds
          })(),
          successRate: executions.length > 0 
            ? Math.round((executions.filter(e => e.status === 'COMPLETED').length / executions.length) * 100)
            : 0,
          timeRange,
        }

        return formatApiResponse(stats)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get available agent types with descriptions
   */
  getAgentTypes: readProcedure
    .query(async ({ ctx }) => {
      const agentTypeInfo = [
        {
          type: 'CODE_ANALYZER',
          name: 'Code Analyzer',
          description: 'Analyzes code for quality, complexity, and security issues',
          inputSchema: agentInputSchemas.CODE_ANALYZER.shape,
          estimatedDuration: '2-5 minutes',
        },
        {
          type: 'DEPLOYMENT_VALIDATOR',
          name: 'Deployment Validator', 
          description: 'Validates deployments for compliance and safety',
          inputSchema: agentInputSchemas.DEPLOYMENT_VALIDATOR.shape,
          estimatedDuration: '1-3 minutes',
        },
        {
          type: 'SECURITY_SCANNER',
          name: 'Security Scanner',
          description: 'Scans for security vulnerabilities and secrets',
          inputSchema: agentInputSchemas.SECURITY_SCANNER.shape,
          estimatedDuration: '3-10 minutes',
        },
        {
          type: 'PERFORMANCE_TESTER',
          name: 'Performance Tester',
          description: 'Runs performance tests and load testing',
          inputSchema: agentInputSchemas.PERFORMANCE_TESTER.shape,
          estimatedDuration: '5-60 minutes',
        },
        {
          type: 'DEPENDENCY_CHECKER',
          name: 'Dependency Checker',
          description: 'Checks for outdated or vulnerable dependencies',
          inputSchema: agentInputSchemas.DEPENDENCY_CHECKER.shape,
          estimatedDuration: '1-2 minutes',
        },
      ]

      return formatApiResponse(agentTypeInfo)
    }),
})

// Helper function to generate mock logs for demo purposes
function generateMockLogs(execution: any, limit: number, startTime?: Date) {
  const logs = []
  const baseTime = startTime || execution.createdAt
  
  const logMessages = {
    PENDING: [
      'Agent execution queued',
      'Waiting for available worker',
      'Validating input parameters',
    ],
    RUNNING: [
      'Agent execution started',
      'Initializing environment',
      'Processing input data',
      'Running analysis...',
      'Generating results',
    ],
    COMPLETED: [
      'Agent execution started',
      'Analysis completed successfully',
      'Results generated',
      'Cleaning up resources',
      'Execution finished',
    ],
    FAILED: [
      'Agent execution started',
      'Error occurred during processing',
      'Cleanup initiated',
      'Execution failed',
    ],
    CANCELLED: [
      'Agent execution started',
      'Cancellation requested',
      'Stopping current operation',
      'Execution cancelled',
    ],
  }

  const messages = logMessages[execution.status as keyof typeof logMessages] || []
  
  messages.slice(0, Math.min(messages.length, limit)).forEach((message, index) => {
    logs.push({
      timestamp: new Date(baseTime.getTime() + index * 10000), // 10 seconds apart
      level: index === messages.length - 1 && execution.status === 'FAILED' ? 'ERROR' : 'INFO',
      message,
      source: `agent-${execution.agentType.toLowerCase()}`,
    })
  })

  return logs
}