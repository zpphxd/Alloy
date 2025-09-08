import { EventEmitter } from 'events'
import { z } from 'zod'

// Type definitions
export type AgentType = 
  | 'CODE_ANALYZER'
  | 'DEPLOYMENT_VALIDATOR'
  | 'SECURITY_SCANNER'
  | 'PERFORMANCE_TESTER'
  | 'DEPENDENCY_CHECKER'

export type TaskStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type NetworkAccessLevel = 'none' | 'restricted' | 'unrestricted'
export type FileSystemAccessLevel = 'none' | 'read-only' | 'read-write'

export interface ResourceLimits {
  maxMemoryMB?: number
  maxCpuPercent?: number
  maxExecutionTimeMs?: number
  maxDiskUsageMB?: number
}

export interface SecurityPolicy {
  networkAccess?: NetworkAccessLevel
  fileSystemAccess?: FileSystemAccessLevel
  environmentVariables?: string[]
  allowedModules?: string[]
  blockedUrls?: string[]
  allowedUrls?: string[]
}

export interface AgentConfig {
  type: AgentType
  version?: string
  name: string
  description?: string
  handler: (input: any, context: ExecutionContext) => Promise<any>
  inputSchema: any // JSON Schema
  outputSchema?: any // JSON Schema
  resourceLimits?: ResourceLimits
  securityPolicy?: SecurityPolicy
  metadata?: Record<string, any>
}

export interface ExecutionContext {
  agentType: AgentType
  input: any
  environmentId: string
  userId: string
  organizationId: string
  sandboxId?: string
  correlationId?: string
}

export interface ResourceUsage {
  memoryUsageMB: number
  cpuUsagePercent: number
  executionTimeMs: number
  diskUsageMB?: number
}

export interface SecurityViolation {
  type: 'RESOURCE_LIMIT_EXCEEDED' | 'NETWORK_ACCESS_DENIED' | 'FILE_ACCESS_DENIED' | 'MODULE_ACCESS_DENIED'
  details: string
  timestamp: Date
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface Sandbox {
  id: string
  agentType: AgentType
  resourceLimits: ResourceLimits
  allowedNetworkAccess: string[]
  blockedPaths: string[]
  environmentVariables: Record<string, string>
  createdAt: Date
}

/**
 * Represents a task plan for agent execution
 */
export class TaskPlan {
  public readonly id: string
  public readonly agentType: AgentType
  public readonly input: any
  public readonly environmentId: string
  public readonly triggeredById: string
  public readonly timeout: number
  public readonly retryAttempts: number
  public readonly dependencies: string[]

  public status: TaskStatus = 'pending'
  public attempts: number = 0
  public output?: any
  public error?: string
  public createdAt: Date = new Date()
  public startedAt?: Date
  public completedAt?: Date

  private static readonly VALID_AGENT_TYPES: AgentType[] = [
    'CODE_ANALYZER',
    'DEPLOYMENT_VALIDATOR',
    'SECURITY_SCANNER',
    'PERFORMANCE_TESTER',
    'DEPENDENCY_CHECKER',
  ]

  private static readonly VALID_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    pending: ['running', 'cancelled'],
    running: ['completed', 'failed', 'cancelled'],
    completed: [],
    failed: ['pending'], // For retries
    cancelled: [],
  }

  constructor(config: {
    id: string
    agentType: AgentType
    input: any
    environmentId: string
    triggeredById: string
    timeout?: number
    retryAttempts?: number
    dependencies?: string[]
  }) {
    if (!config.id?.trim()) {
      throw new Error('Task plan ID is required')
    }

    if (!TaskPlan.VALID_AGENT_TYPES.includes(config.agentType)) {
      throw new Error(`Invalid agent type: ${config.agentType}`)
    }

    this.id = config.id
    this.agentType = config.agentType
    this.input = config.input
    this.environmentId = config.environmentId
    this.triggeredById = config.triggeredById
    this.timeout = config.timeout || 300000 // 5 minutes default
    this.retryAttempts = config.retryAttempts || 1
    this.dependencies = config.dependencies || []
  }

