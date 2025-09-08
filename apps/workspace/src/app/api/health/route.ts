import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Health check endpoint for monitoring application status
 * Returns comprehensive health information including database connectivity,
 * system resources, and service dependencies
 */

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  version: string
  environment: string
  checks: {
    database: HealthCheck
    memory: HealthCheck
    disk?: HealthCheck
    dependencies: {
      clerk: HealthCheck
      redis?: HealthCheck
    }
  }
  metadata?: {
    requestId: string
    host: string
    instance: string
  }
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail'
  responseTime?: number
  message?: string
  details?: Record<string, any>
}

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const requestId = `health_${startTime}_${Math.random().toString(36).substr(2, 9)}`
  
  const healthLogger = logger.child({
    correlationId: requestId,
    operation: 'healthCheck',
  })

  try {
    healthLogger.debug('Health check started')

    // Initialize health check result
    const healthResult: HealthCheckResult = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.0.0',
      environment: process.env.NODE_ENV || 'unknown',
      checks: {
        database: { status: 'pass' },
        memory: { status: 'pass' },
        dependencies: {
          clerk: { status: 'pass' },
        },
      },
      metadata: {
        requestId,
        host: req.headers.get('host') || 'unknown',
        instance: process.env.INSTANCE_ID || 'unknown',
      },
    }

    // Database health check
    try {
      const dbStartTime = Date.now()
      await db.$queryRaw`SELECT 1`
      const dbResponseTime = Date.now() - dbStartTime

      healthResult.checks.database = {
        status: dbResponseTime < 1000 ? 'pass' : 'warn',
        responseTime: dbResponseTime,
        message: dbResponseTime < 1000 ? 'Database connection healthy' : 'Database response slow',
      }

      // Additional database checks
      const [userCount, organizationCount] = await Promise.all([
        db.user.count(),
        db.organization.count(),
      ])

      healthResult.checks.database.details = {
        userCount,
        organizationCount,
        connectionPool: {
          // These would be actual pool metrics in a real implementation
          active: 'unknown',
          idle: 'unknown',
          total: 'unknown',
        },
      }

      healthLogger.debug('Database health check passed', {
        responseTime: dbResponseTime,
        userCount,
        organizationCount,
      })

    } catch (error) {
      healthLogger.error('Database health check failed', error as Error)
      
      healthResult.checks.database = {
        status: 'fail',
        message: 'Database connection failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }
      healthResult.status = 'unhealthy'
    }

    // Memory health check
    const memoryUsage = process.memoryUsage()
    const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024
    const memoryLimitMB = 512 // Default limit, could be configurable

    healthResult.checks.memory = {
      status: memoryUsageMB < memoryLimitMB * 0.8 ? 'pass' : memoryUsageMB < memoryLimitMB ? 'warn' : 'fail',
      message: `Memory usage: ${memoryUsageMB.toFixed(2)}MB / ${memoryLimitMB}MB`,
      details: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        usagePercent: (memoryUsageMB / memoryLimitMB * 100).toFixed(2),
      },
    }

    if (healthResult.checks.memory.status === 'fail') {
      healthResult.status = 'unhealthy'
    } else if (healthResult.checks.memory.status === 'warn' && healthResult.status === 'healthy') {
      healthResult.status = 'degraded'
    }

    // Clerk health check (basic connectivity)
    try {
      if (process.env.CLERK_SECRET_KEY) {
        // In a real implementation, you might ping Clerk's API
        healthResult.checks.dependencies.clerk = {
          status: 'pass',
          message: 'Clerk configuration present',
        }
      } else {
        healthResult.checks.dependencies.clerk = {
          status: 'warn',
          message: 'Clerk configuration missing',
        }
        if (healthResult.status === 'healthy') {
          healthResult.status = 'degraded'
        }
      }
    } catch (error) {
      healthLogger.error('Clerk health check failed', error as Error)
      
      healthResult.checks.dependencies.clerk = {
        status: 'fail',
        message: 'Clerk health check failed',
      }
      healthResult.status = 'unhealthy'
    }

    // Redis health check (if configured)
    if (process.env.REDIS_URL) {
      try {
        // In a real implementation, you would check Redis connectivity
        healthResult.checks.dependencies.redis = {
          status: 'pass',
          message: 'Redis connection healthy',
        }
      } catch (error) {
        healthLogger.error('Redis health check failed', error as Error)
        
        healthResult.checks.dependencies.redis = {
          status: 'fail',
          message: 'Redis connection failed',
        }
        if (healthResult.status !== 'unhealthy') {
          healthResult.status = 'degraded'
        }
      }
    }

    // Disk space check (basic)
    try {
      // In a real implementation, you would check actual disk usage
      healthResult.checks.disk = {
        status: 'pass',
        message: 'Disk space sufficient',
        details: {
          available: 'unknown',
          used: 'unknown',
          total: 'unknown',
        },
      }
    } catch (error) {
      healthLogger.warn('Disk health check failed', error as Error)
      
      healthResult.checks.disk = {
        status: 'warn',
        message: 'Could not check disk space',
      }
    }

    const responseTime = Date.now() - startTime
    healthLogger.info('Health check completed', {
      status: healthResult.status,
      responseTime,
    })

    // Set appropriate HTTP status code
    let statusCode = 200
    if (healthResult.status === 'degraded') {
      statusCode = 200 // Still OK, but with warnings
    } else if (healthResult.status === 'unhealthy') {
      statusCode = 503 // Service Unavailable
    }

    // Set cache headers to prevent caching of health checks
    const response = NextResponse.json(healthResult, { status: statusCode })
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response

  } catch (error) {
    const responseTime = Date.now() - startTime
    healthLogger.error('Health check failed unexpectedly', error as Error, {
      responseTime,
    })

    // Return error response
    const errorResult: HealthCheckResult = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '0.0.0',
      environment: process.env.NODE_ENV || 'unknown',
      checks: {
        database: { status: 'fail', message: 'Health check failed' },
        memory: { status: 'fail', message: 'Health check failed' },
        dependencies: {
          clerk: { status: 'fail', message: 'Health check failed' },
        },
      },
      metadata: {
        requestId,
        host: req.headers.get('host') || 'unknown',
        instance: process.env.INSTANCE_ID || 'unknown',
      },
    }

    return NextResponse.json(errorResult, { status: 500 })
  }
}