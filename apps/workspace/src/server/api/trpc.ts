import { initTRPC, TRPCError } from '@trpc/server'
import { type CreateNextContextOptions } from '@trpc/server/adapters/next'
import superjson from 'superjson'
import { ZodError } from 'zod'
import { auth } from '@clerk/nextjs'
import { headers } from 'next/headers'
import { db } from '../../lib/db'
import { 
  getCurrentUser, 
  getCurrentOrganization, 
  requireAuth, 
  requireRole, 
  requirePermission,
  getUserRole,
  createAuditEvent,
  type Permission 
} from '../../lib/auth'
import type { User, Organization, Role } from '@prisma/client'

/**
 * Context creation for tRPC
 * This is where we attach request-specific data
 */
export const createTRPCContext = async (opts: CreateNextContextOptions) => {
  const { req, res } = opts
  
  // Get auth info from Clerk
  const authData = auth()
  
  // Get request headers
  const headersList = headers()
  const organizationId = headersList.get('x-organization-id')
  const userAgent = headersList.get('user-agent') || 'unknown'
  const clientIp = headersList.get('x-forwarded-for') || req.socket.remoteAddress || 'unknown'

  return {
    req,
    res,
    db,
    auth: authData,
    organizationId,
    userAgent,
    clientIp,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * Initialize tRPC
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

/**
 * Create a server-side caller
 */
export const createCallerFactory = t.createCallerFactory

/**
 * Base router and procedure helpers
 */
export const createTRPCRouter = t.router
export const baseProcedure = t.procedure

/**
 * Rate limiting middleware
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

const rateLimit = t.middleware(async ({ ctx, next }) => {
  const key = `${ctx.clientIp}:${ctx.organizationId || 'global'}`
  const now = Date.now()
  const windowMs = 15 * 60 * 1000 // 15 minutes
  const limit = 1000 // 1000 requests per window

  const current = rateLimitStore.get(key)

  if (!current || now > current.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs })
  } else {
    current.count++
    if (current.count > limit) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Rate limit exceeded',
      })
    }
  }

  return next()
})

/**
 * Request logging middleware
 */
const requestLogger = t.middleware(async ({ ctx, path, input, next }) => {
  const start = Date.now()
  
  console.log(`[tRPC] ${path}`, {
    ip: ctx.clientIp,
    userAgent: ctx.userAgent,
    organizationId: ctx.organizationId,
    timestamp: new Date().toISOString(),
  })

  const result = await next()
  
  const duration = Date.now() - start
  
  console.log(`[tRPC] ${path} completed`, {
    duration: `${duration}ms`,
    success: result.ok,
    error: result.ok ? undefined : result.error.message,
  })

  // Log to audit trail for write operations
  if (path.includes('create') || path.includes('update') || path.includes('delete')) {
    try {
      await createAuditEvent({
        action: `API_${path.toUpperCase()}`,
        entityType: 'API_REQUEST',
        entityId: crypto.randomUUID(),
        metadata: {
          path,
          duration,
          success: result.ok,
          ip: ctx.clientIp,
          userAgent: ctx.userAgent,
        },
      })
    } catch (error) {
      // Don't fail the request if audit logging fails
      console.error('Failed to create audit event:', error)
    }
  }

  return result
})

/**
 * Authentication middleware
 * Attaches user and organization to context
 */
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  const user = await getCurrentUser()
  const organization = await getCurrentOrganization()

  return next({
    ctx: {
      ...ctx,
      user,
      organization,
    },
  })
})

/**
 * Protected procedure - requires authentication
 */
const requireAuthMiddleware = t.middleware(async ({ ctx, next }) => {
  const user = await requireAuth()
  const organization = await getCurrentOrganization()

  if (!organization) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Organization context required',
    })
  }

  const userRole = await getUserRole(user.id, organization.id)

  if (!userRole) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'User not found in organization',
    })
  }

  return next({
    ctx: {
      ...ctx,
      user,
      organization,
      userRole,
    },
  })
})

/**
 * Role-based middleware factory
 */
const createRoleMiddleware = (allowedRoles: Role[]) => 
  t.middleware(async ({ ctx, next }) => {
    await requireRole(allowedRoles)
    return next()
  })

/**
 * Permission-based middleware factory
 */
