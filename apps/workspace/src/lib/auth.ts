import { auth } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { db } from './db'
import type { User, Organization, Role } from '@prisma/client'

// Error classes
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class PermissionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}

// Permission types
export type Permission = 'read' | 'write' | 'delete' | 'admin'

// Permission matrix
const PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ['read', 'write', 'delete', 'admin'],
  ADMIN: ['read', 'write', 'delete'],
  EDITOR: ['read', 'write'],
  VIEWER: ['read'],
}

/**
 * Get the current authenticated user from the database
 * Syncs with Clerk if user doesn't exist locally
 */
export async function getCurrentUser(): Promise<User | null> {
  const { userId, user } = auth()

  if (!userId || !user) {
    return null
  }

  // Try to find user in our database
  let dbUser = await db.user.findUnique({
    where: { clerkId: userId },
    include: {
      organizations: {
        include: {
          organization: true,
        },
      },
    },
  })

  // If user doesn't exist in our DB, sync from Clerk
  if (!dbUser) {
    dbUser = await syncUserFromClerk({
      id: userId,
      email_addresses: user.emailAddresses.map(e => ({ email_address: e.emailAddress })),
      first_name: user.firstName,
      last_name: user.lastName,
      image_url: user.imageUrl,
    })
  }

  return dbUser
}

/**
 * Require authentication - throws if user is not authenticated
 */
export async function requireAuth(): Promise<User> {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new AuthError('Authentication required')
  }

  return user
}

/**
 * Get the current organization from request headers
 */
export async function getCurrentOrganization(): Promise<Organization | null> {
  const headersList = headers()
  const orgId = headersList.get('x-organization-id')

  if (!orgId) {
    return null
  }

  return await db.organization.findUnique({
    where: { id: orgId },
  })
}

/**
 * Get user's role in a specific organization
 */
export async function getUserRole(userId: string, organizationId: string): Promise<Role | null> {
  const userOrg = await db.userOrganization.findFirst({
    where: {
      userId,
      organizationId,
    },
  })

  return userOrg?.role || null
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission)
}

/**
 * Require specific roles - throws if user doesn't have required role
 */
export async function requireRole(allowedRoles: Role[]): Promise<void> {
  const user = await requireAuth()
  const org = await getCurrentOrganization()

  if (!org) {
    throw new AuthError('Organization context required')
  }

  const userRole = await getUserRole(user.id, org.id)

  if (!userRole) {
    throw new PermissionError('User not found in organization')
  }

  if (!allowedRoles.includes(userRole)) {
    throw new PermissionError('Insufficient permissions')
  }
}

/**
 * Require specific permission - throws if user doesn't have permission
 */
export async function requirePermission(permission: Permission): Promise<void> {
  const user = await requireAuth()
  const org = await getCurrentOrganization()

  if (!org) {
    throw new AuthError('Organization context required')
  }

  const userRole = await getUserRole(user.id, org.id)

  if (!userRole) {
    throw new PermissionError('User not found in organization')
  }

  if (!hasPermission(userRole, permission)) {
    throw new PermissionError(`Permission '${permission}' required`)
  }
}

/**
 * Sync user data from Clerk webhook or auth
 */
export async function syncUserFromClerk(clerkUserData: any): Promise<User> {
  const clerkId = clerkUserData.id
  const email = clerkUserData.email_addresses?.[0]?.email_address
  const firstName = clerkUserData.first_name
  const lastName = clerkUserData.last_name
  const avatarUrl = clerkUserData.image_url

  const existingUser = await db.user.findUnique({
    where: { clerkId },
  })

  if (existingUser) {
    // Update existing user
    return await db.user.update({
      where: { clerkId },
      data: {
        email,
        firstName,
        lastName,
        avatarUrl,
      },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    })
  } else {
    // Create new user
    return await db.user.create({
      data: {
        clerkId,
        email,
        firstName,
        lastName,
        avatarUrl,
      },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    })
  }
}

/**
 * Sync organization data from Clerk webhook
 */
export async function syncOrganizationFromClerk(clerkOrgData: any): Promise<Organization> {
  const clerkId = clerkOrgData.id
  const name = clerkOrgData.name
  const slug = clerkOrgData.slug
  const logoUrl = clerkOrgData.image_url

  const existingOrg = await db.organization.findUnique({
    where: { clerkId },
  })

  if (existingOrg) {
    // Update existing organization
    return await db.organization.update({
      where: { clerkId },
      data: {
        name,
        slug,
        logoUrl,
      },
    })
  } else {
    // Create new organization
    return await db.organization.create({
      data: {
        clerkId,
        name,
        slug,
        logoUrl,
      },
    })
  }
}

/**
 * Create audit event for tracking user actions
 */
export async function createAuditEvent(data: {
  action: string
  entityType: string
  entityId: string
  metadata?: any
}) {
  const user = await getCurrentUser()
  const org = await getCurrentOrganization()

  if (!user || !org) {
    return // Don't audit unauthenticated actions
  }

  return await db.auditEvent.create({
    data: {
      ...data,
      userId: user.id,
      organizationId: org.id,
    },
  })
}

/**
 * Middleware for protecting API routes with authentication
 */
export async function withAuth<T extends any[], R>(
  handler: (...args: T) => Promise<R>
): Promise<(...args: T) => Promise<R>> {
  return async (...args: T): Promise<R> => {
    await requireAuth()
    return handler(...args)
  }
}

/**
 * Middleware for protecting API routes with role-based access
 */
export function withRoles<T extends any[], R>(
  allowedRoles: Role[],
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    await requireRole(allowedRoles)
    return handler(...args)
  }
}

/**
 * Middleware for protecting API routes with permission-based access
 */
export function withPermission<T extends any[], R>(
  permission: Permission,
  handler: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    await requirePermission(permission)
    return handler(...args)
  }
}

/**
 * Get organizations that the current user belongs to
 */
export async function getUserOrganizations(): Promise<Organization[]> {
  const user = await requireAuth()

  const userOrgs = await db.userOrganization.findMany({
    where: { userId: user.id },
    include: { organization: true },
  })

  return userOrgs.map(uo => uo.organization)
}

/**
 * Check if user is member of organization
 */
export async function isOrganizationMember(userId: string, organizationId: string): Promise<boolean> {
  const userOrg = await db.userOrganization.findFirst({
    where: { userId, organizationId },
  })

  return !!userOrg
}

/**
 * Get user's organizations with their roles
 */
export async function getUserOrganizationsWithRoles(userId: string) {
  return await db.userOrganization.findMany({
    where: { userId },
    include: { organization: true },
  })
}