  canTransitionTo(newStatus: TaskStatus): boolean {
    const allowedTransitions = TaskPlan.VALID_STATUS_TRANSITIONS[this.status]
    return allowedTransitions.includes(newStatus)
  }

  updateStatus(newStatus: TaskStatus, output?: any, error?: string): void {
    if (!this.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${this.status} to ${newStatus}`)
    }

    this.status = newStatus
    
    if (newStatus === 'running' && !this.startedAt) {
      this.startedAt = new Date()
      this.attempts++
    }
    
    if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
      this.completedAt = new Date()
      if (output !== undefined) {
        this.output = output
      }
      if (error) {
        this.error = error
      }
    }
  }
}

/**
 * Manages agent registration and discovery
 */
export class AgentRegistry {
  private agents = new Map<AgentType, AgentConfig>()

  async register(config: AgentConfig): Promise<void> {
    // Validate agent configuration
    if (!config.name?.trim()) {
      throw new Error('Agent name is required')
    }

    if (!config.handler || typeof config.handler !== 'function') {
      throw new Error('Agent handler is required and must be a function')
    }

    if (this.agents.has(config.type)) {
      throw new Error(`Agent ${config.type} is already registered`)
    }

    // Store the agent configuration
    this.agents.set(config.type, {
      version: '1.0.0',
      ...config,
    })
  }

  get(agentType: AgentType): AgentConfig | undefined {
    return this.agents.get(agentType)
  }

  list(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  unregister(agentType: AgentType): boolean {
    return this.agents.delete(agentType)
  }

  isRegistered(agentType: AgentType): boolean {
    return this.agents.has(agentType)
  }
}

/**
 * Manages security policies and sandbox environments
 */
export class SecurityManager {
  private sandboxes = new Map<string, Sandbox>()
  private globalLimits: ResourceLimits
  private globalPolicy: SecurityPolicy

  constructor(limits: ResourceLimits, policy?: SecurityPolicy) {
    this.globalLimits = limits
    this.globalPolicy = policy || {
      networkAccess: 'restricted',
      fileSystemAccess: 'read-only',
      environmentVariables: ['NODE_ENV'],
      allowedModules: ['fs', 'path', 'crypto', 'util'],
    }
  }

  async createSandbox(context: ExecutionContext): Promise<Sandbox> {
    const sandboxId = `sandbox_${context.agentType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const sandbox: Sandbox = {
      id: sandboxId,
      agentType: context.agentType,
      resourceLimits: { ...this.globalLimits },
      allowedNetworkAccess: this.globalPolicy.allowedUrls || ['https://api.github.com'],
      blockedPaths: ['/etc', '/var', '/proc', '/sys'],
      environmentVariables: {
        NODE_ENV: 'sandbox',
        AGENT_TYPE: context.agentType,
        ENVIRONMENT_ID: context.environmentId,
        ...this.getEnvironmentVariables(),
      },
      createdAt: new Date(),
    }

    this.sandboxes.set(sandboxId, sandbox)
    return sandbox
  }

  async cleanupSandbox(sandboxId: string): Promise<boolean> {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      return false
    }

    // In a real implementation, this would clean up actual sandbox resources
    // such as containers, temporary files, network namespaces, etc.
    this.sandboxes.delete(sandboxId)
    return true
  }

  async validateAgent(config: AgentConfig): Promise<boolean> {
    // Validate security policy
    if (config.securityPolicy) {
      const policy = config.securityPolicy

      // Check network access restrictions
      if (policy.networkAccess === 'unrestricted') {
        console.warn(`Agent ${config.type} requests unrestricted network access`)
        return false
      }

      // Check file system access
      if (policy.fileSystemAccess === 'read-write') {
        console.warn(`Agent ${config.type} requests write access to file system`)
        return false
      }

      // Validate allowed modules
      if (policy.allowedModules) {
        const dangerousModules = ['child_process', 'cluster', 'dgram', 'net', 'tls']
        const hasDangerousModule = policy.allowedModules.some(mod => dangerousModules.includes(mod))
        if (hasDangerousModule) {
          console.warn(`Agent ${config.type} requests access to potentially dangerous modules`)
          return false
        }
      }
    }

    // Validate resource limits
    if (config.resourceLimits) {
      const limits = config.resourceLimits
      if (limits.maxMemoryMB && limits.maxMemoryMB > this.globalLimits.maxMemoryMB!) {
        console.warn(`Agent ${config.type} exceeds global memory limit`)
        return false
      }
      if (limits.maxCpuPercent && limits.maxCpuPercent > this.globalLimits.maxCpuPercent!) {
        console.warn(`Agent ${config.type} exceeds global CPU limit`)
        return false
      }
    }

    return true
  }

  checkResourceUsage(usage: ResourceUsage, limits: ResourceLimits): SecurityViolation | null {
    const violations: string[] = []

    if (limits.maxMemoryMB && usage.memoryUsageMB > limits.maxMemoryMB) {
      violations.push(`memory usage ${usage.memoryUsageMB}MB exceeds limit ${limits.maxMemoryMB}MB`)
    }

    if (limits.maxCpuPercent && usage.cpuUsagePercent > limits.maxCpuPercent) {
      violations.push(`CPU usage ${usage.cpuUsagePercent}% exceeds limit ${limits.maxCpuPercent}%`)
    }

    if (limits.maxExecutionTimeMs && usage.executionTimeMs > limits.maxExecutionTimeMs) {
      violations.push(`execution time ${usage.executionTimeMs}ms exceeds limit ${limits.maxExecutionTimeMs}ms`)
    }

    if (violations.length === 0) {
      return null
    }

    return {
      type: 'RESOURCE_LIMIT_EXCEEDED',
      details: violations.join(', '),
      timestamp: new Date(),
      severity: 'high',
    }
  }

  enforceResourceLimits(sandboxId: string, usage: ResourceUsage): SecurityViolation | null {
    const sandbox = this.sandboxes.get(sandboxId)
    if (!sandbox) {
      return null
    }

    return this.checkResourceUsage(usage, sandbox.resourceLimits)
  }

  private getEnvironmentVariables(): Record<string, string> {
    const allowed = this.globalPolicy.environmentVariables || []
    const env: Record<string, string> = {}

    allowed.forEach(varName => {
      const value = process.env[varName]
      if (value) {
        env[varName] = value
      }
    })

    return env
  }
}

/**
 * Represents a running agent execution
 */
export class AgentExecution extends EventEmitter {
  public readonly id: string
  public readonly plan: TaskPlan
  public status: TaskStatus
  public startedAt?: Date
  public completedAt?: Date
  public output?: any
  public error?: string
  public sandboxId?: string

