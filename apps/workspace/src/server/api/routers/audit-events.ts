import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  readProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'

export const auditEventsRouter = createTRPCRouter({
  /**
   * List audit events for organization
   */
  list: readProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
      entityType: z.string().optional(),
      entityId: z.string().optional(),
      action: z.string().optional(),
      userId: z.string().optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { 
          limit, 
          cursor, 
          entityType, 
          entityId, 
          action, 
          userId, 
          startDate, 
          endDate 
        } = input

        // Build where clause
        const where: any = {
          organizationId: organization.id,
        }

        if (entityType) {
          where.entityType = entityType
        }

        if (entityId) {
          where.entityId = entityId
        }

        if (action) {
          where.action = { contains: action, mode: 'insensitive' }
        }

        if (userId) {
          where.userId = userId
        }

        if (startDate || endDate) {
          where.createdAt = {}
          if (startDate) {
            where.createdAt.gte = startDate
          }
          if (endDate) {
            where.createdAt.lte = endDate
          }
        }

        const auditEvents = await ctx.db.auditEvent.findMany({
          where,
          include: {
            user: {
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

        const hasMore = auditEvents.length > limit
        const items = hasMore ? auditEvents.slice(0, -1) : auditEvents

        return formatPaginatedResponse(items, items[items.length - 1]?.id, hasMore)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get audit event by ID
   */
  get: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { id } = input

        const auditEvent = await ctx.db.auditEvent.findFirst({
          where: {
            id,
            organizationId: organization.id,
          },
          include: {
            user: {
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

        if (!auditEvent) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Audit event not found',
          })
        }

        return formatApiResponse(auditEvent)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get audit statistics
   */
  getStats: readProcedure
    .input(z.object({
      timeRange: z.enum(['24h', '7d', '30d', '90d']).default('30d'),
      entityType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { timeRange, entityType } = input

        const hours = timeRange === '24h' ? 24 : 
                     timeRange === '7d' ? 7 * 24 :
                     timeRange === '30d' ? 30 * 24 : 90 * 24
        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        const where: any = {
          organizationId: organization.id,
          createdAt: { gte: since },
        }

        if (entityType) {
          where.entityType = entityType
        }

        const auditEvents = await ctx.db.auditEvent.findMany({
          where,
          select: {
            action: true,
            entityType: true,
            createdAt: true,
            userId: true,
          },
        })

        // Calculate statistics
        const stats = {
          total: auditEvents.length,
          byAction: auditEvents.reduce((acc, event) => {
            acc[event.action] = (acc[event.action] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          byEntityType: auditEvents.reduce((acc, event) => {
            acc[event.entityType] = (acc[event.entityType] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          byUser: auditEvents.reduce((acc, event) => {
            acc[event.userId] = (acc[event.userId] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          timeline: (() => {
            const buckets: Record<string, number> = {}
            const bucketSize = timeRange === '24h' ? 60 * 60 * 1000 : // 1 hour buckets
                              timeRange === '7d' ? 6 * 60 * 60 * 1000 : // 6 hour buckets
                              24 * 60 * 60 * 1000 // 1 day buckets

            auditEvents.forEach(event => {
              const bucketKey = Math.floor(event.createdAt.getTime() / bucketSize) * bucketSize
              const date = new Date(bucketKey).toISOString()
              buckets[date] = (buckets[date] || 0) + 1
            })

            return Object.entries(buckets)
              .map(([date, count]) => ({ date, count }))
              .sort((a, b) => a.date.localeCompare(b.date))
          })(),
          timeRange,
        }

        return formatApiResponse(stats)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get top actions
   */
  getTopActions: readProcedure
    .input(z.object({
      timeRange: z.enum(['24h', '7d', '30d']).default('7d'),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { timeRange, limit } = input

        const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 * 24 : 30 * 24
        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        const auditEvents = await ctx.db.auditEvent.findMany({
          where: {
            organizationId: organization.id,
            createdAt: { gte: since },
          },
          select: {
            action: true,
            entityType: true,
          },
        })

        const actionCounts = auditEvents.reduce((acc, event) => {
          const key = `${event.action}:${event.entityType}`
          acc[key] = (acc[key] || 0) + 1
          return acc
        }, {} as Record<string, number>)

        const topActions = Object.entries(actionCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, limit)
          .map(([actionEntity, count]) => {
            const [action, entityType] = actionEntity.split(':')
            return { action, entityType, count }
          })

        return formatApiResponse({
          topActions,
          timeRange,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get user activity
   */
  getUserActivity: readProcedure
    .input(z.object({
      userId: z.string().min(1).optional(),
      timeRange: z.enum(['24h', '7d', '30d']).default('7d'),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization, user: currentUser } = ctx
        const { userId, timeRange, limit } = input

        const targetUserId = userId || currentUser.id

        // Verify user is member of organization
        const userMembership = await ctx.db.userOrganization.findFirst({
          where: {
            userId: targetUserId,
            organizationId: organization.id,
          },
          include: {
            user: {
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

        if (!userMembership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'User not found in organization',
          })
        }

        const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 * 24 : 30 * 24
        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        const auditEvents = await ctx.db.auditEvent.findMany({
          where: {
            organizationId: organization.id,
            userId: targetUserId,
            createdAt: { gte: since },
          },
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            createdAt: true,
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })

        const activityStats = {
          total: auditEvents.length,
          byAction: auditEvents.reduce((acc, event) => {
            acc[event.action] = (acc[event.action] || 0) + 1
            return acc
          }, {} as Record<string, number>),
          byEntityType: auditEvents.reduce((acc, event) => {
            acc[event.entityType] = (acc[event.entityType] || 0) + 1
            return acc
          }, {} as Record<string, number>),
        }

        return formatApiResponse({
          user: userMembership.user,
          events: auditEvents,
          stats: activityStats,
          timeRange,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Export audit events
   */
  export: readProcedure
    .input(z.object({
      format: z.enum(['json', 'csv']).default('json'),
      startDate: z.date(),
      endDate: z.date(),
      entityType: z.string().optional(),
      action: z.string().optional(),
      limit: z.number().min(1).max(10000).default(1000),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { format, startDate, endDate, entityType, action, limit } = input

        // Verify date range is reasonable (max 1 year)
        const maxRange = 365 * 24 * 60 * 60 * 1000
        if (endDate.getTime() - startDate.getTime() > maxRange) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Date range cannot exceed 1 year',
          })
        }

        const where: any = {
          organizationId: organization.id,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        }

        if (entityType) {
          where.entityType = entityType
        }

        if (action) {
          where.action = action
        }

        const auditEvents = await ctx.db.auditEvent.findMany({
          where,
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })

        let exportData: string

        if (format === 'csv') {
          const headers = [
            'ID', 'Action', 'Entity Type', 'Entity ID', 'User Email', 
            'User Name', 'Created At', 'Metadata'
          ]
          const rows = auditEvents.map(event => [
            event.id,
            event.action,
            event.entityType,
            event.entityId,
            event.user.email,
            `${event.user.firstName || ''} ${event.user.lastName || ''}`.trim(),
            event.createdAt.toISOString(),
            JSON.stringify(event.metadata),
          ])

          exportData = [headers, ...rows].map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
          ).join('\n')
        } else {
          exportData = JSON.stringify(auditEvents, null, 2)
        }

        return formatApiResponse({
          format,
          data: exportData,
          count: auditEvents.length,
          dateRange: { startDate, endDate },
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get recent security events
   */
  getSecurityEvents: readProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      hours: z.number().min(1).max(24 * 7).default(24), // Last 24 hours by default
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { limit, hours } = input

        const since = new Date(Date.now() - hours * 60 * 60 * 1000)

        // Security-related actions
        const securityActions = [
          'ACCESS_SECRET',
          'CREATE_SECRET',
          'UPDATE_SECRET',
          'DELETE_SECRET',
          'INVITE_USER',
          'REMOVE_MEMBER',
          'UPDATE_MEMBER_ROLE',
          'DELETE_PROJECT',
          'DELETE_ENVIRONMENT',
          'APPROVE_CHANGE_REQUEST',
          'DEPLOY_CHANGE_REQUEST',
        ]

        const securityEvents = await ctx.db.auditEvent.findMany({
          where: {
            organizationId: organization.id,
            createdAt: { gte: since },
            action: { in: securityActions },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
              },
            },
          },
          take: limit,
          orderBy: { createdAt: 'desc' },
        })

        const riskLevels = securityEvents.map(event => {
          let risk: 'low' | 'medium' | 'high' = 'low'

          if (['DELETE_PROJECT', 'DELETE_ENVIRONMENT', 'REMOVE_MEMBER'].includes(event.action)) {
            risk = 'high'
          } else if ([
            'CREATE_SECRET', 'UPDATE_SECRET', 'DELETE_SECRET', 
            'DEPLOY_CHANGE_REQUEST', 'UPDATE_MEMBER_ROLE'
          ].includes(event.action)) {
            risk = 'medium'
          }

          // Production environments get higher risk
          if (event.metadata && typeof event.metadata === 'object' && 
              'environmentType' in event.metadata && 
              event.metadata.environmentType === 'PRODUCTION') {
            risk = risk === 'low' ? 'medium' : 'high'
          }

          return { ...event, riskLevel: risk }
        })

        return formatApiResponse({
          events: riskLevels,
          summary: {
            total: securityEvents.length,
            high: riskLevels.filter(e => e.riskLevel === 'high').length,
            medium: riskLevels.filter(e => e.riskLevel === 'medium').length,
            low: riskLevels.filter(e => e.riskLevel === 'low').length,
          },
          timeRange: `${hours}h`,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})