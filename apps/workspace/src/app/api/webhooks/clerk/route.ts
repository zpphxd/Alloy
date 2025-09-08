import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { syncUserFromClerk, syncOrganizationFromClerk, createAuditEvent } from '@/lib/auth';

/**
 * Clerk webhook handler for syncing users and organizations
 * Handles: user.created, user.updated, user.deleted, organization.created, organization.updated, organization.deleted
 */

// Types for Clerk webhook events
interface ClerkUser {
  id: string
  email_addresses: Array<{ email_address: string }>
  first_name: string | null
  last_name: string | null
  image_url: string | null
  created_at: number
  updated_at: number
}

interface ClerkOrganization {
  id: string
  name: string
  slug: string
  image_url: string | null
  created_at: number
  updated_at: number
}

interface ClerkOrganizationMembership {
  id: string
  user_id: string
  organization_id: string
  role: string
  created_at: number
  updated_at: number
}

const webhookSecret = process.env.CLERK_WEBHOOK_SECRET!

if (!webhookSecret) {
  throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env')
}

/**
 * Map Clerk role to our Role enum
 */
function mapClerkRole(clerkRole: string) {
  switch (clerkRole) {
    case 'org:admin':
      return 'OWNER'
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
  const eventType = event.type
  const userData = event.data as ClerkUser

  console.log(`[Webhook] Processing user event: ${eventType}`, {
    userId: userData.id,
    email: userData.email_addresses?.[0]?.email_address,
  })

  try {
    switch (eventType) {
      case 'user.created':
      case 'user.updated':
        await syncUserFromClerk(userData)
        
        await createAuditEvent({
          action: eventType === 'user.created' ? 'USER_CREATED' : 'USER_UPDATED',
          entityType: 'USER',
          entityId: userData.id,
          metadata: {
            email: userData.email_addresses?.[0]?.email_address,
            source: 'clerk_webhook',
          },
        })
        break

      case 'user.deleted':
        const deletedUser = await db.user.findUnique({
          where: { clerkId: userData.id },
        })

        if (deletedUser) {
          // Soft delete by marking as deleted
          await db.user.update({
            where: { clerkId: userData.id },
            data: {
              email: `deleted-${deletedUser.id}@deleted.local`,
              firstName: null,
              lastName: null,
              avatarUrl: null,
            },
          })

          await createAuditEvent({
            action: 'USER_DELETED',
            entityType: 'USER',
            entityId: userData.id,
            metadata: {
              originalEmail: deletedUser.email,
              source: 'clerk_webhook',
            },
          })
        }
        break

      default:
        console.log(`[Webhook] Unhandled user event: ${eventType}`)
    }
  } catch (error) {
    console.error(`[Webhook] Error processing user event ${eventType}:`, error)
    throw error
  }
}

/**
 * Handle organization-related webhook events
 */
async function handleOrganizationEvent(event: WebhookEvent) {
  const eventType = event.type
  const orgData = event.data as ClerkOrganization

  console.log(`[Webhook] Processing organization event: ${eventType}`, {
    orgId: orgData.id,
    name: orgData.name,
    slug: orgData.slug,
  })

  try {
    switch (eventType) {
      case 'organization.created':
      case 'organization.updated':
        await syncOrganizationFromClerk(orgData)
        
        await createAuditEvent({
          action: eventType === 'organization.created' ? 'ORGANIZATION_CREATED' : 'ORGANIZATION_UPDATED',
          entityType: 'ORGANIZATION',
          entityId: orgData.id,
          metadata: {
            name: orgData.name,
            slug: orgData.slug,
            source: 'clerk_webhook',
          },
        })
        break

      case 'organization.deleted':
        const deletedOrg = await db.organization.findUnique({
          where: { clerkId: orgData.id },
        })

        if (deletedOrg) {
          console.warn(`[Webhook] Organization deletion requested: ${orgData.name}`)
          
          await createAuditEvent({
            action: 'ORGANIZATION_DELETION_REQUESTED',
            entityType: 'ORGANIZATION',
            entityId: orgData.id,
            metadata: {
              originalName: deletedOrg.name,
              originalSlug: deletedOrg.slug,
              source: 'clerk_webhook',
              warning: 'Organization deletion requires manual intervention',
            },
          })
        }
        break

      default:
        console.log(`[Webhook] Unhandled organization event: ${eventType}`)
    }
  } catch (error) {
    console.error(`[Webhook] Error processing organization event ${eventType}:`, error)
    throw error
  }
}

/**
 * Handle organization membership events
 */
async function handleOrganizationMembershipEvent(event: WebhookEvent) {
  const eventType = event.type
  const membershipData = event.data as ClerkOrganizationMembership

  console.log(`[Webhook] Processing membership event: ${eventType}`, {
    userId: membershipData.user_id,
    orgId: membershipData.organization_id,
    role: membershipData.role,
  })

  try {
    // Find the user and organization in our database
    const [user, organization] = await Promise.all([
      db.user.findUnique({ where: { clerkId: membershipData.user_id } }),
      db.organization.findUnique({ where: { clerkId: membershipData.organization_id } }),
    ])

    if (!user || !organization) {
      console.error(`[Webhook] Missing user or organization for membership event`, {
        foundUser: !!user,
        foundOrganization: !!organization,
      })
      return
    }

    const mappedRole = mapClerkRole(membershipData.role)

    switch (eventType) {
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await db.userOrganization.upsert({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: organization.id,
            },
          },
          update: {
            role: mappedRole,
          },
          create: {
            userId: user.id,
            organizationId: organization.id,
            role: mappedRole,
          },
        })

        await createAuditEvent({
          action: eventType === 'organizationMembership.created' ? 'MEMBERSHIP_CREATED' : 'MEMBERSHIP_UPDATED',
          entityType: 'ORGANIZATION_MEMBERSHIP',
          entityId: membershipData.id,
          metadata: {
            userId: user.id,
            organizationId: organization.id,
            role: mappedRole,
            clerkRole: membershipData.role,
            source: 'clerk_webhook',
          },
        })
        break

      case 'organizationMembership.deleted':
        await db.userOrganization.delete({
          where: {
            userId_organizationId: {
              userId: user.id,
              organizationId: organization.id,
            },
          },
        })

        await createAuditEvent({
          action: 'MEMBERSHIP_DELETED',
          entityType: 'ORGANIZATION_MEMBERSHIP',
          entityId: membershipData.id,
          metadata: {
            userId: user.id,
            organizationId: organization.id,
            source: 'clerk_webhook',
          },
        })
        break

      default:
        console.log(`[Webhook] Unhandled membership event: ${eventType}`)
    }
  } catch (error) {
    console.error(`[Webhook] Error processing membership event ${eventType}:`, error)
    throw error
  }
}