  private abortController?: AbortController

  constructor(plan: TaskPlan) {
    super()
    this.id = `exec_${plan.id}_${Date.now()}`
    this.plan = plan
    this.status = 'pending'
  }

  updateStatus(status: TaskStatus, output?: any, error?: string): void {
    const previousStatus = this.status
    this.status = status
    this.plan.updateStatus(status, output, error)

    if (status === 'running') {
      this.startedAt = new Date()
    }

    if (['completed', 'failed', 'cancelled'].includes(status)) {
      this.completedAt = new Date()
      if (output !== undefined) {
        this.output = output
      }
      if (error) {
        this.error = error
      }
    }

    this.emit('statusChanged', status, previousStatus)
  }

  cancel(): void {
    if (['completed', 'failed', 'cancelled'].includes(this.status)) {
      return
    }

    if (this.abortController) {
      this.abortController.abort()
    }

    this.updateStatus('cancelled')
  }

  setAbortController(controller: AbortController): void {
    this.abortController = controller
  }
}

/**
 * Orchestrates agent execution with security, resource management, and workflow support
 */
export class TaskOrchestrator {
  private registry: AgentRegistry
  private security: SecurityManager
  private executions = new Map<string, AgentExecution>()
  private executionQueue: AgentExecution[] = []
  private runningExecutions = new Set<AgentExecution>()
  private maxConcurrentExecutions = 10

