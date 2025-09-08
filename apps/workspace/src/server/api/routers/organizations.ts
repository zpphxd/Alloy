import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  protectedProcedure, 
  adminProcedure,
  ownerProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'
import { createOrganizationInvitation, acceptOrganizationInvitation } from '../../auth/webhook'
import type { Role } from '@prisma/client'

export const organizationsRouter = createTRPCRouter({
  /**
   * List organizations for current user
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { user } = ctx
        const { limit, cursor } = input

        const userOrganizations = await ctx.db.userOrganization.findMany({
          where: { userId: user.id },
          include: { 
            organization: {
              include: {
                _count: {
                  select: {
                    users: true,
                    projects: true,
                  },
                },
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { createdAt: 'desc' },
        })

        const hasMore = userOrganizations.length > limit
        const items = hasMore ? userOrganizations.slice(0, -1) : userOrganizations

        return formatPaginatedResponse(
          items.map(uo => ({
            ...uo.organization,
            role: uo.role,
            memberCount: uo.organization._count.users,
            projectCount: uo.organization._count.projects,
          })),
          items[items.length - 1]?.id,
          hasMore
        )
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get organization by ID
   */
  get: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { user } = ctx
        const { id } = input

        // Verify user is member of organization
        const userOrg = await ctx.db.userOrganization.findFirst({
          where: {
            userId: user.id,
            organizationId: id,
          },
          include: {
            organization: {
              include: {
                users: {
                  include: { user: true },
                },
                projects: true,
                _count: {
                  select: {
                    users: true,
                    projects: true,
                  },
                },
              },
            },
          },
        })

        if (!userOrg) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Organization not found or access denied',
          })
        }

        return formatApiResponse({
          ...userOrg.organization,
          userRole: userOrg.role,
          memberCount: userOrg.organization._count.users,
          projectCount: userOrg.organization._count.projects,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Create new organization
   */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string()
        .min(1)
        .max(50)
        .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
      logoUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user } = ctx
        const { name, slug, logoUrl } = input

        // Check if slug is already taken
        const existingOrg = await ctx.db.organization.findUnique({
          where: { slug },
        })

        if (existingOrg) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Organization slug is already taken',
          })
        }

        // Create organization and add user as owner
        const organization = await ctx.db.$transaction(async (tx) => {
          const org = await tx.organization.create({
            data: {
              clerkId: crypto.randomUUID(), // Temporary until Clerk sync
              name,
              slug,
              logoUrl,
            },
          })

          await tx.userOrganization.create({
            data: {
              userId: user.id,
              organizationId: org.id,
              role: 'OWNER',
            },
          })

          return org
        })

        await ctx.db.auditEvent.create({
          data: {
            action: 'CREATE_ORGANIZATION',
            entityType: 'ORGANIZATION',
            entityId: organization.id,
            userId: user.id,
            organizationId: organization.id,
            metadata: { organizationName: organization.name },
          },
        })

        return formatApiResponse(organization, 'Organization created successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Update organization
   */
  update: adminProcedure
    .input(z.object({
      id: z.string().min(1),
      data: z.object({
        name: z.string().min(1).max(100).optional(),
        logoUrl: z.string().url().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, data } = input

        if (organization.id !== id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot update different organization',
          })
        }

        const updatedOrg = await ctx.db.organization.update({
          where: { id },
          data,
        })

        await ctx.db.auditEvent.create({
          data: {
            action: 'UPDATE_ORGANIZATION',
            entityType: 'ORGANIZATION',
            entityId: updatedOrg.id,
            userId: user.id,
            organizationId: updatedOrg.id,
            metadata: { changes: data },
          },
        })

        return formatApiResponse(updatedOrg, 'Organization updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Delete organization (owner only)
   */
  delete: ownerProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        if (organization.id !== id) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Cannot delete different organization',
          })
        }

        // Check for dependent resources
        const projectCount = await ctx.db.project.count({
          where: { organizationId: id },
        })

        if (projectCount > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot delete organization with existing projects',
          })
        }

        await ctx.db.$transaction(async (tx) => {
          // Delete organization (cascade will handle related records)
          await tx.organization.delete({
            where: { id },
          })

          await tx.auditEvent.create({
            data: {
              action: 'DELETE_ORGANIZATION',
              entityType: 'ORGANIZATION',
              entityId: id,
              userId: user.id,
              organizationId: id,
              metadata: { organizationName: organization.name },
            },
          })
        })

        return formatApiResponse(null, 'Organization deleted successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * List organization members
   */
  listMembers: protectedProcedure
    .input(z.object({
      organizationId: z.string().min(1),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { user } = ctx
        const { organizationId, limit, cursor } = input

        // Verify user is member of organization
        const userOrg = await ctx.db.userOrganization.findFirst({
          where: {
            userId: user.id,
            organizationId,
          },
        })

        if (!userOrg) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Access denied to organization',
          })
        }

        const members = await ctx.db.userOrganization.findMany({
          where: { organizationId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                createdAt: true,
              },
            },
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { createdAt: 'asc' },
        })

        const hasMore = members.length > limit
        const items = hasMore ? members.slice(0, -1) : members

        return formatPaginatedResponse(
          items.map(m => ({
            id: m.id,
            role: m.role,
            joinedAt: m.createdAt,
            user: m.user,
          })),
          items[items.length - 1]?.id,
          hasMore
        )
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Invite user to organization
   */
  inviteUser: adminProcedure
    .input(z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN', 'EDITOR', 'VIEWER'] as const),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { email, role } = input

        // Check if user is already a member
        const existingUser = await ctx.db.user.findUnique({
          where: { email },
        })

        if (existingUser) {
          const existingMembership = await ctx.db.userOrganization.findFirst({
            where: {
              userId: existingUser.id,
              organizationId: organization.id,
            },
          })

          if (existingMembership) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: 'User is already a member of this organization',
            })
          }
        }

        // Create invitation
        const invitation = await createOrganizationInvitation({
          email,
          role,
          organizationId: organization.id,
          invitedById: user.id,
        })

        await ctx.db.auditEvent.create({
          data: {
            action: 'INVITE_USER',
            entityType: 'ORGANIZATION_INVITATION',
            entityId: invitation.id,
            userId: user.id,
            organizationId: organization.id,
            metadata: { email, role },
          },
        })

        return formatApiResponse(
          { invitationId: invitation.id }, 
          'Invitation sent successfully'
        )
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Accept organization invitation
   */
  acceptInvitation: protectedProcedure
    .input(z.object({
      token: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user } = ctx
        const { token } = input

        const invitation = await acceptOrganizationInvitation(token, user.id)

        await ctx.db.auditEvent.create({
          data: {
            action: 'ACCEPT_INVITATION',
            entityType: 'ORGANIZATION_INVITATION',
            entityId: invitation.id,
            userId: user.id,
            organizationId: invitation.organizationId,
            metadata: { role: invitation.role },
          },
        })

        return formatApiResponse(
          { organization: invitation.organization },
          'Invitation accepted successfully'
        )
      } catch (error) {
        if (error instanceof Error) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: error.message,
          })
        }
        handleDatabaseError(error)
      }
    }),

  /**
   * Update member role (admin/owner only)
   */
  updateMemberRole: adminProcedure
    .input(z.object({
      userId: z.string().min(1),
      role: z.enum(['ADMIN', 'EDITOR', 'VIEWER'] as const),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization, userRole } = ctx
        const { userId, role } = input

        // Prevent self-role modification
        if (userId === user.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot modify your own role',
          })
        }

        // Only owners can modify admin roles
        if (role === 'ADMIN' && userRole !== 'OWNER') {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'Only owners can grant admin privileges',
          })
        }

        const updatedMembership = await ctx.db.userOrganization.update({
          where: {
            userId_organizationId: {
              userId,
              organizationId: organization.id,
            },
          },
          data: { role },
        })

        await ctx.db.auditEvent.create({
          data: {
            action: 'UPDATE_MEMBER_ROLE',
            entityType: 'USER_ORGANIZATION',
            entityId: updatedMembership.id,
            userId: user.id,
            organizationId: organization.id,
            metadata: { targetUserId: userId, newRole: role },
          },
        })

        return formatApiResponse(updatedMembership, 'Member role updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Remove member from organization
   */
  removeMember: adminProcedure
    .input(z.object({
      userId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { userId } = input

        // Prevent self-removal
        if (userId === user.id) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove yourself from organization',
          })
        }

        // Check if removing the last owner
        const ownerCount = await ctx.db.userOrganization.count({
          where: {
            organizationId: organization.id,
            role: 'OWNER',
          },
        })

        const targetMember = await ctx.db.userOrganization.findFirst({
          where: {
            userId,
            organizationId: organization.id,
          },
        })

        if (targetMember?.role === 'OWNER' && ownerCount <= 1) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Cannot remove the last owner from organization',
          })
        }

        await ctx.db.userOrganization.delete({
          where: {
            userId_organizationId: {
              userId,
              organizationId: organization.id,
            },
          },
        })

        await ctx.db.auditEvent.create({
          data: {
            action: 'REMOVE_MEMBER',
            entityType: 'USER_ORGANIZATION',
            entityId: crypto.randomUUID(),
            userId: user.id,
            organizationId: organization.id,
            metadata: { removedUserId: userId },
          },
        })

        return formatApiResponse(null, 'Member removed successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})