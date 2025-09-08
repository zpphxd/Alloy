import { EventEmitter } from 'events'
import type { ResourceLimits, ResourceUsage, SecurityViolation } from './orchestration'

/**
 * Represents an isolated execution environment for agents
 */
export class AgentSandbox extends EventEmitter {
  public readonly id: string
  public readonly agentType: string
  public readonly resourceLimits: ResourceLimits
  public readonly createdAt: Date
  
  private isDestroyed = false
  private resourceUsage: ResourceUsage = {
    memoryUsageMB: 0,
    cpuUsagePercent: 0,
    executionTimeMs: 0,
    diskUsageMB: 0,
  }

  constructor(config: {
    id: string
    agentType: string
    resourceLimits: ResourceLimits
  }) {
    super()
    
    this.id = config.id
    this.agentType = config.agentType
    this.resourceLimits = config.resourceLimits
    this.createdAt = new Date()

    // Start monitoring resources
    this.startResourceMonitoring()
  }

  /**
   * Execute code within the sandbox
   */
  async execute(code: () => Promise<any>): Promise<any> {
    if (this.isDestroyed) {
      throw new Error('Cannot execute in destroyed sandbox')
    }

    const startTime = Date.now()
    
    try {
      this.emit('executionStarted', { sandboxId: this.id, startTime })
      
      // Execute the code with timeout
      const result = await this.executeWithTimeout(code, this.resourceLimits.maxExecutionTimeMs)
      
      const executionTime = Date.now() - startTime
      this.resourceUsage.executionTimeMs = executionTime
      
      this.emit('executionCompleted', { 
        sandboxId: this.id, 
        executionTime,
        result 
      })
      
      return result
    } catch (error) {
      const executionTime = Date.now() - startTime
      this.resourceUsage.executionTimeMs = executionTime
      
      this.emit('executionFailed', { 
        sandboxId: this.id, 
        executionTime, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      })
      
      throw error
    }
  }

  /**
   * Get current resource usage
   */
  getResourceUsage(): ResourceUsage {
    return { ...this.resourceUsage }
  }

  /**
   * Check if resource limits are exceeded
   */
  checkResourceLimits(): SecurityViolation | null {
    const violations: string[] = []

    if (this.resourceLimits.maxMemoryMB && 
        this.resourceUsage.memoryUsageMB > this.resourceLimits.maxMemoryMB) {
      violations.push(`Memory usage ${this.resourceUsage.memoryUsageMB}MB exceeds limit ${this.resourceLimits.maxMemoryMB}MB`)
    }

    if (this.resourceLimits.maxCpuPercent && 
        this.resourceUsage.cpuUsagePercent > this.resourceLimits.maxCpuPercent) {
      violations.push(`CPU usage ${this.resourceUsage.cpuUsagePercent}% exceeds limit ${this.resourceLimits.maxCpuPercent}%`)
    }

    if (this.resourceLimits.maxExecutionTimeMs && 
        this.resourceUsage.executionTimeMs > this.resourceLimits.maxExecutionTimeMs) {
      violations.push(`Execution time ${this.resourceUsage.executionTimeMs}ms exceeds limit ${this.resourceLimits.maxExecutionTimeMs}ms`)
    }

    if (this.resourceLimits.maxDiskUsageMB && 
        this.resourceUsage.diskUsageMB && 
        this.resourceUsage.diskUsageMB > this.resourceLimits.maxDiskUsageMB) {
      violations.push(`Disk usage ${this.resourceUsage.diskUsageMB}MB exceeds limit ${this.resourceLimits.maxDiskUsageMB}MB`)
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

  /**
   * Destroy the sandbox and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.isDestroyed) {
      return
    }

    this.isDestroyed = true
    
    try {
      // Stop resource monitoring
      this.stopResourceMonitoring()
      
      // Clean up any temporary files, containers, etc.
      await this.cleanup()
      
      this.emit('destroyed', { sandboxId: this.id })
    } catch (error) {
      this.emit('error', { 
        sandboxId: this.id, 
        error: error instanceof Error ? error.message : 'Unknown cleanup error' 
      })
    } finally {
      this.removeAllListeners()
    }
  }

  /**
   * Check if sandbox is still active
   */
  isActive(): boolean {
    return !this.isDestroyed
  }

  private async executeWithTimeout(
    code: () => Promise<any>, 
    timeoutMs?: number
  ): Promise<any> {
    if (!timeoutMs) {
      return await code()
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeoutMs}ms`))
      }, timeoutMs)

      code()
        .then(result => {
          clearTimeout(timer)
          resolve(result)
        })
        .catch(error => {
          clearTimeout(timer)
          reject(error)
        })
    })
  }

  private resourceMonitoringInterval?: NodeJS.Timeout

  private startResourceMonitoring(): void {
    // Monitor resources every second
    this.resourceMonitoringInterval = setInterval(() => {
      this.updateResourceUsage()
      
      const violation = this.checkResourceLimits()
      if (violation) {
        this.emit('resourceViolation', violation)
      }
    }, 1000)
  }

  private stopResourceMonitoring(): void {
    if (this.resourceMonitoringInterval) {
      clearInterval(this.resourceMonitoringInterval)
      this.resourceMonitoringInterval = undefined
    }
  }

  private updateResourceUsage(): void {
    // In a real implementation, this would gather actual system metrics
    // For now, we'll simulate resource usage
    
    if (process.memoryUsage) {
      const memUsage = process.memoryUsage()
      this.resourceUsage.memoryUsageMB = memUsage.heapUsed / (1024 * 1024)
    }

    // Simulate CPU usage (would use actual metrics in production)
    this.resourceUsage.cpuUsagePercent = Math.random() * 50 // 0-50% baseline

    // Update disk usage if needed (would use actual filesystem metrics)
    if (this.resourceLimits.maxDiskUsageMB) {
      this.resourceUsage.diskUsageMB = Math.random() * 100 // Simulate disk usage
    }
  }

  private async cleanup(): Promise<void> {
    // In a real implementation, this would:
    // - Remove temporary directories
    // - Kill any spawned processes
    // - Close network connections
    // - Clean up container resources
    // - Remove any created files
    
    // For now, just emit a cleanup event
    this.emit('cleanup', { sandboxId: this.id })
  }
}