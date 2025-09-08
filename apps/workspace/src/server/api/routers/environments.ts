import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  readProcedure,
  writeProcedure,
  deleteProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'

export const environmentsRouter = createTRPCRouter({
  /**
   * List environments for a project
   */
  list: readProcedure
    .input(z.object({
      projectId: z.string().min(1),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { projectId, limit, cursor } = input

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

        const environments = await ctx.db.environment.findMany({
          where: { projectId },
          include: {
            _count: {
              select: {
                secrets: true,
                changeRequests: true,
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: [
            // Order by environment type priority, then by name
            {
              type: {
                sort: 'asc',
                nulls: 'last',
              },
            },
            { name: 'asc' },
          ],
        })

        const hasMore = environments.length > limit
        const items = hasMore ? environments.slice(0, -1) : environments

        return formatPaginatedResponse(
          items.map(env => ({
            ...env,
            secretCount: env._count.secrets,
            changeRequestCount: env._count.changeRequests,
          })),
          items[items.length - 1]?.id,
          hasMore
        )
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get environment by ID
   */
  get: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const environment = await ctx.db.environment.findFirst({
          where: {
            id,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            project: {
              select: {
                id: true,
                name: true,
                organizationId: true,
              },
            },
            _count: {
              select: {
                secrets: true,
                changeRequests: true,
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

        return formatApiResponse({
          ...environment,
          secretCount: environment._count.secrets,
          changeRequestCount: environment._count.changeRequests,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Create new environment
   */
  create: writeProcedure
    .input(z.object({
      projectId: z.string().min(1),
      name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/, 'Name can only contain letters, numbers, hyphens, and underscores'),
      type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { projectId, name, type } = input

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

        // Check for duplicate environment name in project
        const existingEnv = await ctx.db.environment.findFirst({
          where: {
            projectId,
            name,
          },
        })

        if (existingEnv) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An environment with this name already exists in the project',
          })
        }

        const environment = await ctx.db.$transaction(async (tx) => {
          const env = await tx.environment.create({
            data: {
              name,
              type,
              projectId,
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'CREATE_ENVIRONMENT',
              entityType: 'ENVIRONMENT',
              entityId: env.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                environmentName: env.name,
                environmentType: env.type,
                projectId: project.id,
                projectName: project.name,
              },
            },
          })

          return env
        })

        return formatApiResponse(environment, 'Environment created successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Update environment
   */
  update: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      data: z.object({
        name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/).optional(),
        type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, data } = input

        // Verify environment exists and belongs to organization
        const existingEnvironment = await ctx.db.environment.findFirst({
          where: {
            id,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            project: true,
          },
        })

        if (!existingEnvironment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Environment not found',
          })
        }

        // Check for name conflicts if updating name
        if (data.name && data.name !== existingEnvironment.name) {
          const nameConflict = await ctx.db.environment.findFirst({
            where: {
              projectId: existingEnvironment.projectId,
              name: data.name,
              id: { not: id },
            },
          })

          if (nameConflict) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'An environment with this name already exists in the project',
            })
          }
        }

        const updatedEnvironment = await ctx.db.$transaction(async (tx) => {
          const env = await tx.environment.update({
            where: { id },
            data,
          })

          await tx.auditEvent.create({
            data: {
              action: 'UPDATE_ENVIRONMENT',
              entityType: 'ENVIRONMENT',
              entityId: env.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                changes: data,
                previousName: existingEnvironment.name,
                previousType: existingEnvironment.type,
                projectId: existingEnvironment.project.id,
                projectName: existingEnvironment.project.name,
              },
            },
          })

          return env
        })

        return formatApiResponse(updatedEnvironment, 'Environment updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Delete environment
   */
  delete: deleteProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        // Verify environment exists and belongs to organization
        const environment = await ctx.db.environment.findFirst({
          where: {
            id,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            project: true,
            secrets: true,
            changeRequests: {
              where: {
                status: {
                  in: ['PENDING', 'APPROVED'],
                },
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

        // Check for active change requests
        if (environment.changeRequests.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot delete environment with active change requests',
          })
        }

        // Prevent deletion of production environments without explicit confirmation
        if (environment.type === 'PRODUCTION') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Production environments cannot be deleted for safety reasons',
          })
        }

        await ctx.db.$transaction(async (tx) => {
          // Delete secrets first
          await tx.secret.deleteMany({
            where: { environmentId: id },
          })

          // Delete change requests
          await tx.changeRequest.deleteMany({
            where: { environmentId: id },
          })

          // Delete environment
          await tx.environment.delete({
            where: { id },
          })

          await tx.auditEvent.create({
            data: {
              action: 'DELETE_ENVIRONMENT',
              entityType: 'ENVIRONMENT',
              entityId: id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                environmentName: environment.name,
                environmentType: environment.type,
                projectId: environment.project.id,
                projectName: environment.project.name,
                secretsDeleted: environment.secrets.length,
              },
            },
          })
        })

        return formatApiResponse(null, 'Environment deleted successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Clone environment
   */
  clone: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(50).regex(/^[a-zA-Z0-9-_]+$/),
      type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
      includeSecrets: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, name, type, includeSecrets } = input

        // Verify source environment exists
        const sourceEnvironment = await ctx.db.environment.findFirst({
          where: {
            id,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            project: true,
            secrets: includeSecrets,
          },
        })

        if (!sourceEnvironment) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Source environment not found',
          })
        }

        // Check for name conflicts
        const nameConflict = await ctx.db.environment.findFirst({
          where: {
            projectId: sourceEnvironment.projectId,
            name,
          },
        })

        if (nameConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An environment with this name already exists in the project',
          })
        }

        const clonedEnvironment = await ctx.db.$transaction(async (tx) => {
          // Create the new environment
          const environment = await tx.environment.create({
            data: {
              name,
              type,
              projectId: sourceEnvironment.projectId,
            },
          })

          // Clone secrets if requested
          if (includeSecrets && sourceEnvironment.secrets) {
            for (const secret of sourceEnvironment.secrets) {
              await tx.secret.create({
                data: {
                  key: secret.key,
                  encryptedValue: secret.encryptedValue,
                  environmentId: environment.id,
                  createdById: user.id,
                },
              })
            }
          }

          await tx.auditEvent.create({
            data: {
              action: 'CLONE_ENVIRONMENT',
              entityType: 'ENVIRONMENT',
              entityId: environment.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                sourceEnvironmentId: sourceEnvironment.id,
                sourceEnvironmentName: sourceEnvironment.name,
                projectId: sourceEnvironment.project.id,
                projectName: sourceEnvironment.project.name,
                includeSecrets,
                secretsCloned: includeSecrets ? sourceEnvironment.secrets?.length || 0 : 0,
              },
            },
          })

          return environment
        })

        return formatApiResponse(clonedEnvironment, 'Environment cloned successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get environment deployment status
   */
  getDeploymentStatus: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const environment = await ctx.db.environment.findFirst({
          where: {
            id,
            project: {
              organizationId: organization.id,
            },
          },
          include: {
            changeRequests: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: {
                createdBy: {
                  select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                  },
                },
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

        const activeChangeRequest = environment.changeRequests.find(
          cr => cr.status === 'PENDING' || cr.status === 'APPROVED'
        )

        const lastDeployment = environment.changeRequests.find(
          cr => cr.status === 'DEPLOYED' && cr.deployedAt
        )

        const status = {
          environment: {
            id: environment.id,
            name: environment.name,
            type: environment.type,
          },
          hasActiveChangeRequest: !!activeChangeRequest,
          activeChangeRequest,
          lastDeployment,
          recentChangeRequests: environment.changeRequests.slice(0, 5),
        }

        return formatApiResponse(status)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})