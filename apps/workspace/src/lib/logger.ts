import { createAuditEvent } from './auth'

/**
 * Structured logging and observability utilities for Alloy
 * Provides correlation IDs, structured logs, and metrics collection
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogContext {
  correlationId?: string
  userId?: string
  organizationId?: string
  sessionId?: string
  requestId?: string
  traceId?: string
  spanId?: string
  operation?: string
  component?: string
  environment?: string
  version?: string
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context: LogContext
  metadata?: Record<string, any>
  error?: {
    name: string
    message: string
    stack?: string
    code?: string
  }
  duration?: number
  requestPath?: string
  method?: string
  statusCode?: number
  userAgent?: string
  ip?: string
}

export interface MetricData {
  name: string
  value: number
  unit?: 'ms' | 'count' | 'bytes' | 'percent'
  tags?: Record<string, string>
  timestamp?: Date
}

export interface TraceSpan {
  spanId: string
  traceId: string
  parentSpanId?: string
  operationName: string
  startTime: number
  endTime?: number
  tags?: Record<string, any>
  logs?: Array<{
    timestamp: number
    fields: Record<string, any>
  }>
  status?: 'ok' | 'error' | 'timeout'
  error?: Error
}

/**
 * Logger class with structured logging and correlation ID support
 */
export class Logger {
  private context: LogContext
  private static instance: Logger

  constructor(context: LogContext = {}) {
    this.context = {
      component: 'alloy-workspace',
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.0',
      ...context,
    }
  }

  static getInstance(context?: LogContext): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(context)
    }
    return Logger.instance
  }

  child(additionalContext: LogContext): Logger {
    return new Logger({
      ...this.context,
      ...additionalContext,
    })
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      metadata,
    }

    if (error) {
      logEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      }
    }

    // Format and output log
    if (process.env.NODE_ENV === 'development') {
      this.formatConsoleLog(logEntry)
    } else {
      // Production: JSON format for log aggregation
      console.log(JSON.stringify(logEntry))
    }

    // Send critical errors to audit trail
    if (level === 'error' || level === 'fatal') {
      this.auditError(logEntry, error).catch(err => {
        console.error('Failed to create audit event for error:', err)
      })
    }
  }

  private formatConsoleLog(entry: LogEntry): void {
    const colors = {
      debug: '\x1b[36m',    // cyan
      info: '\x1b[32m',     // green
      warn: '\x1b[33m',     // yellow
      error: '\x1b[31m',    // red
      fatal: '\x1b[35m',    // magenta
    }
    const resetColor = '\x1b[0m'
    
    const color = colors[entry.level]
    const timestamp = new Date(entry.timestamp).toLocaleTimeString()
    
    let contextStr = ''
    if (entry.context.correlationId) {
      contextStr += ` [${entry.context.correlationId}]`
    }
    if (entry.context.userId) {
      contextStr += ` [user:${entry.context.userId}]`
    }
    if (entry.context.operation) {
      contextStr += ` [op:${entry.context.operation}]`
    }

    console.log(
      `${color}[${entry.level.toUpperCase()}]${resetColor} ${timestamp}${contextStr} ${entry.message}`
    )

    if (entry.metadata) {
      console.log('  Metadata:', entry.metadata)
    }

    if (entry.error) {
      console.log(`  Error: ${entry.error.name}: ${entry.error.message}`)
      if (entry.error.stack) {
        console.log(`  Stack: ${entry.error.stack}`)
      }
    }
  }

  private async auditError(logEntry: LogEntry, error?: Error): Promise<void> {
    try {
      await createAuditEvent({
        action: `LOG_${logEntry.level.toUpperCase()}`,
        entityType: 'LOG_EVENT',
        entityId: logEntry.context.correlationId || 'unknown',
        metadata: {
          message: logEntry.message,
          level: logEntry.level,
          component: logEntry.context.component,
          operation: logEntry.context.operation,
          error: error ? {
            name: error.name,
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          } : undefined,
          context: logEntry.context,
        },
      })
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      console.error('Failed to create audit event:', auditError)
    }
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log('debug', message, metadata)
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log('info', message, metadata)
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log('warn', message, metadata)
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('error', message, metadata, error)
  }

  fatal(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log('fatal', message, metadata, error)
  }

  // Request logging utilities
  logRequest(req: {
    method?: string
    url?: string
    headers?: Record<string, any>
    ip?: string
  }): void {
    this.info('Request started', {
      method: req.method,
      url: req.url,
      userAgent: req.headers?.['user-agent'],
      ip: req.ip || req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'],
    })
  }

  logResponse(req: {
    method?: string
    url?: string
  }, res: {
    statusCode?: number
  }, duration: number): void {
    const level = res.statusCode && res.statusCode >= 400 ? 'error' : 'info'
    this.log(level, 'Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
    })
  }

  // Database logging utilities
  logDbQuery(query: string, params?: any[], duration?: number): void {
    this.debug('Database query executed', {
      query: query.replace(/\s+/g, ' ').trim(),
      paramCount: params?.length || 0,
      duration: duration ? `${duration}ms` : undefined,
    })
  }

  logDbError(query: string, error: Error, params?: any[]): void {
    this.error('Database query failed', error, {
      query: query.replace(/\s+/g, ' ').trim(),
      paramCount: params?.length || 0,
    })
  }

  // Agent execution logging
  logAgentStart(agentType: string, input: any): void {
    this.info('Agent execution started', {
      agentType,
      inputKeys: Object.keys(input || {}),
    })
  }

  logAgentComplete(agentType: string, duration: number, success: boolean): void {
    this.info('Agent execution completed', {
      agentType,
      duration: `${duration}ms`,
      success,
    })
  }

  logAgentError(agentType: string, error: Error, duration?: number): void {
    this.error('Agent execution failed', error, {
      agentType,
      duration: duration ? `${duration}ms` : undefined,
    })
  }
}

