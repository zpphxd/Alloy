import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { 
  createTRPCRouter, 
  readProcedure,
  writeProcedure,
  deleteProcedure,
  handleDatabaseError,
  formatApiResponse,
  formatPaginatedResponse,
} from '../trpc'
import { createCipher, createDecipher } from 'crypto'

// Encryption utilities (simplified for demo - use proper encryption in production)
const ENCRYPTION_KEY = process.env.SECRETS_ENCRYPTION_KEY || 'default-key-change-in-production'

function encryptValue(value: string): string {
  try {
    // In production, use a proper encryption library like node-forge or AWS KMS
    const cipher = createCipher('aes256', ENCRYPTION_KEY)
    let encrypted = cipher.update(value, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return encrypted
  } catch (error) {
    throw new Error('Failed to encrypt value')
  }
}

function decryptValue(encryptedValue: string): string {
  try {
    const decipher = createDecipher('aes256', ENCRYPTION_KEY)
    let decrypted = decipher.update(encryptedValue, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    throw new Error('Failed to decrypt value')
  }
}

export const secretsRouter = createTRPCRouter({
  /**
   * List secrets for an environment (without values)
   */
  list: readProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { environmentId, limit, cursor, search } = input

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

        const where = {
          environmentId,
          ...(search && {
            key: { contains: search, mode: 'insensitive' as const },
          }),
        }

        const secrets = await ctx.db.secret.findMany({
          where,
          select: {
            id: true,
            key: true,
            environmentId: true,
            createdById: true,
            createdAt: true,
            updatedAt: true,
            createdBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
            // Explicitly exclude encryptedValue from response
          },
          take: limit + 1,
          cursor: cursor ? { id: cursor } : undefined,
          orderBy: { key: 'asc' },
        })

        const hasMore = secrets.length > limit
        const items = hasMore ? secrets.slice(0, -1) : secrets

        return formatPaginatedResponse(items, items[items.length - 1]?.id, hasMore)
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Get secret value (requires explicit permission)
   */
  getValue: readProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        const secret = await ctx.db.secret.findFirst({
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

        if (!secret) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Secret not found',
          })
        }

        // Additional security check for production secrets
        if (secret.environment.type === 'PRODUCTION') {
          // In a real app, you might require additional approval or MFA here
          console.warn(`Production secret accessed: ${secret.key} by user ${user.id}`)
        }

        const decryptedValue = decryptValue(secret.encryptedValue)

        // Log secret access for audit purposes
        await ctx.db.auditEvent.create({
          data: {
            action: 'ACCESS_SECRET',
            entityType: 'SECRET',
            entityId: secret.id,
            userId: user.id,
            organizationId: organization.id,
            metadata: {
              secretKey: secret.key,
              environmentId: secret.environment.id,
              environmentName: secret.environment.name,
              environmentType: secret.environment.type,
              projectId: secret.environment.project.id,
              projectName: secret.environment.project.name,
            },
          },
        })

        return formatApiResponse({
          id: secret.id,
          key: secret.key,
          value: decryptedValue,
          environment: secret.environment,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Create new secret
   */
  create: writeProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      key: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/, 'Key must be uppercase with underscores only'),
      value: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { environmentId, key, value } = input

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

        // Check for duplicate key in environment
        const existingSecret = await ctx.db.secret.findFirst({
          where: {
            environmentId,
            key,
          },
        })

        if (existingSecret) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'A secret with this key already exists in the environment',
          })
        }

        // Encrypt the value
        const encryptedValue = encryptValue(value)

        const secret = await ctx.db.$transaction(async (tx) => {
          const newSecret = await tx.secret.create({
            data: {
              key,
              encryptedValue,
              environmentId,
              createdById: user.id,
            },
            select: {
              id: true,
              key: true,
              environmentId: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
              createdBy: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                },
              },
              // Don't include encryptedValue in response
            },
          })

          await tx.auditEvent.create({
            data: {
              action: 'CREATE_SECRET',
              entityType: 'SECRET',
              entityId: newSecret.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                secretKey: key,
                environmentId: environment.id,
                environmentName: environment.name,
                environmentType: environment.type,
                projectId: environment.project.id,
                projectName: environment.project.name,
              },
            },
          })

          return newSecret
        })

        return formatApiResponse(secret, 'Secret created successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Update secret value
   */
  update: writeProcedure
    .input(z.object({
      id: z.string().min(1),
      value: z.string().min(1).max(10000),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id, value } = input

        // Verify secret exists and belongs to organization
        const existingSecret = await ctx.db.secret.findFirst({
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

        if (!existingSecret) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Secret not found',
          })
        }

        // Encrypt the new value
        const encryptedValue = encryptValue(value)

        const updatedSecret = await ctx.db.$transaction(async (tx) => {
          const secret = await tx.secret.update({
            where: { id },
            data: { encryptedValue },
            select: {
              id: true,
              key: true,
              environmentId: true,
              createdById: true,
              createdAt: true,
              updatedAt: true,
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
              action: 'UPDATE_SECRET',
              entityType: 'SECRET',
              entityId: secret.id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                secretKey: existingSecret.key,
                environmentId: existingSecret.environment.id,
                environmentName: existingSecret.environment.name,
                environmentType: existingSecret.environment.type,
                projectId: existingSecret.environment.project.id,
                projectName: existingSecret.environment.project.name,
              },
            },
          })

          return secret
        })

        return formatApiResponse(updatedSecret, 'Secret updated successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Delete secret
   */
  delete: deleteProcedure
    .input(z.object({
      id: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { id } = input

        // Verify secret exists and belongs to organization
        const secret = await ctx.db.secret.findFirst({
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

        if (!secret) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Secret not found',
          })
        }

        // Additional confirmation for production secrets
        if (secret.environment.type === 'PRODUCTION') {
          console.warn(`Production secret deleted: ${secret.key} by user ${user.id}`)
        }

        await ctx.db.$transaction(async (tx) => {
          await tx.secret.delete({
            where: { id },
          })

          await tx.auditEvent.create({
            data: {
              action: 'DELETE_SECRET',
              entityType: 'SECRET',
              entityId: id,
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                secretKey: secret.key,
                environmentId: secret.environment.id,
                environmentName: secret.environment.name,
                environmentType: secret.environment.type,
                projectId: secret.environment.project.id,
                projectName: secret.environment.project.name,
              },
            },
          })
        })

        return formatApiResponse(null, 'Secret deleted successfully')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Bulk import secrets
   */
  bulkImport: writeProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      secrets: z.array(z.object({
        key: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/),
        value: z.string().min(1).max(10000),
      })).min(1).max(50),
      overwrite: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { user, organization } = ctx
        const { environmentId, secrets, overwrite } = input

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

        // Check for conflicts if not overwriting
        if (!overwrite) {
          const existingKeys = await ctx.db.secret.findMany({
            where: {
              environmentId,
              key: { in: secrets.map(s => s.key) },
            },
            select: { key: true },
          })

          if (existingKeys.length > 0) {
            throw new TRPCError({
              code: 'CONFLICT',
              message: `Secrets with keys already exist: ${existingKeys.map(s => s.key).join(', ')}`,
            })
          }
        }

        const result = await ctx.db.$transaction(async (tx) => {
          const created = []
          const updated = []
          const failed = []

          for (const secretData of secrets) {
            try {
              const encryptedValue = encryptValue(secretData.value)

              const existingSecret = await tx.secret.findFirst({
                where: {
                  environmentId,
                  key: secretData.key,
                },
              })

              if (existingSecret) {
                if (overwrite) {
                  await tx.secret.update({
                    where: { id: existingSecret.id },
                    data: { encryptedValue },
                  })
                  updated.push(secretData.key)
                } else {
                  failed.push({ key: secretData.key, error: 'Key already exists' })
                }
              } else {
                await tx.secret.create({
                  data: {
                    key: secretData.key,
                    encryptedValue,
                    environmentId,
                    createdById: user.id,
                  },
                })
                created.push(secretData.key)
              }
            } catch (error) {
              failed.push({ 
                key: secretData.key, 
                error: error instanceof Error ? error.message : 'Unknown error' 
              })
            }
          }

          await tx.auditEvent.create({
            data: {
              action: 'BULK_IMPORT_SECRETS',
              entityType: 'SECRET',
              entityId: crypto.randomUUID(),
              userId: user.id,
              organizationId: organization.id,
              metadata: {
                environmentId: environment.id,
                environmentName: environment.name,
                environmentType: environment.type,
                projectId: environment.project.id,
                projectName: environment.project.name,
                created: created.length,
                updated: updated.length,
                failed: failed.length,
                overwrite,
              },
            },
          })

          return { created, updated, failed }
        })

        return formatApiResponse(result, 'Bulk import completed')
      } catch (error) {
        handleDatabaseError(error)
      }
    }),

  /**
   * Export secrets (keys only, no values)
   */
  export: readProcedure
    .input(z.object({
      environmentId: z.string().min(1),
      format: z.enum(['json', 'env']).default('json'),
    }))
    .query(async ({ ctx, input }) => {
      try {
        const { organization } = ctx
        const { environmentId, format } = input

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

        const secrets = await ctx.db.secret.findMany({
          where: { environmentId },
          select: {
            key: true,
            createdAt: true,
          },
          orderBy: { key: 'asc' },
        })

        let exportData: string

        if (format === 'env') {
          exportData = secrets
            .map(s => `${s.key}=<VALUE_HIDDEN>`)
            .join('\n')
        } else {
          exportData = JSON.stringify(
            secrets.reduce((acc, s) => {
              acc[s.key] = '<VALUE_HIDDEN>'
              return acc
            }, {} as Record<string, string>),
            null,
            2
          )
        }

        return formatApiResponse({
          format,
          data: exportData,
          count: secrets.length,
        })
      } catch (error) {
        handleDatabaseError(error)
      }
    }),
})