export async function POST(req: NextRequest) {
  // Get the headers
  const headerPayload = headers()
  const svix_id = headerPayload.get('svix-id')
  const svix_timestamp = headerPayload.get('svix-timestamp')
  const svix_signature = headerPayload.get('svix-signature')

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return NextResponse.json(
      { error: 'Error occurred -- missing svix headers' },
      { status: 400 }
    )
  }

  // Get the body
  const body = await req.text()

  // Create a new Svix instance with your webhook secret
  const wh = new Webhook(webhookSecret)

  let evt: WebhookEvent

  // Verify the webhook
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent
  } catch (err) {
    console.error('Error verifying webhook:', err)
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    )
  }

  // Log the event
  console.log(`[Webhook] Received ${evt.type} event`, {
    eventId: svix_id,
    timestamp: svix_timestamp,
  })

  try {
    // Handle different event types
    if (evt.type.startsWith('user.')) {
      await handleUserEvent(evt)
    } else if (evt.type.startsWith('organization.') && !evt.type.includes('membership')) {
      await handleOrganizationEvent(evt)
    } else if (evt.type.startsWith('organizationMembership.')) {
      await handleOrganizationMembershipEvent(evt)
    } else {
      console.log(`[Webhook] Unhandled event type: ${evt.type}`)
    }

    // Return success response
    return NextResponse.json({
      received: true,
      eventType: evt.type,
      eventId: svix_id,
    })
  } catch (error) {
    console.error(`[Webhook] Error processing ${evt.type}:`, error)
    
    // Create audit event for webhook errors
    try {
      await createAuditEvent({
        action: 'WEBHOOK_ERROR',
        entityType: 'WEBHOOK',
        entityId: svix_id,
        metadata: {
          eventType: evt.type,
          error: error instanceof Error ? error.message : 'Unknown error',
          source: 'clerk_webhook',
        },
      })
    } catch (auditError) {
      console.error('[Webhook] Failed to create audit event for error:', auditError)
    }

    return NextResponse.json(
      { 
        error: 'Internal server error',
        eventType: evt.type,
        eventId: svix_id,
      },
      { status: 500 }
    )
  }
}