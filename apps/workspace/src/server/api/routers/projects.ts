import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  protectedProcedure, 
  writeProcedure,
  deleteProcedure,
  readProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'

export const projectsRouter = createTRPCRouter({
  /**
   * List projects for current organization
   */
  list: readProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { limit, cursor, search } = input

        const where = {
          organizationId: organization.id,
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }),
        }

        const projects = await ctx.db.project.findMany({
          where,
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
            environments: {
              select: {
                id: true,
                name: true,
                type: true,
              },
            },
            _count: {
              select: {
                environments: true,
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { createdAt: 'desc' },
        })

        const hasMore = projects.length > limit
        const items = hasMore ? projects.slice(0, -1) : projects

        return formatPaginatedResponse(
          items.map(project => ({
            ...project,
            environmentCount: project._count.environments,
          })),
          items[items.length - 1]?.id,
          hasMore
        )
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get project by ID
   */
  get: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const project = await ctx.db.project.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
          include: {
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
            environments: {
              select: {
                id: true,
                name: true,
                type: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            _count: {
              select: {
                environments: true,
              },
            },
          },
        })

        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          })
        }

        return formatApiResponse({
          ...project,
          environmentCount: project._count.environments,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Create new project
   */
  create: writeProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { name, description } = input

        // Check for duplicate project name in organization
        const existingProject = await ctx.db.project.findFirst({
          where: {
            name,
            organizationId: organization.id,
          },
        })

        if (existingProject) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A project with this name already exists',
          })
        }

        const project = await ctx.db.$transaction(async (tx) => {
          const newProject = await tx.project.create({
            data: {
              name,
              description,
              organizationId: organization.id,
              createdById: user.id,
            },
            include: {
              createdBy: {
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

          // Create default environments
          const defaultEnvironments = [
            { name: 'development', type: 'DEVELOPMENT' as const },
            { name: 'staging', type: 'STAGING' as const },
            { name: 'production', type: 'PRODUCTION' as const },
          ]

          for (const env of defaultEnvironments) {
            await tx.environment.create({
              data: {
                ...env,
                projectId: newProject.id,
              },
            })
          }

          await tx.auditEvent.create({
            data: {
              action: 'CREATE_PROJECT',
              entityType: 'PROJECT',
              entityId: newProject.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                projectName: newProject.name,
                defaultEnvironmentsCreated: defaultEnvironments.length,
              },
            },
          })

          return newProject
        })

        return formatApiResponse(project, 'Project created successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Update project
   */
  update: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      data: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, data } = input

        // Verify project exists and belongs to organization
        const existingProject = await ctx.db.project.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
        })

        if (!existingProject) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          })
        }

        // Check for name conflicts if updating name
        if (data.name && data.name !== existingProject.name) {
          const nameConflict = await ctx.db.project.findFirst({
            where: {
              name: data.name,
              organizationId: organization.id,
              id: { not: id },
            },
          })

          if (nameConflict) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'A project with this name already exists',
            })
          }
        }

        const updatedProject = await ctx.db.$transaction(async (tx) => {
          const project = await tx.project.update({
            where: { id },
            data,
            include: {
              createdBy: {
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
              action: 'UPDATE_PROJECT',
              entityType: 'PROJECT',
              entityId: project.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                changes: data,
                previousName: existingProject.name,
              },
            },
          })

          return project
        })

        return formatApiResponse(updatedProject, 'Project updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Delete project
   */
  delete: deleteProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        // Verify project exists and belongs to organization
        const project = await ctx.db.project.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
          include: {
            environments: {
              include: {
                secrets: true,
                changeRequests: true,
              },
            },
          },
        })

        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          })
        }

        // Check for active change requests
        const activeChangeRequests = project.environments.flatMap(env => 
          env.changeRequests.filter(cr => cr.status === 'PENDING' || cr.status === 'APPROVED')
        )

        if (activeChangeRequests.length > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot delete project with active change requests',
          })
        }

        await ctx.db.$transaction(async (tx) => {
          // Delete in correct order due to foreign key constraints
          for (const env of project.environments) {
            // Delete secrets first
            await tx.secret.deleteMany({
              where: { environmentId: env.id },
            })

            // Delete change requests
            await tx.changeRequest.deleteMany({
              where: { environmentId: env.id },
            })

            // Delete environment
            await tx.environment.delete({
              where: { id: env.id },
            })
          }

          // Delete the project
          await tx.project.delete({
            where: { id },
          })

          await tx.auditEvent.create({
            data: {
              action: 'DELETE_PROJECT',
              entityType: 'PROJECT',
              entityId: id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                projectName: project.name,
                environmentsDeleted: project.environments.length,
                secretsDeleted: project.environments.reduce((acc, env) => acc + env.secrets.length, 0),
              },
            },
          })
        })

        return formatApiResponse(null, 'Project deleted successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get project statistics
   */
  getStats: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const project = await ctx.db.project.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
          include: {
            environments: {
              include: {
                secrets: true,
                changeRequests: {
                  where: {
                    createdAt: {
                      gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
                    },
                  },
                },
              },
            },
          },
        })

        if (!project) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Project not found',
          })
        }

        const stats = {
          environmentCount: project.environments.length,
          totalSecrets: project.environments.reduce((acc, env) => acc + env.secrets.length, 0),
          recentChangeRequests: project.environments.reduce((acc, env) => acc + env.changeRequests.length, 0),
          environmentBreakdown: project.environments.map(env => ({
            name: env.name,
            type: env.type,
            secretCount: env.secrets.length,
            recentChangeRequests: env.changeRequests.length,
          })),
        }

        return formatApiResponse(stats)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Clone project
   */
  clone: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      name: z.string().min(1).max(100),
      description: z.string().max(500).optional(),
      includeSecrets: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, name, description, includeSecrets } = input

        // Verify source project exists
        const sourceProject = await ctx.db.project.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
          include: {
            environments: {
              include: {
                secrets: includeSecrets,
              },
            },
          },
        })

        if (!sourceProject) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Source project not found',
          })
        }

        // Check for name conflicts
        const nameConflict = await ctx.db.project.findFirst({
          where: {
            name,
            organizationId: organization.id,
          },
        })

        if (nameConflict) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A project with this name already exists',
          })
        }

        const clonedProject = await ctx.db.$transaction(async (tx) => {
          // Create the new project
          const project = await tx.project.create({
            data: {
              name,
              description: description || `Clone of ${sourceProject.name}`,
              organizationId: organization.id,
              createdById: user.id,
            },
          })

          // Clone environments
          for (const sourceEnv of sourceProject.environments) {
            const environment = await tx.environment.create({
              data: {
                name: sourceEnv.name,
                type: sourceEnv.type,
                projectId: project.id,
              },
            })

            // Clone secrets if requested
            if (includeSecrets && sourceEnv.secrets) {
              for (const secret of sourceEnv.secrets) {
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
          }

          await tx.auditEvent.create({
            data: {
              action: 'CLONE_PROJECT',
              entityType: 'PROJECT',
              entityId: project.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: { 
                sourceProjectId: sourceProject.id,
                sourceProjectName: sourceProject.name,
                includeSecrets,
                environmentsCloned: sourceProject.environments.length,
              },
            },
          })

          return project
        })

        return formatApiResponse(clonedProject, 'Project cloned successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})