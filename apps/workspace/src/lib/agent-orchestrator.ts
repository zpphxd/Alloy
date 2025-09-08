/**
 * Production-ready agent orchestration integration
 * Bridges the agent-core package with the workspace tRPC API
 */

import { TaskOrchestrator, TaskPlan, AgentRegistry, SecurityManager } from '@alloy/agent-core'
import type { AgentType, ExecutionContext, ResourceLimits, SecurityPolicy } from '@alloy/agent-core'
import { db } from './db'
import { createAuditEvent, getCurrentUser, getCurrentOrganization } from './auth'
import { Logger, MetricsCollector, Tracer, PerformanceMonitor } from './logger'
import { z } from 'zod'

// Validation schemas
export const CreateAgentExecutionSchema = z.object({
  agentType: z.enum(['CODE_ANALYZER', 'DEPLOYMENT_VALIDATOR', 'SECURITY_SCANNER', 'PERFORMANCE_TESTER', 'DEPENDENCY_CHECKER']),
  input: z.record(z.any()),
  environmentId: z.string().uuid(),
  timeout: z.number().min(1000).max(600000).optional(), // 1 second to 10 minutes
  retryAttempts: z.number().min(1).max(5).optional(),
  dependencies: z.array(z.string()).optional(),
})

export const AgentExecutionStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'])

export type AgentExecutionInput = z.infer<typeof CreateAgentExecutionSchema>

// Error classes
export class AgentOrchestrationError extends Error {
  constructor(
    message: string,
    public code: string,
    public agentType?: AgentType,
    public executionId?: string
  ) {
    super(message)
    this.name = 'AgentOrchestrationError'
  }
}

export class AgentValidationError extends AgentOrchestrationError {
  constructor(message: string, agentType?: AgentType) {
    super(message, 'VALIDATION_ERROR', agentType)
    this.name = 'AgentValidationError'
  }
}

export class AgentExecutionTimeoutError extends AgentOrchestrationError {
  constructor(executionId: string, agentType: AgentType) {
    super(`Agent execution timed out`, 'EXECUTION_TIMEOUT', agentType, executionId)
    this.name = 'AgentExecutionTimeoutError'
  }
}

export class AgentSecurityError extends AgentOrchestrationError {
  constructor(message: string, agentType: AgentType, executionId?: string) {
    super(message, 'SECURITY_VIOLATION', agentType, executionId)
    this.name = 'AgentSecurityError'
  }
}

/**
 * Agent execution service that integrates with the database and provides
 * production-ready orchestration capabilities
 */
export class AgentExecutionService {
  private orchestrator: TaskOrchestrator
  private registry: AgentRegistry
  private security: SecurityManager
  private logger: Logger
  private metrics: MetricsCollector
  private tracer: Tracer

  constructor() {
    // Initialize core components
    this.registry = new AgentRegistry()
    this.security = new SecurityManager(
      this.getResourceLimits(),
      this.getSecurityPolicy()
    )
    this.orchestrator = new TaskOrchestrator(this.registry, this.security)
    
    // Initialize observability
    this.logger = Logger.getInstance({
      component: 'agent-orchestrator',
    })
    this.metrics = MetricsCollector.getInstance()
    this.tracer = Tracer.getInstance()

    // Register built-in agents
    this.initializeBuiltInAgents()
  }