  constructor(registry: AgentRegistry, security: SecurityManager) {
    this.registry = registry
    this.security = security

    // Process execution queue periodically
    setInterval(() => this.processQueue(), 1000)
  }

  async execute(plan: TaskPlan): Promise<AgentExecution> {
    const execution = new AgentExecution(plan)
    this.executions.set(execution.id, execution)

    // Add to queue for processing
    this.executionQueue.push(execution)

    return execution
  }

  async executeParallel(plans: TaskPlan[]): Promise<AgentExecution[]> {
    const executions = await Promise.all(plans.map(plan => this.execute(plan)))

    // Wait for all executions to complete
    await Promise.all(executions.map(exec => this.waitForCompletion(exec)))

    return executions
  }

  async executeWorkflow(plans: TaskPlan[]): Promise<AgentExecution[]> {
    const executions: AgentExecution[] = []
    const completed = new Map<string, any>()

    // Sort plans by dependencies
    const sortedPlans = this.topologicalSort(plans)

    for (const plan of sortedPlans) {
      // Wait for dependencies to complete
      if (plan.dependencies.length > 0) {
        await Promise.all(
          plan.dependencies.map(dep => {
            const depExecution = executions.find(e => e.plan.id === dep)
            return depExecution ? this.waitForCompletion(depExecution) : Promise.resolve()
          })
        )

        // Add dependency results to input
        const dependencyResults: Record<string, any> = {}
        plan.dependencies.forEach(dep => {
          if (completed.has(dep)) {
            dependencyResults[dep] = completed.get(dep)
          }
        })

        plan.input = {
          ...plan.input,
          _dependencyResults: dependencyResults,
        }
      }

      const execution = await this.execute(plan)
      executions.push(execution)

      await this.waitForCompletion(execution)
      completed.set(plan.id, execution.output)
    }

    return executions
  }

  setMaxConcurrentExecutions(max: number): void {
    this.maxConcurrentExecutions = max
  }

  getExecution(id: string): AgentExecution | undefined {
    return this.executions.get(id)
  }

  async recoverExecution(persistedExecution: {
    id: string
    plan: TaskPlan
    status: TaskStatus
    startedAt?: Date
  }): Promise<void> {
    const execution = new AgentExecution(persistedExecution.plan)
    execution.status = persistedExecution.status
    execution.startedAt = persistedExecution.startedAt

    this.executions.set(persistedExecution.id, execution)

    if (persistedExecution.status === 'running') {
      // Re-queue for processing
      this.executionQueue.push(execution)
    }
  }

  private async processQueue(): Promise<void> {
    if (this.runningExecutions.size >= this.maxConcurrentExecutions || this.executionQueue.length === 0) {
      return
    }

    const execution = this.executionQueue.shift()!
    this.runningExecutions.add(execution)

    try {
      await this.executeAgent(execution)
    } catch (error) {
      console.error(`Execution ${execution.id} failed:`, error)
    } finally {
      this.runningExecutions.delete(execution)
    }
  }

