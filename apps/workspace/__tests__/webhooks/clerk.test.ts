import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextApiRequest, NextApiResponse } from 'next'
import { createMocks } from 'node-mocks-http'
import webhookHandler from '@/pages/api/webhooks/clerk'
import { mockPrisma, setupAuthMocks, createMockUser, createMockOrganization } from '../../vitest.setup'

// Mock svix for webhook verification
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body, headers) => {
      // For testing, we'll mock successful verification
      return JSON.parse(body)
    }),
  })),
}))

// Mock auth functions
vi.mock('@/lib/auth', () => ({
  syncUserFromClerk: vi.fn(),
  syncOrganizationFromClerk: vi.fn(),
  createAuditEvent: vi.fn(),
}))

describe('Clerk Webhook Handler', () => {
  beforeEach(() => {
    setupAuthMocks()
    vi.clearAllMocks()
    
    // Mock environment variable
    process.env.CLERK_WEBHOOK_SECRET = 'test_webhook_secret'
  })

  const createWebhookRequest = (eventType: string, data: any) => {
    const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
      method: 'POST',
      headers: {
        'svix-id': 'test-id',
        'svix-timestamp': Date.now().toString(),
        'svix-signature': 'test-signature',
        'content-type': 'application/json',
      },
      body: {
        type: eventType,
        data,
      },
    })
    return { req, res }
  }

  describe('Authentication and Validation', () => {
    it('should reject non-POST requests', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
      })

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(405)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed',
      })
    })

    it('should reject requests without svix headers', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {},
      })

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(400)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Error occurred -- missing svix headers',
      })
    })

    it('should handle webhook verification errors', async () => {
      const { Webhook } = await import('svix')
      const mockWebhook = Webhook as any
      mockWebhook.mockImplementation(() => ({
        verify: vi.fn().mockImplementation(() => {
          throw new Error('Invalid signature')
        }),
      }))

      const { req, res } = createWebhookRequest('user.created', {})

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(400)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Invalid signature',
      })
    })
  })

  describe('User Events', () => {
    const mockUserData = {
      id: 'clerk_user_123',
      email_addresses: [{ email_address: 'user@test.com' }],
      first_name: 'Test',
      last_name: 'User',
      image_url: 'https://example.com/avatar.png',
      created_at: Date.now(),
      updated_at: Date.now(),
    }

    it('should handle user.created events', async () => {
      const { syncUserFromClerk, createAuditEvent } = await import('@/lib/auth')
      const mockSyncUser = syncUserFromClerk as any
      const mockCreateAudit = createAuditEvent as any

      mockSyncUser.mockResolvedValue(createMockUser())
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('user.created', mockUserData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockSyncUser).toHaveBeenCalledWith(mockUserData)
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'USER_CREATED',
        entityType: 'USER',
        entityId: mockUserData.id,
        metadata: {
          email: mockUserData.email_addresses[0].email_address,
          source: 'clerk_webhook',
        },
      })
    })

    it('should handle user.updated events', async () => {
      const { syncUserFromClerk, createAuditEvent } = await import('@/lib/auth')
      const mockSyncUser = syncUserFromClerk as any
      const mockCreateAudit = createAuditEvent as any

      mockSyncUser.mockResolvedValue(createMockUser())
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('user.updated', mockUserData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockSyncUser).toHaveBeenCalledWith(mockUserData)
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'USER_UPDATED',
        entityType: 'USER',
        entityId: mockUserData.id,
        metadata: {
          email: mockUserData.email_addresses[0].email_address,
          source: 'clerk_webhook',
        },
      })
    })

    it('should handle user.deleted events', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      const existingUser = createMockUser({
        clerkId: mockUserData.id,
        email: 'user@test.com',
      })

      mockPrisma.user.findUnique.mockResolvedValue(existingUser)
      mockPrisma.user.update.mockResolvedValue({
        ...existingUser,
        email: `deleted-${existingUser.id}@deleted.local`,
      })
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('user.deleted', mockUserData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { clerkId: mockUserData.id },
        data: {
          email: `deleted-${existingUser.id}@deleted.local`,
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
      })
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'USER_DELETED',
        entityType: 'USER',
        entityId: mockUserData.id,
        metadata: {
          originalEmail: existingUser.email,
          source: 'clerk_webhook',
        },
      })
    })
  })

  describe('Organization Events', () => {
    const mockOrgData = {
      id: 'clerk_org_123',
      name: 'Test Organization',
      slug: 'test-org',
      image_url: 'https://example.com/logo.png',
      created_at: Date.now(),
      updated_at: Date.now(),
    }

    it('should handle organization.created events', async () => {
      const { syncOrganizationFromClerk, createAuditEvent } = await import('@/lib/auth')
      const mockSyncOrg = syncOrganizationFromClerk as any
      const mockCreateAudit = createAuditEvent as any

      mockSyncOrg.mockResolvedValue(createMockOrganization())
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('organization.created', mockOrgData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockSyncOrg).toHaveBeenCalledWith(mockOrgData)
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'ORGANIZATION_CREATED',
        entityType: 'ORGANIZATION',
        entityId: mockOrgData.id,
        metadata: {
          name: mockOrgData.name,
          slug: mockOrgData.slug,
          source: 'clerk_webhook',
        },
      })
    })

    it('should handle organization.updated events', async () => {
      const { syncOrganizationFromClerk, createAuditEvent } = await import('@/lib/auth')
      const mockSyncOrg = syncOrganizationFromClerk as any
      const mockCreateAudit = createAuditEvent as any

      mockSyncOrg.mockResolvedValue(createMockOrganization())
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('organization.updated', mockOrgData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockSyncOrg).toHaveBeenCalledWith(mockOrgData)
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'ORGANIZATION_UPDATED',
        entityType: 'ORGANIZATION',
        entityId: mockOrgData.id,
        metadata: {
          name: mockOrgData.name,
          slug: mockOrgData.slug,
          source: 'clerk_webhook',
        },
      })
    })

    it('should handle organization.deleted events cautiously', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      const existingOrg = createMockOrganization({
        clerkId: mockOrgData.id,
      })

      mockPrisma.organization.findUnique.mockResolvedValue(existingOrg)
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('organization.deleted', mockOrgData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'ORGANIZATION_DELETION_REQUESTED',
        entityType: 'ORGANIZATION',
        entityId: mockOrgData.id,
        metadata: {
          originalName: existingOrg.name,
          originalSlug: existingOrg.slug,
          source: 'clerk_webhook',
          warning: 'Organization deletion requires manual intervention',
        },
      })
    })
  })

  describe('Organization Membership Events', () => {
    const mockMembershipData = {
      id: 'membership_123',
      user_id: 'clerk_user_123',
      organization_id: 'clerk_org_123',
      role: 'org:admin',
      created_at: Date.now(),
      updated_at: Date.now(),
    }

    beforeEach(() => {
      const mockUser = createMockUser({ clerkId: mockMembershipData.user_id })
      const mockOrg = createMockOrganization({ clerkId: mockMembershipData.organization_id })
      
      mockPrisma.user.findUnique.mockResolvedValue(mockUser)
      mockPrisma.organization.findUnique.mockResolvedValue(mockOrg)
    })

    it('should handle organizationMembership.created events', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      mockPrisma.userOrganization.upsert.mockResolvedValue({
        id: 'user-org-123',
        userId: 'test-user-id',
        organizationId: 'test-org-id',
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('organizationMembership.created', mockMembershipData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockPrisma.userOrganization.upsert).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'test-user-id',
            organizationId: 'test-org-id',
          },
        },
        update: {
          role: 'OWNER', // org:admin maps to OWNER
        },
        create: {
          userId: 'test-user-id',
          organizationId: 'test-org-id',
          role: 'OWNER',
        },
      })
    })

    it('should handle organizationMembership.deleted events', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      mockPrisma.userOrganization.delete.mockResolvedValue({
        id: 'user-org-123',
        userId: 'test-user-id',
        organizationId: 'test-org-id',
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      mockCreateAudit.mockResolvedValue({})

      const { req, res } = createWebhookRequest('organizationMembership.deleted', mockMembershipData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockPrisma.userOrganization.delete).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'test-user-id',
            organizationId: 'test-org-id',
          },
        },
      })
    })

    it('should map Clerk roles correctly', async () => {
      const testCases = [
        { clerkRole: 'org:admin', expectedRole: 'OWNER' },
        { clerkRole: 'org:member', expectedRole: 'EDITOR' },
        { clerkRole: 'unknown_role', expectedRole: 'VIEWER' },
      ]

      for (const testCase of testCases) {
        vi.clearAllMocks()
        
        const membershipData = {
          ...mockMembershipData,
          role: testCase.clerkRole,
        }

        mockPrisma.userOrganization.upsert.mockResolvedValue({
          id: 'user-org-123',
          userId: 'test-user-id',
          organizationId: 'test-org-id',
          role: testCase.expectedRole as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        const { req, res } = createWebhookRequest('organizationMembership.created', membershipData)
        await webhookHandler(req, res)

        expect(mockPrisma.userOrganization.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            update: { role: testCase.expectedRole },
            create: expect.objectContaining({ role: testCase.expectedRole }),
          })
        )
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database connection failed'))
      mockCreateAudit.mockResolvedValue({})

      const mockUserData = {
        id: 'clerk_user_123',
        email_addresses: [{ email_address: 'user@test.com' }],
      }

      const { req, res } = createWebhookRequest('user.deleted', mockUserData)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(500)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Internal server error',
        eventType: 'user.deleted',
        eventId: 'test-id',
      })
    })

    it('should handle unhandled event types gracefully', async () => {
      const { req, res } = createWebhookRequest('unknown.event', {})

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(JSON.parse(res._getData())).toEqual({
        received: true,
        eventType: 'unknown.event',
        eventId: 'test-id',
      })
    })
  })

  describe('Security and Validation', () => {
    it('should verify webhook signatures', async () => {
      const { Webhook } = await import('svix')
      const mockWebhook = Webhook as any
      const verifyMock = vi.fn().mockReturnValue({
        type: 'user.created',
        data: { id: 'test' },
      })
      
      mockWebhook.mockImplementation(() => ({ verify: verifyMock }))

      const { req, res } = createWebhookRequest('user.created', { id: 'test' })

      await webhookHandler(req, res)

      expect(verifyMock).toHaveBeenCalledWith(
        JSON.stringify(req.body),
        {
          'svix-id': 'test-id',
          'svix-timestamp': expect.any(String),
          'svix-signature': 'test-signature',
        }
      )
    })

    it('should require webhook secret environment variable', async () => {
      delete process.env.CLERK_WEBHOOK_SECRET

      expect(() => {
        require('@/pages/api/webhooks/clerk')
      }).toThrow('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env')

      // Restore for other tests
      process.env.CLERK_WEBHOOK_SECRET = 'test_webhook_secret'
    })
  })
})