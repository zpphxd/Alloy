import { z } from 'zod'
import { EventEmitter } from 'events'
import type { 
  AgentType, 
  AgentConfig, 
  ExecutionContext, 
  ResourceLimits,
  SecurityPolicy 
} from './orchestration'

/**
 * Abstract base class for all agents
 */
export abstract class BaseAgent extends EventEmitter {
  public readonly type: AgentType
  public readonly name: string
  public readonly version: string
  public readonly description: string
  public readonly inputSchema: z.ZodSchema
  public readonly outputSchema?: z.ZodSchema
  public readonly resourceLimits?: ResourceLimits
  public readonly securityPolicy?: SecurityPolicy

  constructor(config: {
    type: AgentType
    name: string
    version?: string
    description?: string
    inputSchema: z.ZodSchema
    outputSchema?: z.ZodSchema
    resourceLimits?: ResourceLimits
    securityPolicy?: SecurityPolicy
  }) {
    super()
    
    this.type = config.type
    this.name = config.name
    this.version = config.version || '1.0.0'
    this.description = config.description || ''
    this.inputSchema = config.inputSchema
    this.outputSchema = config.outputSchema
    this.resourceLimits = config.resourceLimits
    this.securityPolicy = config.securityPolicy
  }

  /**
   * Main execution method that must be implemented by subclasses
   */
  abstract execute(input: any, context: ExecutionContext): Promise<any>

  /**
   * Validate input against schema
   */
  protected validateInput(input: any): any {
    try {
      return this.inputSchema.parse(input)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Input validation failed: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  /**
   * Validate output against schema (if defined)
   */
  protected validateOutput(output: any): any {
    if (!this.outputSchema) {
      return output
    }

    try {
      return this.outputSchema.parse(output)
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`Output validation failed: ${error.errors.map(e => e.message).join(', ')}`)
      }
      throw error
    }
  }

  /**
   * Log messages with context
   */
  protected log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agent: this.type,
      level,
      message,
      ...(data && { data }),
    }

    this.emit('log', logEntry)
    
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console[level](`[${this.type}] ${message}`, data || '')
    }
  }

  /**
   * Report progress updates
   */
  protected reportProgress(progress: number, message?: string): void {
    const progressUpdate = {
      timestamp: new Date().toISOString(),
      agent: this.type,
      progress: Math.max(0, Math.min(100, progress)),
      message,
    }

    this.emit('progress', progressUpdate)
  }

  /**
   * Check if agent supports a specific capability
   */
  hasCapability(capability: string): boolean {
    // Override in subclasses to define capabilities
    return false
  }

  /**
   * Get agent configuration for registration
   */
  getConfig(): AgentConfig {
    return {
      type: this.type,
      name: this.name,
      version: this.version,
      description: this.description,
      handler: this.execute.bind(this),
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      resourceLimits: this.resourceLimits,
      securityPolicy: this.securityPolicy,
      metadata: {
        capabilities: this.getCapabilities(),
        author: this.getAuthor(),
        tags: this.getTags(),
      },
    }
  }

  /**
   * Get list of agent capabilities
   * Override in subclasses
   */
  protected getCapabilities(): string[] {
    return []
  }

  /**
   * Get agent author information
   * Override in subclasses
   */
  protected getAuthor(): string {
    return 'Unknown'
  }

  /**
   * Get agent tags for categorization
   * Override in subclasses
   */
  protected getTags(): string[] {
    return []
  }

  /**
   * Cleanup resources when agent execution is complete
   */
  async cleanup(): Promise<void> {
    // Override in subclasses for custom cleanup
    this.removeAllListeners()
  }

  /**
   * Handle cancellation requests
   */
  async cancel(): Promise<void> {
    // Override in subclasses for custom cancellation logic
    this.emit('cancelled')
  }
}