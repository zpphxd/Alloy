import { NextRequest, NextResponse } from 'next/server'
import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { db } from '../../lib/db'
import { syncUserFromClerk, syncOrganizationFromClerk } from '../../lib/auth'
import type { Role } from '@prisma/client'

// Webhook event types
type WebhookEvent = 
  | { type: 'user.created'; data: any }
  | { type: 'user.updated'; data: any }
  | { type: 'user.deleted'; data: any }
  | { type: 'organization.created'; data: any }
  | { type: 'organization.updated'; data: any }
  | { type: 'organization.deleted'; data: any }
  | { type: 'organizationMembership.created'; data: any }
  | { type: 'organizationMembership.updated'; data: any }
  | { type: 'organizationMembership.deleted'; data: any }

/**
 * Verify webhook signature from Clerk
 */
function verifyWebhookSignature(
  payload: string,
  headersList: Headers
): WebhookEvent {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    throw new Error('CLERK_WEBHOOK_SECRET is not configured')
  }

  const svix_id = headersList.get('svix-id')
  const svix_timestamp = headersList.get('svix-timestamp')
  const svix_signature = headersList.get('svix-signature')

  if (!svix_id || !svix_timestamp || !svix_signature) {
    throw new Error('Missing required webhook headers')
  }

  const webhook = new Webhook(WEBHOOK_SECRET)

  try {
    return webhook.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    throw new Error('Invalid webhook signature')
  }
}

/**
 * Map Clerk organization role to our Role enum
 */
function mapClerkRoleToRole(clerkRole: string): Role {
  switch (clerkRole) {
    case 'org:admin':
      return 'ADMIN'
    case 'org:member':
      return 'EDITOR'
    default:
      return 'VIEWER'
  }
}

/**
 * Handle user-related webhook events
 */
async function handleUserEvent(event: WebhookEvent) {
  const { type, data } = event

  switch (type) {
    case 'user.created':
    case 'user.updated':
      await syncUserFromClerk(data)
      console.log(`User ${type.split('.')[1]}: ${data.id}`)
      break

    case 'user.deleted':
      await db.user.delete({
        where: { clerkId: data.id },
      })
      console.log(`User deleted: ${data.id}`)
      break
  }
}

/**
 * Handle organization-related webhook events
 */
async function handleOrganizationEvent(event: WebhookEvent) {
  const { type, data } = event

  switch (type) {
    case 'organization.created':
    case 'organization.updated':
      await syncOrganizationFromClerk(data)
      console.log(`Organization ${type.split('.')[1]}: ${data.id}`)
      break

    case 'organization.deleted':
      await db.organization.delete({
        where: { clerkId: data.id },
      })
      console.log(`Organization deleted: ${data.id}`)
      break
  }
}

/**
 * Handle organization membership events
 */
async function handleOrganizationMembershipEvent(event: WebhookEvent) {
  const { type, data } = event

  switch (type) {
    case 'organizationMembership.created':
    case 'organizationMembership.updated': {
      // Find the user and organization in our database
      const user = await db.user.findUnique({
        where: { clerkId: data.public_user_data.user_id },
      })

      const organization = await db.organization.findUnique({
        where: { clerkId: data.organization.id },
      })

      if (!user || !organization) {
        console.error('User or organization not found for membership event')
        return
      }

      const role = mapClerkRoleToRole(data.role)

      await db.userOrganization.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: organization.id,
          },
        },
        update: { role },
        create: {
          userId: user.id,
          organizationId: organization.id,
          role,
        },
      })

      console.log(`Organization membership ${type.split('.')[1]}: ${user.email} -> ${organization.name} as ${role}`)
      break
    }

    case 'organizationMembership.deleted': {
      const user = await db.user.findUnique({
        where: { clerkId: data.public_user_data.user_id },
      })

      const organization = await db.organization.findUnique({
        where: { clerkId: data.organization.id },
      })

      if (user && organization) {
        await db.userOrganization.delete({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: organization.id,
            },
          },
        })

        console.log(`Organization membership deleted: ${user.email} from ${organization.name}`)
      }
      break
    }
  }
}

/**
 * Main webhook handler for Clerk events
 */
export async function handleClerkWebhook(request: NextRequest): Promise<NextResponse> {
  try {
    const payload = await request.text()
    const headersList = headers()
    
    // Verify the webhook signature
    const event = verifyWebhookSignature(payload, headersList)

    console.log(`Processing webhook event: ${event.type}`)

    // Handle different event types
    if (event.type.startsWith('user.')) {
      await handleUserEvent(event)
    } else if (event.type.startsWith('organization.') && !event.type.includes('Membership')) {
      await handleOrganizationEvent(event)
    } else if (event.type.startsWith('organizationMembership.')) {
      await handleOrganizationMembershipEvent(event)
    } else {
      console.log(`Unhandled webhook event type: ${event.type}`)
    }

    return new NextResponse('OK', { status: 200 })

  } catch (error) {
    console.error('Webhook processing error:', error)
    
    if (error instanceof Error && error.message.includes('signature')) {
      return new NextResponse('Invalid signature', { status: 401 })
    }

    return new NextResponse('Internal server error', { status: 500 })
  }
}

/**
 * Rate limiting for webhook endpoints
 */
const webhookRateLimiter = new Map<string, { count: number; resetTime: number }>()

export function checkWebhookRateLimit(identifier: string): boolean {
  const now = Date.now()
  const windowMs = 60 * 1000 // 1 minute
  const limit = 100 // 100 requests per minute

  const current = webhookRateLimiter.get(identifier)

  if (!current || now > current.resetTime) {
    webhookRateLimiter.set(identifier, {
      count: 1,
      resetTime: now + windowMs,
    })
    return true
  }

  if (current.count >= limit) {
    return false
  }

  current.count++
  return true
}

/**
 * Middleware for webhook security and rate limiting
 */
export function withWebhookSecurity(handler: (request: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const clientIp = request.ip || request.headers.get('x-forwarded-for') || 'unknown'

    // Check rate limit
    if (!checkWebhookRateLimit(clientIp)) {
      console.warn(`Webhook rate limit exceeded for IP: ${clientIp}`)
      return new NextResponse('Rate limit exceeded', { status: 429 })
    }

    // Validate method
    if (request.method !== 'POST') {
      return new NextResponse('Method not allowed', { status: 405 })
    }

    // Validate content type
    const contentType = request.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      return new NextResponse('Invalid content type', { status: 400 })
    }

    return handler(request)
  }
}

/**
 * Create organization invitation
 */
export async function createOrganizationInvitation(data: {
  email: string
  role: Role
  organizationId: string
  invitedById: string
}) {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  return await db.organizationInvitation.create({
    data: {
      ...data,
      token,
      expiresAt,
    },
  })
}

/**
 * Accept organization invitation
 */
export async function acceptOrganizationInvitation(token: string, userId: string) {
  const invitation = await db.organizationInvitation.findUnique({
    where: { token },
    include: { organization: true },
  })

  if (!invitation) {
    throw new Error('Invalid invitation token')
  }

  if (invitation.expiresAt < new Date()) {
    throw new Error('Invitation has expired')
  }

  if (invitation.acceptedAt) {
    throw new Error('Invitation has already been accepted')
  }

  // Create user-organization relationship
  await db.$transaction(async (tx) => {
    await tx.userOrganization.create({
      data: {
        userId,
        organizationId: invitation.organizationId,
        role: invitation.role,
      },
    })

    await tx.organizationInvitation.update({
      where: { token },
      data: {
        acceptedAt: new Date(),
        acceptedById: userId,
      },
    })
  })

  return invitation
}