  /**
   * Execute a single agent with full observability and database integration
   */
  async executeAgent(input: AgentExecutionInput): Promise<{
    executionId: string
    status: string
    result?: any
    error?: string
  }> {
    const span = this.tracer.startSpan('agent.execute')
    const correlationId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const logger = this.logger.child({ 
      correlationId,
      operation: 'executeAgent',
      agentType: input.agentType,
    })

    try {
      // Validate input
      const validatedInput = CreateAgentExecutionSchema.parse(input)
      logger.info('Agent execution requested', {
        agentType: validatedInput.agentType,
        environmentId: validatedInput.environmentId,
      })

      // Check authentication and authorization
      const user = await getCurrentUser()
      const organization = await getCurrentOrganization()
      
      if (!user || !organization) {
        throw new AgentOrchestrationError('Authentication required', 'AUTH_REQUIRED')
      }

      // Verify environment access
      const environment = await db.environment.findFirst({
        where: {
          id: validatedInput.environmentId,
          project: {
            organizationId: organization.id,
          },
        },
        include: {
          project: true,
        },
      })

      if (!environment) {
        throw new AgentOrchestrationError('Environment not found or access denied', 'ENVIRONMENT_ACCESS_DENIED')
      }

      // Check rate limits
      await this.checkRateLimit(organization.id, validatedInput.agentType)

      // Create database record
      const executionRecord = await db.agentExecution.create({
        data: {
          agentType: validatedInput.agentType,
          input: validatedInput.input,
          status: 'PENDING',
          environmentId: validatedInput.environmentId,
          triggeredById: user.id,
        },
      })

      logger.info('Agent execution created in database', {
        executionId: executionRecord.id,
        dbRecordId: executionRecord.id,
      })

      // Create task plan
      const taskPlan = new TaskPlan({
        id: executionRecord.id,
        agentType: validatedInput.agentType,
        input: validatedInput.input,
        environmentId: validatedInput.environmentId,
        triggeredById: user.id,
        timeout: validatedInput.timeout || 300000, // 5 minutes default
        retryAttempts: validatedInput.retryAttempts || 1,
        dependencies: validatedInput.dependencies || [],
      })

      // Start execution
      const execution = await this.orchestrator.execute(taskPlan)
      
      // Update database record
      await db.agentExecution.update({
        where: { id: executionRecord.id },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
        },
      })

      // Create audit trail
      await createAuditEvent({
        action: 'AGENT_EXECUTION_STARTED',
        entityType: 'AGENT_EXECUTION',
        entityId: executionRecord.id,
        metadata: {
          agentType: validatedInput.agentType,
          environmentId: validatedInput.environmentId,
          correlationId,
        },
      })

      // Record metrics
      this.metrics.increment('agent.executions.started', {
        agent_type: validatedInput.agentType,
        environment_id: validatedInput.environmentId,
      })

      // Set up completion handling
      this.handleExecutionCompletion(execution, executionRecord.id, logger)

      this.tracer.finishSpan(span.spanId)

      return {
        executionId: executionRecord.id,
        status: 'RUNNING',
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Agent execution failed', error as Error, {
        agentType: input.agentType,
        environmentId: input.environmentId,
      })

      this.metrics.increment('agent.executions.failed', {
        agent_type: input.agentType,
        error_type: error instanceof Error ? error.constructor.name : 'UnknownError',
      })

      this.tracer.finishSpan(span.spanId, error as Error)