const createPermissionMiddleware = (permission: Permission) => 
  t.middleware(async ({ ctx, next }) => {
    await requirePermission(permission)
    return next()
  })

/**
 * Input validation and sanitization middleware
 */
const inputSanitizer = t.middleware(async ({ input, next }) => {
  // Sanitize string inputs to prevent XSS
  const sanitizeInput = (obj: any): any => {
    if (typeof obj === 'string') {
      // Basic HTML/Script tag removal
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
               .replace(/<[^>]*>/g, '')
               .trim()
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeInput)
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeInput(value)
      }
      return sanitized
    }
    
    return obj
  }

  const sanitizedInput = sanitizeInput(input)

  return next({ input: sanitizedInput })
})

/**
 * CORS middleware
 */
const corsMiddleware = t.middleware(async ({ ctx, next }) => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || []
  const origin = ctx.req.headers.origin

  if (allowedOrigins.includes(origin || '')) {
    ctx.res.setHeader('Access-Control-Allow-Origin', origin || '*')
  }

  ctx.res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  ctx.res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-organization-id')
  ctx.res.setHeader('Access-Control-Allow-Credentials', 'true')

  return next()
})

/**
 * Public procedures (no auth required)
 */
export const publicProcedure = baseProcedure
  .use(corsMiddleware)
  .use(rateLimit)
  .use(requestLogger)
  .use(inputSanitizer)
  .use(authMiddleware)

/**
 * Protected procedures (requires auth)
 */
export const protectedProcedure = publicProcedure
  .use(requireAuthMiddleware)

/**
 * Role-specific procedures
 */
export const ownerProcedure = protectedProcedure
  .use(createRoleMiddleware(['OWNER']))

export const adminProcedure = protectedProcedure
  .use(createRoleMiddleware(['OWNER', 'ADMIN']))

export const editorProcedure = protectedProcedure
  .use(createRoleMiddleware(['OWNER', 'ADMIN', 'EDITOR']))

/**
 * Permission-specific procedures
 */
export const readProcedure = protectedProcedure
  .use(createPermissionMiddleware('read'))

export const writeProcedure = protectedProcedure
  .use(createPermissionMiddleware('write'))

export const deleteProcedure = protectedProcedure
  .use(createPermissionMiddleware('delete'))

export const adminPermissionProcedure = protectedProcedure
  .use(createPermissionMiddleware('admin'))

/**
 * Context types for procedures
 */
export type PublicContext = Context & {
  user: User | null
  organization: Organization | null
}

export type ProtectedContext = Context & {
  user: User
  organization: Organization
  userRole: Role
}

/**
 * Error handling utilities
 */
export const handleDatabaseError = (error: any) => {
  console.error('Database error:', error)

  // Prisma error codes
  if (error.code === 'P2002') {
    throw new TRPCError({
      code: 'CONFLICT',
      message: 'A record with this data already exists',
    })
  }

  if (error.code === 'P2025') {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Record not found',
    })
  }

  if (error.code === 'P2003') {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Invalid foreign key reference',
    })
  }

  // Generic database error
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Database operation failed',
  })
}

/**
 * Input validation schemas
 */
export const commonSchemas = {
  pagination: {
    limit: 50,
    maxLimit: 100,
  },
  
  id: (entity: string) => ({
    message: `Invalid ${entity} ID format`,
    refine: (id: string) => id.length > 0,
  }),
}

/**
 * Response formatting utilities
 */
export const formatApiResponse = <T>(data: T, message?: string) => ({
  data,
  message,
  timestamp: new Date().toISOString(),
})

export const formatPaginatedResponse = <T>(
  items: T[],
  cursor?: string,
  hasMore = false
) => ({
  items,
  cursor,
  hasMore,
  count: items.length,
})

/**
 * Security headers middleware
 */
export const securityHeaders = t.middleware(async ({ ctx, next }) => {
  // Set security headers
  ctx.res.setHeader('X-Content-Type-Options', 'nosniff')
  ctx.res.setHeader('X-Frame-Options', 'DENY')
  ctx.res.setHeader('X-XSS-Protection', '1; mode=block')
  ctx.res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  ctx.res.setHeader('Permissions-Policy', 'camera=(), microphone=(), location=()')

  return next()
})

// Apply security headers to all procedures
export const secureProcedure = publicProcedure.use(securityHeaders)