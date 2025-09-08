import { vi, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import type { User, Organization, Role } from '@prisma/client'

// Mock Clerk
vi.mock('@clerk/nextjs', () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

// Mock Next.js headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

// Mock crypto for deterministic IDs in tests
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-1234',
  },
})

// Mock environment variables
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'
process.env.CLERK_SECRET_KEY = 'test_clerk_secret'

// Create mock Prisma client with proper typing
const createMockPrismaClient = () => ({
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  organization: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  userOrganization: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  project: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  environment: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  secret: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  changeRequest: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  auditEvent: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  agentExecution: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  organizationInvitation: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
  $connect: vi.fn(),
  $disconnect: vi.fn(),
})

export const mockPrisma = createMockPrismaClient()

// Mock the db module
vi.mock('@/lib/db', () => ({
  db: mockPrisma,
}))

// Global test setup
beforeEach(() => {
  // Reset all mocks
  vi.clearAllMocks()
  
  // Reset all Prisma mocks
  Object.values(mockPrisma).forEach((model: any) => {
    if (typeof model === 'object' && model !== null) {
      Object.values(model).forEach((method: any) => {
        if (vi.isMockFunction(method)) {
          method.mockReset()
        }
      })
    } else if (vi.isMockFunction(model)) {
      model.mockReset()
    }
  })
})

// Test data factories
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: 'test-user-id',
  clerkId: 'test-clerk-id',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  avatarUrl: 'https://example.com/avatar.png',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockOrganization = (overrides?: Partial<Organization>): Organization => ({
  id: 'test-org-id',
  clerkId: 'test-org-clerk-id',
  name: 'Test Organization',
  slug: 'test-org',
  logoUrl: 'https://example.com/logo.png',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

export const createMockUserOrganization = (role: Role = 'ADMIN') => ({
  id: 'test-user-org-id',
  role,
  userId: 'test-user-id',
  organizationId: 'test-org-id',
  createdAt: new Date(),
  updatedAt: new Date(),
})

// Mock authentication helpers
export const mockAuthContext = {
  user: createMockUser(),
  organization: createMockOrganization(),
  userRole: 'ADMIN' as Role,
}

export const setupAuthMocks = () => {
  const { auth } = vi.mocked(require('@clerk/nextjs'))
  const { headers } = vi.mocked(require('next/headers'))
  
  auth.mockReturnValue({
    userId: mockAuthContext.user.clerkId,
    user: {
      id: mockAuthContext.user.clerkId,
      emailAddresses: [{ emailAddress: mockAuthContext.user.email }],
      firstName: mockAuthContext.user.firstName,
      lastName: mockAuthContext.user.lastName,
      imageUrl: mockAuthContext.user.avatarUrl,
    },
  })
  
  headers.mockReturnValue({
    get: vi.fn((key: string) => {
      if (key === 'x-organization-id') return mockAuthContext.organization.id
      if (key === 'user-agent') return 'test-agent'
      if (key === 'x-forwarded-for') return '127.0.0.1'
      return null
    }),
  })
  
  // Mock database queries for auth
  mockPrisma.user.findUnique.mockResolvedValue(mockAuthContext.user)
  mockPrisma.organization.findUnique.mockResolvedValue(mockAuthContext.organization)
  mockPrisma.userOrganization.findFirst.mockResolvedValue(createMockUserOrganization())
}

// Export for use in tests
export { mockPrisma }