/**
 * Metrics collection and monitoring utilities
 */
export class MetricsCollector {
  private static instance: MetricsCollector
  private metrics: MetricData[] = []
  private flushInterval: NodeJS.Timer | null = null

  constructor() {
    // In production, this would send metrics to a monitoring service
    // For development, we'll just log them periodically
    if (process.env.NODE_ENV !== 'test') {
      this.flushInterval = setInterval(() => {
        this.flush()
      }, 30000) // Flush every 30 seconds
    }
  }

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector()
    }
    return MetricsCollector.instance
  }

  increment(name: string, tags?: Record<string, string>): void {
    this.gauge(name, 1, 'count', tags)
  }

  gauge(name: string, value: number, unit?: 'ms' | 'count' | 'bytes' | 'percent', tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      unit,
      tags,
      timestamp: new Date(),
    })
  }

  timing(name: string, duration: number, tags?: Record<string, string>): void {
    this.gauge(name, duration, 'ms', tags)
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    // In a real implementation, this would create histogram buckets
    this.gauge(`${name}.value`, value, undefined, tags)
  }

  // Request metrics
  recordRequest(method: string, path: string, statusCode: number, duration: number): void {
    const tags = {
      method,
      path: this.normalizePath(path),
      status_code: statusCode.toString(),
      status_class: `${Math.floor(statusCode / 100)}xx`,
    }

    this.increment('http.requests.total', tags)
    this.timing('http.request.duration', duration, tags)
  }

  // Database metrics
  recordDbQuery(operation: string, table: string, duration: number, success: boolean): void {
    const tags = {
      operation,
      table,
      status: success ? 'success' : 'error',
    }

    this.increment('db.queries.total', tags)
    this.timing('db.query.duration', duration, tags)
  }

  // Agent metrics
  recordAgentExecution(agentType: string, status: string, duration: number): void {
    const tags = {
      agent_type: agentType,
      status,
    }

    this.increment('agent.executions.total', tags)
    this.timing('agent.execution.duration', duration, tags)
  }

  // Business metrics
  recordUserAction(action: string, userId: string, organizationId: string): void {
    const tags = {
      action,
      user_id: userId,
      organization_id: organizationId,
    }

    this.increment('user.actions.total', tags)
  }

  private normalizePath(path: string): string {
    // Replace dynamic segments with placeholders
    return path
      .replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g, '/:id')
      .replace(/\/\d+/g, '/:id')
      .replace(/\?.*/g, '') // Remove query parameters
  }

  private flush(): void {
    if (this.metrics.length === 0) return

    // In production, this would send to DataDog, Prometheus, etc.
    const logger = Logger.getInstance()
    logger.debug('Flushing metrics', {
      metricCount: this.metrics.length,
      metrics: this.metrics.slice(0, 10), // Only log first 10 for brevity
    })

    // Group metrics by name for aggregation
    const aggregated = new Map<string, { count: number; sum: number; max: number; min: number }>()
    
    this.metrics.forEach(metric => {
      const key = `${metric.name}${metric.tags ? '|' + Object.entries(metric.tags).map(([k, v]) => `${k}:${v}`).join(',') : ''}`
      const existing = aggregated.get(key) || { count: 0, sum: 0, max: -Infinity, min: Infinity }
      
      existing.count++
      existing.sum += metric.value
      existing.max = Math.max(existing.max, metric.value)
      existing.min = Math.min(existing.min, metric.value)
      
      aggregated.set(key, existing)
    })

    // Log aggregated metrics
    aggregated.forEach((stats, key) => {
      logger.info('Metric aggregated', {
        metric: key,
        count: stats.count,
        sum: stats.sum,
        avg: stats.sum / stats.count,
        min: stats.min,
        max: stats.max,
      })
    })

    this.metrics = []
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    this.flush()
  }
}