  private async executeAgent(execution: AgentExecution): Promise<void> {
    const { plan } = execution

    // Get agent configuration
    const agentConfig = this.registry.get(plan.agentType)
    if (!agentConfig) {
      execution.updateStatus('failed', undefined, `Agent ${plan.agentType} not found`)
      return
    }

    // Create execution context
    const context: ExecutionContext = {
      agentType: plan.agentType,
      input: plan.input,
      environmentId: plan.environmentId,
      userId: plan.triggeredById,
      organizationId: '', // This would come from the context
      correlationId: execution.id,
    }

    // Create secure sandbox
    const sandbox = await this.security.createSandbox(context)
    execution.sandboxId = sandbox.id
    context.sandboxId = sandbox.id

    // Set up abort controller for cancellation
    const abortController = new AbortController()
    execution.setAbortController(abortController)

    try {
      execution.updateStatus('running')

      // Execute with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Execution timeout')), plan.timeout)
      })

      const executionPromise = this.executeWithRetry(agentConfig, context, plan, abortController.signal)

      const result = await Promise.race([executionPromise, timeoutPromise])

      if (!abortController.signal.aborted) {
        execution.updateStatus('completed', result)
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        execution.updateStatus('cancelled')
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        execution.updateStatus('failed', undefined, errorMessage)
      }
    } finally {
      // Cleanup sandbox
      if (sandbox.id) {
        await this.security.cleanupSandbox(sandbox.id)
      }
    }
  }

  private async executeWithRetry(
    agentConfig: AgentConfig,
    context: ExecutionContext,
    plan: TaskPlan,
    signal: AbortSignal
  ): Promise<any> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < plan.retryAttempts; attempt++) {
      if (signal.aborted) {
        throw new Error('Execution cancelled')
      }

      try {
        return await agentConfig.handler(context.input, context)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        
        // Don't retry on security violations or permanent failures
        if (lastError.message.includes('SECURITY_VIOLATION') || 
            lastError.message.includes('PERMANENT_FAILURE')) {
          throw lastError
        }

        // Wait before retry (exponential backoff)
        if (attempt < plan.retryAttempts - 1) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw lastError || new Error('All retry attempts failed')
  }

  private async waitForCompletion(execution: AgentExecution): Promise<void> {
    return new Promise((resolve) => {
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        resolve()
        return
      }

      const onStatusChanged = (status: TaskStatus) => {
        if (['completed', 'failed', 'cancelled'].includes(status)) {
          execution.off('statusChanged', onStatusChanged)
          resolve()
        }
      }

      execution.on('statusChanged', onStatusChanged)
    })
  }

  private topologicalSort(plans: TaskPlan[]): TaskPlan[] {
    const graph = new Map<string, TaskPlan>()
    const inDegree = new Map<string, number>()
    const adjacencyList = new Map<string, string[]>()

    // Build graph
    plans.forEach(plan => {
      graph.set(plan.id, plan)
      inDegree.set(plan.id, 0)
      adjacencyList.set(plan.id, [])
    })

    // Calculate in-degrees
    plans.forEach(plan => {
      plan.dependencies.forEach(dep => {
        const currentInDegree = inDegree.get(plan.id) || 0
        inDegree.set(plan.id, currentInDegree + 1)
        
        const adj = adjacencyList.get(dep) || []
        adj.push(plan.id)
        adjacencyList.set(dep, adj)
      })
    })

    // Kahn's algorithm for topological sorting
    const queue: string[] = []
    const result: TaskPlan[] = []

    // Find all nodes with no incoming edges
    inDegree.forEach((degree, planId) => {
      if (degree === 0) {
        queue.push(planId)
      }
    })

    while (queue.length > 0) {
      const planId = queue.shift()!
      const plan = graph.get(planId)!
      result.push(plan)

      // Process neighbors
      const neighbors = adjacencyList.get(planId) || []
      neighbors.forEach(neighbor => {
        const newInDegree = inDegree.get(neighbor)! - 1
        inDegree.set(neighbor, newInDegree)

        if (newInDegree === 0) {
          queue.push(neighbor)
        }
      })
    }

    // Check for circular dependencies
    if (result.length !== plans.length) {
      throw new Error('Circular dependency detected in workflow')
    }

    return result
  }
}