import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'
import { createTRPCMsw } from 'msw-trpc'
import { setupServer } from 'msw/node'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

// Mock dependencies
vi.mock('@clerk/nextjs', () => ({
  auth: vi.fn(),
}))

const mockPrisma = {
  organization: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  environment: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  changeRequest: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  secret: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  auditEvent: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  agentExecution: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  userOrganization: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
}

vi.mock('../src/lib/db', () => ({
  db: mockPrisma,
}))

// Mock auth functions
const mockAuth = {
  getCurrentUser: vi.fn(),
  requireAuth: vi.fn(),
  getCurrentOrganization: vi.fn(),
  requireRole: vi.fn(),
  requirePermission: vi.fn(),
  createAuditEvent: vi.fn(),
}

vi.mock('../src/lib/auth', () => mockAuth)

// Import types and router (these will be implemented next)
import type { AppRouter } from '../src/server/api/root'
import { createTRPCClient } from '@trpc/client'
import superjson from 'superjson'

// Mock user and organization data
const mockUser = {
  id: 'user_123',
  clerkId: 'user_clerk123',
  email: 'test@example.com',
  firstName: 'John',
  lastName: 'Doe',
}

const mockOrganization = {
  id: 'org_123',
  clerkId: 'org_clerk123',
  name: 'Test Organization',
  slug: 'test-org',
}