/**
 * Distributed tracing utilities
 */
export class Tracer {
  private static instance: Tracer
  private spans = new Map<string, TraceSpan>()

  static getInstance(): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer()
    }
    return Tracer.instance
  }

  startSpan(operationName: string, parentSpanId?: string, traceId?: string): TraceSpan {
    const span: TraceSpan = {
      spanId: this.generateId(),
      traceId: traceId || this.generateId(),
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: 'ok',
    }

    this.spans.set(span.spanId, span)
    return span
  }

  finishSpan(spanId: string, error?: Error): void {
    const span = this.spans.get(spanId)
    if (!span) return

    span.endTime = Date.now()
    if (error) {
      span.status = 'error'
      span.error = error
      span.tags!.error = true
    }

    // Log span completion
    const logger = Logger.getInstance({
      correlationId: span.traceId,
      spanId: span.spanId,
    })

    const duration = span.endTime - span.startTime
    logger.debug('Span completed', {
      operation: span.operationName,
      duration: `${duration}ms`,
      status: span.status,
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
    })

    // Record metrics
    const metrics = MetricsCollector.getInstance()
    metrics.timing('span.duration', duration, {
      operation: span.operationName,
      status: span.status,
    })

    this.spans.delete(spanId)
  }

  addSpanTag(spanId: string, key: string, value: any): void {
    const span = this.spans.get(spanId)
    if (span) {
      span.tags![key] = value
    }
  }

  addSpanLog(spanId: string, fields: Record<string, any>): void {
    const span = this.spans.get(spanId)
    if (span) {
      span.logs!.push({
        timestamp: Date.now(),
        fields,
      })
    }
  }

  private generateId(): string {
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)
  }
}

/**
 * Correlation ID middleware and utilities
 */
export function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function extractCorrelationId(headers: Record<string, any>): string | undefined {
  return headers['x-correlation-id'] || headers['x-request-id'] || headers['x-trace-id']
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static measurements = new Map<string, number>()

  static startMeasurement(key: string): void {
    this.measurements.set(key, Date.now())
  }

  static endMeasurement(key: string): number {
    const start = this.measurements.get(key)
    if (!start) return 0

    const duration = Date.now() - start
    this.measurements.delete(key)

    const metrics = MetricsCollector.getInstance()
    metrics.timing(`performance.${key}`, duration)

    return duration
  }

  static measureAsync<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return new Promise(async (resolve, reject) => {
      this.startMeasurement(key)
      try {
        const result = await operation()
        const duration = this.endMeasurement(key)
        
        const logger = Logger.getInstance()
        logger.debug(`Performance measurement: ${key}`, { duration: `${duration}ms` })
        
        resolve(result)
      } catch (error) {
        this.endMeasurement(key)
        reject(error)
      }
    })
  }

  static measure<T>(key: string, operation: () => T): T {
    this.startMeasurement(key)
    try {
      const result = operation()
      const duration = this.endMeasurement(key)
      
      const logger = Logger.getInstance()
      logger.debug(`Performance measurement: ${key}`, { duration: `${duration}ms` })
      
      return result
    } catch (error) {
      this.endMeasurement(key)
      throw error
    }
  }
}

// Export singleton instances for convenience
export const logger = Logger.getInstance()
export const metrics = MetricsCollector.getInstance()
export const tracer = Tracer.getInstance()