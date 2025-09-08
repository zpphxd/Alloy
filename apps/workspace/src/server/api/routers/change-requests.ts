import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  readProcedure,
  writeProcedure,
  adminProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'

export const changeRequestsRouter = createTRPCRouter({
  /**
   * List change requests for an environment
   */
  list: readProcedure
    .input(z.object({
      environmentId: z.string().min(1).optional(),
      projectId: z.string().min(1).optional(),
      status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'DEPLOYED', 'FAILED']).optional(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { environmentId, projectId, status, limit, cursor } = input

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
          // List all change requests for organization
          where.environment = {
            project: {
              organizationId: organization.id,
            },
          }
        }

        if (status) {
          where.status = status
        }

        const changeRequests = await ctx.db.changeRequest.findMany({
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
            environment: {
              select: {
                id: true,
                name: true,
                type: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { createdAt: 'desc' },
        })

        const hasMore = changeRequests.length > limit
        const items = hasMore ? changeRequests.slice(0, -1) : changeRequests

        return formatPaginatedResponse(items, items[items.length - 1]?.id, hasMore)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get change request by ID
   */
  get: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const changeRequest = await ctx.db.changeRequest.findFirst({
          where: {
            id,
            environment: {
              project: {
                organizationId: organization.id,
              },
            },
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
            environment: {
              select: {
                id: true,
                name: true,
                type: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        })

        if (!changeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        return formatApiResponse(changeRequest)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Create new change request
   */
  create: writeProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      title: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { environmentId, title, description } = input

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

        // Check for existing pending/approved change requests for this environment
        const existingChangeRequest = await ctx.db.changeRequest.findFirst({
          where: {
            environmentId,
            status: {
              in: ['PENDING', 'APPROVED'],
            },
          },
        })

        if (existingChangeRequest) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Environment already has an active change request',
          })
        }

        const changeRequest = await ctx.db.$transaction(async (tx) => {
          const cr = await tx.changeRequest.create({
            data: {
              title,
              description,
              environmentId,
              createdById: user.id,
              status: 'PENDING',
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
              environment: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  project: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'CREATE_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: cr.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                title: cr.title,
                environmentId: environment.id,
                environmentName: environment.name,
                environmentType: environment.type,
                projectId: environment.project.id,
                projectName: environment.project.name,
              },
            },
          })

          return cr
        })

        return formatApiResponse(changeRequest, 'Change request created successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Update change request
   */
  update: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      data: z.object({
        title: z.string().min(1).max(200).optional(),
        description: z.string().max(2000).optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, data } = input

        // Verify change request exists and belongs to organization
        const existingChangeRequest = await ctx.db.changeRequest.findFirst({
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

        if (!existingChangeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        // Only allow updates to pending change requests
        if (existingChangeRequest.status !== 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only pending change requests can be updated',
          })
        }

        // Only the creator can update their own change request
        if (existingChangeRequest.createdById !== user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the creator can update this change request',
          })
        }

        const updatedChangeRequest = await ctx.db.$transaction(async (tx) => {
          const cr = await tx.changeRequest.update({
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
              environment: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  project: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'UPDATE_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: cr.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                changes: data,
                previousTitle: existingChangeRequest.title,
                environmentId: existingChangeRequest.environment.id,
                environmentName: existingChangeRequest.environment.name,
              },
            },
          })

          return cr
        })

        return formatApiResponse(updatedChangeRequest, 'Change request updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Approve change request (admin only)
   */
  approve: adminProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        const changeRequest = await ctx.db.changeRequest.findFirst({
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

        if (!changeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        if (changeRequest.status !== 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only pending change requests can be approved',
          })
        }

        // Don't allow self-approval
        if (changeRequest.createdById === user.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot approve your own change request',
          })
        }

        const updatedChangeRequest = await ctx.db.$transaction(async (tx) => {
          const cr = await tx.changeRequest.update({
            where: { id },
            data: {
              status: 'APPROVED',
              approvedById: user.id,
            },
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
          })

          await tx.auditEvent.create({
            data: {
              action: 'APPROVE_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: cr.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                title: changeRequest.title,
                createdById: changeRequest.createdById,
                environmentId: changeRequest.environment.id,
                environmentName: changeRequest.environment.name,
              },
            },
          })

          return cr
        })

        return formatApiResponse(updatedChangeRequest, 'Change request approved successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Reject change request (admin only)
   */
  reject: adminProcedure
    .input(z.object({
      id: z.string().min(1),
      reason: z.string().min(1).max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, reason } = input

        const changeRequest = await ctx.db.changeRequest.findFirst({
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

        if (!changeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        if (!['PENDING', 'APPROVED'].includes(changeRequest.status)) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only pending or approved change requests can be rejected',
          })
        }

        const updatedChangeRequest = await ctx.db.$transaction(async (tx) => {
          const cr = await tx.changeRequest.update({
            where: { id },
            data: {
              status: 'REJECTED',
            },
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
          })

          await tx.auditEvent.create({
            data: {
              action: 'REJECT_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: cr.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                title: changeRequest.title,
                reason,
                createdById: changeRequest.createdById,
                environmentId: changeRequest.environment.id,
                environmentName: changeRequest.environment.name,
              },
            },
          })

          return cr
        })

        return formatApiResponse(updatedChangeRequest, 'Change request rejected successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Deploy change request (admin only)
   */
  deploy: adminProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        const changeRequest = await ctx.db.changeRequest.findFirst({
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

        if (!changeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        if (changeRequest.status !== 'APPROVED') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only approved change requests can be deployed',
          })
        }

        const updatedChangeRequest = await ctx.db.$transaction(async (tx) => {
          const cr = await tx.changeRequest.update({
            where: { id },
            data: {
              status: 'DEPLOYED',
              deployedAt: new Date(),
            },
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
          })

          await tx.auditEvent.create({
            data: {
              action: 'DEPLOY_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: cr.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                title: changeRequest.title,
                createdById: changeRequest.createdById,
                environmentId: changeRequest.environment.id,
                environmentName: changeRequest.environment.name,
                environmentType: changeRequest.environment.type,
                deploymentTime: cr.deployedAt,
              },
            },
          })

          return cr
        })

        return formatApiResponse(updatedChangeRequest, 'Change request deployed successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Cancel change request (creator only)
   */
  cancel: writeProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        const changeRequest = await ctx.db.changeRequest.findFirst({
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

        if (!changeRequest) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Change request not found',
          })
        }

        if (changeRequest.status !== 'PENDING') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Only pending change requests can be cancelled',
          })
        }

        // Only the creator can cancel their own change request
        if (changeRequest.createdById !== user.id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only the creator can cancel this change request',
          })
        }

        await ctx.db.$transaction(async (tx) => {
          await tx.changeRequest.delete({
            where: { id },
          })

          await tx.auditEvent.create({
            data: {
              action: 'CANCEL_CHANGE_REQUEST',
              entityType: 'CHANGE_REQUEST',
              entityId: id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                title: changeRequest.title,
                environmentId: changeRequest.environment.id,
                environmentName: changeRequest.environment.name,
              },
            },
          })
        })

        return formatApiResponse(null, 'Change request cancelled successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get change request statistics
   */
  getStats: readProcedure
    .input(z.object({
      projectId: z.string().min(1).optional(),
      timeRange: z.enum(['7d', '30d', '90d']).default('30d'),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { projectId, timeRange } = input

        const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

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

        const changeRequests = await ctx.db.changeRequest.findMany({
          where,
          select: {
            status: true,
            createdAt: true,
            deployedAt: true,
            environment: {
              select: {
                type: true,
              },
            },
          },
        })

        const stats = {
          total: changeRequests.length,
          byStatus: changeRequests.reduce((acc, cr) => {
            acc[cr.status] = (acc[cr.status] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          byEnvironmentType: changeRequests.reduce((acc, cr) => {
            acc[cr.environment.type] = (acc[cr.environment.type] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          averageDeploymentTime: (() => {
            const deployedRequests = changeRequests.filter(cr => cr.deployedAt)
            if (deployedRequests.length === 0) return null

            const totalTime = deployedRequests.reduce((acc, cr) => {
              return acc + (cr.deployedAt!.getTime() - cr.createdAt.getTime())
            }, 0)

            return Math.round(totalTime / deployedRequests.length / (1000 * 60 * 60)) // hours
          })(),
          timeRange,
        }

        return formatApiResponse(stats)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})