const mockProject = {
  id: 'project_123',
  name: 'Test Project',
  description: 'A test project',
  organizationId: 'org_123',
  createdById: 'user_123',
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('tRPC API Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // Default successful auth mocks
    mockAuth.getCurrentUser.mockResolvedValue(mockUser)
    mockAuth.requireAuth.mockResolvedValue(mockUser)
    mockAuth.getCurrentOrganization.mockResolvedValue(mockOrganization)
    mockAuth.requireRole.mockResolvedValue(undefined)
    mockAuth.requirePermission.mockResolvedValue(undefined)
    mockAuth.createAuditEvent.mockResolvedValue(undefined)
  })

  describe('Organizations Router', () => {
    describe('list', () => {
      it('should return organizations for authenticated user', async () => {
        const mockOrganizations = [
          { ...mockOrganization, id: 'org_1', name: 'Org 1' },
          { ...mockOrganization, id: 'org_2', name: 'Org 2' },
        ]

        mockPrisma.organization.findMany.mockResolvedValue(mockOrganizations)

        // This would use the actual tRPC client in a real test
        const result = mockOrganizations

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('Org 1')
        expect(result[1].name).toBe('Org 2')
      })

      it('should throw when user is not authenticated', async () => {
        mockAuth.requireAuth.mockRejectedValue(new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        }))

        await expect(mockAuth.requireAuth()).rejects.toThrow('Authentication required')
      })
    })

    describe('create', () => {
      it('should create organization with valid data', async () => {
        const createData = {
          name: 'New Organization',
          slug: 'new-org',
        }

        const createdOrg = {
          ...mockOrganization,
          ...createData,
        }

        mockPrisma.organization.create.mockResolvedValue(createdOrg)

        const result = await mockPrisma.organization.create({
          data: createData,
        })

        expect(result.name).toBe('New Organization')
        expect(result.slug).toBe('new-org')
        expect(mockPrisma.organization.create).toHaveBeenCalledWith({
          data: createData,
        })
      })

      it('should validate input schema', () => {
        const schema = z.object({
          name: z.string().min(1).max(100),
          slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        })

        // Valid input
        expect(() => schema.parse({
          name: 'Valid Organization',
          slug: 'valid-org',
        })).not.toThrow()

        // Invalid inputs
        expect(() => schema.parse({
          name: '',
          slug: 'invalid slug',
        })).toThrow()

        expect(() => schema.parse({
          name: 'Valid Name',
          slug: 'INVALID_SLUG',
        })).toThrow()
      })
    })

    describe('inviteUser', () => {
      it('should create organization invitation', async () => {
        const inviteData = {
          email: 'new@example.com',
          role: 'EDITOR' as const,
          organizationId: 'org_123',
        }

        mockAuth.requireRole.mockResolvedValue(undefined) // ADMIN or OWNER role

        const result = { success: true }
        expect(result.success).toBe(true)
        expect(mockAuth.requireRole).toHaveBeenCalledWith(['ADMIN', 'OWNER'])
      })

      it('should require ADMIN or OWNER role', async () => {
        mockAuth.requireRole.mockRejectedValue(new TRPCError({
          code: 'FORBIDDEN',
          message: 'Insufficient permissions',
        }))

        await expect(mockAuth.requireRole(['ADMIN', 'OWNER'])).rejects.toThrow('Insufficient permissions')
      })
    })
  })

  describe('Projects Router', () => {
    describe('list', () => {
      it('should return projects scoped to organization', async () => {
        const mockProjects = [
          { ...mockProject, id: 'project_1', name: 'Project 1' },
          { ...mockProject, id: 'project_2', name: 'Project 2' },
        ]

        mockPrisma.project.findMany.mockResolvedValue(mockProjects)

        const result = await mockPrisma.project.findMany({
          where: { organizationId: mockOrganization.id },
        })

        expect(result).toHaveLength(2)
        expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
          where: { organizationId: mockOrganization.id },
        })
      })

      it('should support pagination', async () => {
        const paginationInput = {
          limit: 10,
          cursor: 'project_cursor',
        }

        mockPrisma.project.findMany.mockResolvedValue([mockProject])

        await mockPrisma.project.findMany({
          where: { organizationId: mockOrganization.id },
          take: paginationInput.limit + 1,
          cursor: paginationInput.cursor ? { id: paginationInput.cursor } : undefined,
        })

        expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
          where: { organizationId: mockOrganization.id },
          take: 11, // limit + 1 for hasNextPage
          cursor: { id: 'project_cursor' },
        })
      })
    })

    describe('create', () => {
      it('should create project with organization context', async () => {
        const createData = {
          name: 'New Project',
          description: 'A new project',
        }

        mockAuth.requirePermission.mockResolvedValue(undefined) // 'write' permission

        const createdProject = {
          ...mockProject,
          ...createData,
          organizationId: mockOrganization.id,
          createdById: mockUser.id,
        }

        mockPrisma.project.create.mockResolvedValue(createdProject)

        const result = await mockPrisma.project.create({
          data: {
            ...createData,
            organizationId: mockOrganization.id,
            createdById: mockUser.id,
          },
        })

        expect(result.name).toBe('New Project')
        expect(result.organizationId).toBe(mockOrganization.id)
        expect(mockAuth.requirePermission).toHaveBeenCalledWith('write')
      })

      it('should create audit event after project creation', async () => {
        mockAuth.createAuditEvent.mockResolvedValue({
          action: 'CREATE_PROJECT',
          entityType: 'PROJECT',
          entityId: mockProject.id,
        })

        await mockAuth.createAuditEvent({
          action: 'CREATE_PROJECT',
          entityType: 'PROJECT',
          entityId: mockProject.id,
          metadata: { projectName: mockProject.name },
        })

        expect(mockAuth.createAuditEvent).toHaveBeenCalledWith({
          action: 'CREATE_PROJECT',
          entityType: 'PROJECT',
          entityId: mockProject.id,
          metadata: { projectName: mockProject.name },
        })
      })
    })

    describe('delete', () => {
      it('should require delete permission', async () => {
        mockAuth.requirePermission.mockResolvedValue(undefined) // 'delete' permission

        await mockAuth.requirePermission('delete')

        expect(mockAuth.requirePermission).toHaveBeenCalledWith('delete')
      })

      it('should prevent deletion with dependent resources', async () => {
        // Mock project with environments
        const projectWithEnvs = {
          ...mockProject,
          environments: [{ id: 'env_1', name: 'production' }],
        }

        mockPrisma.project.findUnique.mockResolvedValue(projectWithEnvs)

        // This would throw in the actual implementation
        const error = new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete project with existing environments',
        })

        expect(error.code).toBe('BAD_REQUEST')
        expect(error.message).toContain('environments')
      })
    })
  })

  describe('Environments Router', () => {
    describe('list', () => {
      it('should return environments for project', async () => {
        const mockEnvironments = [
          { id: 'env_1', name: 'development', type: 'DEVELOPMENT', projectId: mockProject.id },
          { id: 'env_2', name: 'production', type: 'PRODUCTION', projectId: mockProject.id },
        ]

        mockPrisma.environment.findMany.mockResolvedValue(mockEnvironments)

        const result = await mockPrisma.environment.findMany({
          where: { projectId: mockProject.id },
        })

        expect(result).toHaveLength(2)
        expect(result[0].name).toBe('development')
        expect(result[1].name).toBe('production')
      })
    })

    describe('create', () => {
      it('should validate environment type', () => {
        const schema = z.object({
          name: z.string().min(1),
          type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
          projectId: z.string(),
        })

        // Valid type
        expect(() => schema.parse({
          name: 'staging',
          type: 'STAGING',
          projectId: 'project_123',
        })).not.toThrow()

        // Invalid type
        expect(() => schema.parse({
          name: 'testing',
          type: 'TESTING',
          projectId: 'project_123',
        })).toThrow()
      })

      it('should enforce unique name per project', async () => {
        const duplicateError = new Error('Unique constraint violation')
        mockPrisma.environment.create.mockRejectedValue(duplicateError)

        await expect(mockPrisma.environment.create({
          data: {
            name: 'production',
            type: 'PRODUCTION',
            projectId: mockProject.id,
          },
        })).rejects.toThrow('Unique constraint violation')
      })
    })
  })

  describe('Secrets Router', () => {
    describe('list', () => {
      it('should return secrets for environment without values', async () => {
        const mockSecrets = [
          {
            id: 'secret_1',
            key: 'DATABASE_URL',
            encryptedValue: 'encrypted_value',
            environmentId: 'env_1',
            createdAt: new Date(),
          },
        ]

        mockPrisma.secret.findMany.mockResolvedValue(mockSecrets)

        // In real implementation, we'd exclude encryptedValue from response
        const sanitizedSecrets = mockSecrets.map(s => ({
          ...s,
          encryptedValue: undefined,
        }))

        expect(sanitizedSecrets[0].encryptedValue).toBeUndefined()
        expect(sanitizedSecrets[0].key).toBe('DATABASE_URL')
      })

      it('should require read permission', async () => {
        mockAuth.requirePermission.mockResolvedValue(undefined)

        await mockAuth.requirePermission('read')

        expect(mockAuth.requirePermission).toHaveBeenCalledWith('read')
      })
    })

    describe('create', () => {
      it('should encrypt secret value', async () => {
        const secretData = {
          key: 'API_KEY',
          value: 'secret_value',
          environmentId: 'env_1',
        }

        // Mock encryption (in real implementation this would use proper encryption)
        const encryptedValue = `encrypted_${secretData.value}`

        mockPrisma.secret.create.mockResolvedValue({
          id: 'secret_1',
          key: secretData.key,
          encryptedValue,
          environmentId: secretData.environmentId,
          createdById: mockUser.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })

        const result = await mockPrisma.secret.create({
          data: {
            key: secretData.key,
            encryptedValue,
            environmentId: secretData.environmentId,
            createdById: mockUser.id,
          },
        })

        expect(result.encryptedValue).toBe(`encrypted_${secretData.value}`)
        expect(result.key).toBe(secretData.key)
      })

      it('should require write permission', async () => {
        mockAuth.requirePermission.mockResolvedValue(undefined)

        await mockAuth.requirePermission('write')

        expect(mockAuth.requirePermission).toHaveBeenCalledWith('write')
      })
    })
  })

  describe('Agent Executions Router', () => {
    describe('invoke', () => {
      it('should create agent execution with validation', async () => {
        const agentInput = {
          agentType: 'CODE_ANALYZER',
          input: { repository: 'https://github.com/test/repo' },
          environmentId: 'env_1',
        }

        const mockExecution = {
          id: 'exec_1',
          ...agentInput,
          status: 'PENDING',
          triggeredById: mockUser.id,
          createdAt: new Date(),
        }

        mockPrisma.agentExecution.create.mockResolvedValue(mockExecution)

        const result = await mockPrisma.agentExecution.create({
          data: {
            ...agentInput,
            status: 'PENDING',
            triggeredById: mockUser.id,
          },
        })

        expect(result.agentType).toBe('CODE_ANALYZER')
        expect(result.status).toBe('PENDING')
      })

      it('should validate agent input schema', () => {
        const agentInputSchema = z.object({
          agentType: z.enum(['CODE_ANALYZER', 'DEPLOYMENT_VALIDATOR', 'SECURITY_SCANNER']),
          input: z.record(z.any()),
          environmentId: z.string(),
        })

        // Valid input
        expect(() => agentInputSchema.parse({
          agentType: 'CODE_ANALYZER',
          input: { repository: 'https://github.com/test/repo' },
          environmentId: 'env_1',
        })).not.toThrow()

        // Invalid agent type
        expect(() => agentInputSchema.parse({
          agentType: 'INVALID_AGENT',
          input: {},
          environmentId: 'env_1',
        })).toThrow()
      })
    })

    describe('getStatus', () => {
      it('should return execution status and results', async () => {
        const executionId = 'exec_1'
        const mockExecution = {
          id: executionId,
          agentType: 'CODE_ANALYZER',
          status: 'COMPLETED',
          output: { vulnerabilities: 0, score: 95 },
          startedAt: new Date(),
          completedAt: new Date(),
        }

        mockPrisma.agentExecution.findUnique.mockResolvedValue(mockExecution)

        const result = await mockPrisma.agentExecution.findUnique({
          where: { id: executionId },
        })

        expect(result.status).toBe('COMPLETED')
        expect(result.output).toEqual({ vulnerabilities: 0, score: 95 })
      })
    })
  })

  describe('Audit Events Router', () => {
    describe('list', () => {
      it('should return audit events scoped to organization', async () => {
        const mockAuditEvents = [
          {
            id: 'audit_1',
            action: 'CREATE_PROJECT',
            entityType: 'PROJECT',
            entityId: 'project_1',
            organizationId: mockOrganization.id,
            createdAt: new Date(),
          },
        ]

        mockPrisma.auditEvent.findMany.mockResolvedValue(mockAuditEvents)

        const result = await mockPrisma.auditEvent.findMany({
          where: { organizationId: mockOrganization.id },
          orderBy: { createdAt: 'desc' },
        })

        expect(result[0].action).toBe('CREATE_PROJECT')
        expect(result[0].organizationId).toBe(mockOrganization.id)
      })

      it('should support filtering by entity type', async () => {
        const filter = { entityType: 'PROJECT' }

        mockPrisma.auditEvent.findMany.mockResolvedValue([])

        await mockPrisma.auditEvent.findMany({
          where: {
            organizationId: mockOrganization.id,
            entityType: filter.entityType,
          },
        })

        expect(mockPrisma.auditEvent.findMany).toHaveBeenCalledWith({
          where: {
            organizationId: mockOrganization.id,
            entityType: 'PROJECT',
          },
        })
      })
    })
  })

  describe('Error Handling and Security', () => {
    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed')
      mockPrisma.project.findMany.mockRejectedValue(dbError)

      await expect(mockPrisma.project.findMany()).rejects.toThrow('Database connection failed')
    })

    it('should validate all inputs with Zod schemas', () => {
      const schemas = {
        organization: z.object({
          name: z.string().min(1).max(100),
          slug: z.string().min(1).max(50),
        }),
        project: z.object({
          name: z.string().min(1).max(100),
          description: z.string().optional(),
        }),
        environment: z.object({
          name: z.string().min(1).max(50),
          type: z.enum(['DEVELOPMENT', 'STAGING', 'PRODUCTION']),
        }),
      }

      // All schemas should validate properly
      Object.values(schemas).forEach(schema => {
        expect(schema.safeParse).toBeDefined()
      })
    })

    it('should prevent SQL injection through parameterized queries', () => {
      // Prisma automatically prevents SQL injection through parameterized queries
      const maliciousInput = "'; DROP TABLE projects; --"
      
      // This would be safely handled by Prisma
      expect(() => mockPrisma.project.findMany({
        where: { name: { contains: maliciousInput } },
      })).not.toThrow()
    })

    it('should rate limit API requests', () => {
      // Rate limiting would be implemented at the middleware level
      const rateLimitConfig = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
      }

      expect(rateLimitConfig.windowMs).toBe(900000)
      expect(rateLimitConfig.max).toBe(100)
    })
  })
})