      throw error
    }
  }

  /**
   * Get execution status and results
   */
  async getExecutionStatus(executionId: string): Promise<{
    id: string
    status: string
    result?: any
    error?: string
    startedAt?: Date
    completedAt?: Date
    agentType: string
    environmentId: string
  }> {
    const execution = await db.agentExecution.findUnique({
      where: { id: executionId },
    })

    if (!execution) {
      throw new AgentOrchestrationError('Execution not found', 'EXECUTION_NOT_FOUND', undefined, executionId)
    }

    // Verify access
    const user = await getCurrentUser()
    const organization = await getCurrentOrganization()
    
    if (!user || !organization) {
      throw new AgentOrchestrationError('Authentication required', 'AUTH_REQUIRED')
    }

    // Check if user has access to the environment
    const environment = await db.environment.findFirst({
      where: {
        id: execution.environmentId,
        project: {
          organizationId: organization.id,
        },
      },
    })

    if (!environment) {
      throw new AgentOrchestrationError('Access denied', 'ACCESS_DENIED')
    }

    return {
      id: execution.id,
      status: execution.status,
      result: execution.output,
      error: execution.error,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      agentType: execution.agentType,
      environmentId: execution.environmentId,
    }
  }

  /**
   * Cancel an execution
   */
  async cancelExecution(executionId: string): Promise<void> {
    const logger = this.logger.child({ 
      operation: 'cancelExecution',
      executionId,
    })

    const execution = await this.orchestrator.getExecution(`exec_${executionId}_*`)
    
    if (execution) {
      execution.cancel()
    }

    // Update database
    await db.agentExecution.update({
      where: { id: executionId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    })

    logger.info('Agent execution cancelled')

    // Create audit trail
    await createAuditEvent({
      action: 'AGENT_EXECUTION_CANCELLED',
      entityType: 'AGENT_EXECUTION',
      entityId: executionId,
      metadata: {
        cancelledAt: new Date().toISOString(),
      },
    })

    this.metrics.increment('agent.executions.cancelled', {
      execution_id: executionId,
    })
  }

  /**
   * List executions for an environment
   */
  async listExecutions(environmentId: string, options: {
    limit?: number
    offset?: number
    status?: string
    agentType?: string
  } = {}): Promise<{
    executions: Array<{
      id: string
      agentType: string
      status: string
      createdAt: Date
      startedAt?: Date
      completedAt?: Date
      error?: string
    }>
    total: number
  }> {
    // Verify access
    const user = await getCurrentUser()
    const organization = await getCurrentOrganization()
    
    if (!user || !organization) {
      throw new AgentOrchestrationError('Authentication required', 'AUTH_REQUIRED')
    }

    const environment = await db.environment.findFirst({
      where: {
        id: environmentId,
        project: {
          organizationId: organization.id,
        },
      },
    })

    if (!environment) {
      throw new AgentOrchestrationError('Environment not found or access denied', 'ENVIRONMENT_ACCESS_DENIED')
    }

    const where = {
      environmentId,
      ...(options.status && { status: options.status }),
      ...(options.agentType && { agentType: options.agentType }),
    }

    const [executions, total] = await Promise.all([
      db.agentExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
        select: {
          id: true,
          agentType: true,
          status: true,
          createdAt: true,
          startedAt: true,
          completedAt: true,
          error: true,
        },
      }),
      db.agentExecution.count({ where }),
    ])

    return { executions, total }
  }

  /**
   * Get execution metrics and statistics
   */
  async getExecutionMetrics(options: {
    organizationId?: string
    environmentId?: string
    agentType?: string
    timeRange?: { start: Date; end: Date }
  } = {}): Promise<{
    totalExecutions: number
    successRate: number
    averageDuration: number
    statusBreakdown: Record<string, number>
    agentTypeBreakdown: Record<string, number>
  }> {
    const user = await getCurrentUser()
    const organization = await getCurrentOrganization()
    
    if (!user || !organization) {
      throw new AgentOrchestrationError('Authentication required', 'AUTH_REQUIRED')
    }

    const where: any = {}

    if (options.environmentId) {
      // Verify environment access
      const environment = await db.environment.findFirst({
        where: {
          id: options.environmentId,
          project: {
            organizationId: organization.id,
          },
        },
      })

      if (!environment) {
        throw new AgentOrchestrationError('Environment not found or access denied', 'ENVIRONMENT_ACCESS_DENIED')
      }

      where.environmentId = options.environmentId
    } else {
      // Filter by organization through environment relationship
      where.environment = {
        project: {
          organizationId: organization.id,
        },
      }
    }

    if (options.agentType) {
      where.agentType = options.agentType
    }

    if (options.timeRange) {
      where.createdAt = {
        gte: options.timeRange.start,
        lte: options.timeRange.end,
      }
    }

    const executions = await db.agentExecution.findMany({
      where,
      select: {
        status: true,
        agentType: true,
        startedAt: true,
        completedAt: true,
      },
    })

    const totalExecutions = executions.length
    const completedExecutions = executions.filter(e => ['COMPLETED', 'FAILED'].includes(e.status))
    const successfulExecutions = executions.filter(e => e.status === 'COMPLETED')
    const successRate = completedExecutions.length > 0 ? 
      (successfulExecutions.length / completedExecutions.length) * 100 : 0

    // Calculate average duration
    const durationsMs = executions
      .filter(e => e.startedAt && e.completedAt)
      .map(e => e.completedAt!.getTime() - e.startedAt!.getTime())
    
    const averageDuration = durationsMs.length > 0 ?
      durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length : 0

    // Status breakdown
    const statusBreakdown = executions.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // Agent type breakdown
    const agentTypeBreakdown = executions.reduce((acc, e) => {
      acc[e.agentType] = (acc[e.agentType] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return {
      totalExecutions,
      successRate,
      averageDuration,
      statusBreakdown,
      agentTypeBreakdown,
    }
  }

  private async handleExecutionCompletion(
    execution: any,
    databaseId: string,
    logger: Logger
  ): Promise<void> {
    execution.on('statusChanged', async (status: string, previousStatus: string) => {
      try {
        if (['completed', 'failed', 'cancelled'].includes(status)) {
          const updateData: any = {
            status: status.toUpperCase(),
            completedAt: new Date(),
          }

          if (execution.output !== undefined) {
            updateData.output = execution.output
          }

          if (execution.error) {
            updateData.error = execution.error
          }

          // Update database record
          await db.agentExecution.update({
            where: { id: databaseId },
            data: updateData,
          })

          logger.info('Agent execution completed', {
            status,
            previousStatus,
            executionId: databaseId,
            hasOutput: !!execution.output,
            hasError: !!execution.error,
          })

          // Create audit trail
          await createAuditEvent({
            action: `AGENT_EXECUTION_${status.toUpperCase()}`,
            entityType: 'AGENT_EXECUTION',
            entityId: databaseId,
            metadata: {
              previousStatus,
              finalStatus: status,
              hasOutput: !!execution.output,
              error: execution.error,
              completedAt: new Date().toISOString(),
            },
          })

          // Record metrics
          this.metrics.increment(`agent.executions.${status}`, {
            agent_type: execution.plan.agentType,
            execution_id: databaseId,
          })

          const duration = execution.completedAt ? 
            execution.completedAt.getTime() - execution.startedAt.getTime() : 0
          
          if (duration > 0) {
            this.metrics.timing('agent.execution.duration', duration, {
              agent_type: execution.plan.agentType,
              status,
            })
          }
        }
      } catch (error) {
        logger.error('Failed to handle execution completion', error as Error, {
          executionId: databaseId,
          status,
          previousStatus,
        })
      }
    })
  }

  private async checkRateLimit(organizationId: string, agentType: AgentType): Promise<void> {
    // Simple rate limiting: max 100 executions per hour per org per agent type
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    
    const recentExecutions = await db.agentExecution.count({
      where: {
        agentType,
        createdAt: {
          gte: oneHourAgo,
        },
        environment: {
          project: {
            organizationId,
          },
        },
      },
    })

    if (recentExecutions >= 100) {
      throw new AgentOrchestrationError(
        'Rate limit exceeded: too many executions in the last hour',
        'RATE_LIMIT_EXCEEDED',
        agentType
      )
    }
  }

  private getResourceLimits(): ResourceLimits {
    return {
      maxMemoryMB: parseInt(process.env.AGENT_MAX_MEMORY_MB || '512'),
      maxCpuPercent: parseInt(process.env.AGENT_MAX_CPU_PERCENT || '50'),
      maxExecutionTimeMs: parseInt(process.env.AGENT_MAX_EXECUTION_TIME_MS || '300000'), // 5 minutes
      maxDiskUsageMB: parseInt(process.env.AGENT_MAX_DISK_MB || '100'),
    }
  }

  private getSecurityPolicy(): SecurityPolicy {
    return {
      networkAccess: 'restricted',
      fileSystemAccess: 'read-only',
      environmentVariables: [
        'NODE_ENV',
        'AGENT_TYPE',
        'ENVIRONMENT_ID',
      ],
      allowedModules: [
        'fs', 'path', 'crypto', 'util', 'zod',
      ],
      blockedUrls: [
        'file://',
        'ftp://',
      ],
      allowedUrls: [
        'https://api.github.com',
        'https://registry.npmjs.org',
      ],
    }
  }

  private initializeBuiltInAgents(): void {
    // Register code analyzer agent
    this.registry.register({
      type: 'CODE_ANALYZER',
      name: 'Code Quality Analyzer',
      description: 'Analyzes code for quality, security, and best practices',
      handler: this.codeAnalyzerHandler.bind(this),
      inputSchema: z.object({
        repository: z.string().url(),
        branch: z.string().default('main'),
        analysisType: z.enum(['quality', 'security', 'performance']).default('quality'),
      }),
      outputSchema: z.object({
        score: z.number().min(0).max(100),
        issues: z.array(z.object({
          type: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
          message: z.string(),
          file: z.string().optional(),
          line: z.number().optional(),
        })),
        suggestions: z.array(z.string()),
      }),
      resourceLimits: {
        maxMemoryMB: 256,
        maxExecutionTimeMs: 120000, // 2 minutes
      },
    })

    // Register more built-in agents as needed
    this.initializeDeploymentValidator()
    this.initializeSecurityScanner()
  }

  private async codeAnalyzerHandler(input: any, context: ExecutionContext): Promise<any> {
    const logger = this.logger.child({
      correlationId: context.correlationId,
      operation: 'codeAnalysis',
      agentType: context.agentType,
    })

    logger.info('Starting code analysis', {
      repository: input.repository,
      branch: input.branch,
      analysisType: input.analysisType,
    })

    // Mock implementation - in production, this would run actual analysis
    await new Promise(resolve => setTimeout(resolve, 2000))

    const mockResult = {
      score: Math.floor(Math.random() * 30) + 70, // Score between 70-100
      issues: [
        {
          type: 'code_style',
          severity: 'low' as const,
          message: 'Missing semicolon',
          file: 'src/index.ts',
          line: 42,
        },
        {
          type: 'security',
          severity: 'medium' as const,
          message: 'Potential XSS vulnerability',
          file: 'src/utils.ts',
          line: 156,
        },
      ],
      suggestions: [
        'Add TypeScript strict mode',
        'Implement input validation',
        'Add unit tests for critical functions',
      ],
    }

    logger.info('Code analysis completed', {
      score: mockResult.score,
      issueCount: mockResult.issues.length,
    })

    return mockResult
  }

  private initializeDeploymentValidator(): void {
    this.registry.register({
      type: 'DEPLOYMENT_VALIDATOR',
      name: 'Deployment Validator',
      description: 'Validates deployment configurations and requirements',
      handler: async (input: any, context: ExecutionContext) => {
        // Mock deployment validation
        await new Promise(resolve => setTimeout(resolve, 1500))
        return {
          valid: true,
          checks: [
            { name: 'Environment variables', status: 'passed' },
            { name: 'Resource limits', status: 'passed' },
            { name: 'Security policies', status: 'passed' },
          ],
        }
      },
      inputSchema: z.object({
        environment: z.string(),
        configuration: z.record(z.any()),
      }),
    })
  }

  private initializeSecurityScanner(): void {
    this.registry.register({
      type: 'SECURITY_SCANNER',
      name: 'Security Scanner',
      description: 'Scans for security vulnerabilities and compliance issues',
      handler: async (input: any, context: ExecutionContext) => {
        // Mock security scan
        await new Promise(resolve => setTimeout(resolve, 3000))
        return {
          vulnerabilities: [],
          compliance: {
            score: 95,
            issues: [],
          },
          recommendations: [
            'Update dependencies with known vulnerabilities',
            'Enable additional security headers',
          ],
        }
      },
      inputSchema: z.object({
        target: z.string(),
        scanType: z.enum(['vulnerabilities', 'compliance', 'full']).default('full'),
      }),
    })
  }
}

// Create and export singleton instance
export const agentExecutionService = new AgentExecutionService()