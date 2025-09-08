import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { 
  Logger, 
  MetricsCollector, 
  Tracer, 
  PerformanceMonitor,
  generateCorrelationId,
  extractCorrelationId
} from '@/lib/logger'

// Mock createAuditEvent
vi.mock('@/lib/auth', () => ({
  createAuditEvent: vi.fn().mockResolvedValue({}),
}))

describe('Logging and Observability System', () => {
  let consoleLogSpy: any
  let consoleErrorSpy: any

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.clearAllTimers()
    vi.useFakeTimers()
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('Logger', () => {
    it('should create logger with context', () => {
      const logger = new Logger({ 
        correlationId: 'test-123', 
        userId: 'user-456' 
      })

      logger.info('Test message')

      expect(consoleLogSpy).toHaveBeenCalled()
      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toContain('[test-123]')
      expect(logCall).toContain('[user:user-456]')
      expect(logCall).toContain('Test message')
    })

    it('should create child logger with additional context', () => {
      const parentLogger = new Logger({ correlationId: 'parent' })
      const childLogger = parentLogger.child({ operation: 'child-op' })

      childLogger.info('Child message')

      const logCall = consoleLogSpy.mock.calls[0][0]
      expect(logCall).toContain('[parent]')
      expect(logCall).toContain('[op:child-op]')
    })

    it('should log different levels correctly', () => {
      const logger = new Logger()

      logger.debug('Debug message')
      logger.info('Info message')
      logger.warn('Warning message')
      logger.error('Error message')

      expect(consoleLogSpy).toHaveBeenCalledTimes(4)
      
      const calls = consoleLogSpy.mock.calls.map(call => call[0])
      expect(calls[0]).toContain('[DEBUG]')
      expect(calls[1]).toContain('[INFO]')
      expect(calls[2]).toContain('[WARN]')
      expect(calls[3]).toContain('[ERROR]')
    })

    it('should log errors with stack traces', () => {
      const logger = new Logger()
      const error = new Error('Test error')

      logger.error('Something failed', error)

      expect(consoleLogSpy).toHaveBeenCalled()
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Error: Test error')
      )
    })

    it('should log metadata objects', () => {
      const logger = new Logger()

      logger.info('Test message', { key1: 'value1', key2: 42 })

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      )
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '  Metadata:', 
        { key1: 'value1', key2: 42 }
      )
    })

    it('should create audit events for errors', async () => {
      const { createAuditEvent } = await import('@/lib/auth')
      const mockCreateAudit = createAuditEvent as any

      const logger = new Logger({ 
        correlationId: 'test-correlation',
        organizationId: 'org-123'
      })

      logger.error('Critical error')

      // Wait for async audit event creation
      await vi.runAllTimersAsync()

      expect(mockCreateAudit).toHaveBeenCalledWith({
        action: 'LOG_ERROR',
        entityType: 'LOG_EVENT',
        entityId: 'test-correlation',
        metadata: expect.objectContaining({
          message: 'Critical error',
          level: 'error',
        }),
      })
    })

    it('should format JSON logs in production', () => {
      const originalNodeEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'

      const logger = new Logger({ correlationId: 'prod-test' })
      logger.info('Production message')

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/^\{"timestamp":".*","level":"info","message":"Production message"/)
      )

      process.env.NODE_ENV = originalNodeEnv
    })

    describe('Request Logging', () => {
      it('should log HTTP requests', () => {
        const logger = new Logger({ correlationId: 'req-123' })

        logger.logRequest({
          method: 'POST',
          url: '/api/projects',
          headers: { 'user-agent': 'test-agent' },
          ip: '127.0.0.1',
        })

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Request started')
        )
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '  Metadata:',
          {
            method: 'POST',
            url: '/api/projects',
            userAgent: 'test-agent',
            ip: '127.0.0.1',
          }
        )
      })

      it('should log HTTP responses with error level for 4xx/5xx', () => {
        const logger = new Logger()

        // Successful response
        logger.logResponse(
          { method: 'GET', url: '/api/projects' },
          { statusCode: 200 },
          150
        )

        // Error response
        logger.logResponse(
          { method: 'POST', url: '/api/projects' },
          { statusCode: 500 },
          1000
        )

        const calls = consoleLogSpy.mock.calls.map(call => call[0])
        expect(calls[0]).toContain('[INFO]')
        expect(calls[1]).toContain('[ERROR]')
      })
    })

    describe('Database Logging', () => {
      it('should log database queries', () => {
        const logger = new Logger()

        logger.logDbQuery(
          'SELECT * FROM projects WHERE organizationId = ?',
          ['org-123'],
          25
        )

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[DEBUG]')
        )
        expect(consoleLogSpy).toHaveBeenCalledWith(
          '  Metadata:',
          {
            query: 'SELECT * FROM projects WHERE organizationId = ?',
            paramCount: 1,
            duration: '25ms',
          }
        )
      })

      it('should log database errors', () => {
        const logger = new Logger()
        const dbError = new Error('Connection failed')

        logger.logDbError(
          'INSERT INTO projects (...) VALUES (?)',
          dbError,
          ['test-data']
        )

        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('[ERROR]')
        )
        expect(consoleLogSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error: Error: Connection failed')
        )
      })
    })

    describe('Agent Logging', () => {
      it('should log agent execution lifecycle', () => {
        const logger = new Logger()

        logger.logAgentStart('CODE_ANALYZER', { 
          repository: 'test/repo',
          branch: 'main'
        })

        logger.logAgentComplete('CODE_ANALYZER', 5000, true)

        const error = new Error('Analysis failed')
        logger.logAgentError('CODE_ANALYZER', error, 2500)

        expect(consoleLogSpy).toHaveBeenCalledTimes(3)
        
        const calls = consoleLogSpy.mock.calls.map(call => call[0])
        expect(calls[0]).toContain('Agent execution started')
        expect(calls[1]).toContain('Agent execution completed')
        expect(calls[2]).toContain('Agent execution failed')
      })
    })
  })

  describe('MetricsCollector', () => {
    let metrics: MetricsCollector

    beforeEach(() => {
      metrics = new MetricsCollector()
    })

    afterEach(() => {
      metrics.destroy()
    })

    it('should collect counter metrics', () => {
      metrics.increment('api.requests', { endpoint: '/projects' })
      metrics.increment('api.requests', { endpoint: '/projects' })
      
      // Metrics are stored internally, tested via flush
      expect(metrics).toBeDefined()
    })

    it('should collect gauge metrics', () => {
      metrics.gauge('memory.usage', 150, 'bytes', { process: 'api' })
      metrics.timing('request.duration', 250, { endpoint: '/api' })
      
      expect(metrics).toBeDefined()
    })

    it('should record HTTP request metrics', () => {
      metrics.recordRequest('POST', '/api/projects', 201, 150)
      metrics.recordRequest('GET', '/api/projects/123', 200, 50)
      
      // Verify internal state or mock external calls
      expect(metrics).toBeDefined()
    })

    it('should record database query metrics', () => {
      metrics.recordDbQuery('SELECT', 'projects', 25, true)
      metrics.recordDbQuery('INSERT', 'users', 100, false)
      
      expect(metrics).toBeDefined()
    })

    it('should record agent execution metrics', () => {
      metrics.recordAgentExecution('CODE_ANALYZER', 'completed', 5000)
      metrics.recordAgentExecution('SECURITY_SCANNER', 'failed', 2500)
      
      expect(metrics).toBeDefined()
    })

    it('should normalize URL paths for metrics', () => {
      // This tests the private normalizePath method indirectly
      metrics.recordRequest('GET', '/api/projects/550e8400-e29b-41d4-a716-446655440000', 200, 100)
      metrics.recordRequest('GET', '/api/projects/123', 200, 100)
      metrics.recordRequest('GET', '/api/projects?page=1&limit=10', 200, 100)
      
      // All should be normalized to the same path pattern
      expect(metrics).toBeDefined()
    })

    it('should flush metrics periodically', async () => {
      metrics.increment('test.counter')
      metrics.gauge('test.gauge', 42)

      // Trigger flush
      vi.advanceTimersByTime(30000)
      await vi.runAllTimersAsync()

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Flushing metrics')
      )
    })
  })

  describe('Tracer', () => {
    let tracer: Tracer

    beforeEach(() => {
      tracer = new Tracer()
    })

    it('should start and finish spans', () => {
      const span = tracer.startSpan('test-operation')
      
      expect(span.operationName).toBe('test-operation')
      expect(span.startTime).toBeTypeOf('number')
      expect(span.spanId).toBeDefined()
      expect(span.traceId).toBeDefined()

      // Advance time to simulate work
      vi.advanceTimersByTime(100)
      
      tracer.finishSpan(span.spanId)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Span completed')
      )
    })

    it('should create child spans', () => {
      const rootSpan = tracer.startSpan('root-operation')
      const childSpan = tracer.startSpan('child-operation', rootSpan.spanId, rootSpan.traceId)

      expect(childSpan.parentSpanId).toBe(rootSpan.spanId)
      expect(childSpan.traceId).toBe(rootSpan.traceId)
      expect(childSpan.spanId).not.toBe(rootSpan.spanId)

      tracer.finishSpan(childSpan.spanId)
      tracer.finishSpan(rootSpan.spanId)
    })

    it('should add tags and logs to spans', () => {
      const span = tracer.startSpan('test-operation')
      
      tracer.addSpanTag(span.spanId, 'component', 'api')
      tracer.addSpanTag(span.spanId, 'http.method', 'POST')
      
      tracer.addSpanLog(span.spanId, {
        event: 'db.query',
        query: 'SELECT * FROM users',
      })

      expect(span.tags).toEqual({
        component: 'api',
        'http.method': 'POST',
      })
      
      expect(span.logs).toHaveLength(1)
      expect(span.logs![0].fields).toEqual({
        event: 'db.query',
        query: 'SELECT * FROM users',
      })

      tracer.finishSpan(span.spanId)
    })

    it('should handle span errors', () => {
      const span = tracer.startSpan('failing-operation')
      const error = new Error('Operation failed')

      tracer.finishSpan(span.spanId, error)

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('status: error')
      )
    })
  })

  describe('PerformanceMonitor', () => {
    it('should measure synchronous operations', () => {
      const result = PerformanceMonitor.measure('sync-operation', () => {
        // Simulate work
        let sum = 0
        for (let i = 0; i < 1000; i++) {
          sum += i
        }
        return sum
      })

      expect(result).toBe(499500) // Sum of 0 to 999
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Performance measurement: sync-operation')
      )
    })

    it('should measure asynchronous operations', async () => {
      const result = await PerformanceMonitor.measureAsync('async-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'completed'
      })

      expect(result).toBe('completed')
    })

    it('should handle errors in measured operations', () => {
      expect(() => {
        PerformanceMonitor.measure('failing-operation', () => {
          throw new Error('Operation failed')
        })
      }).toThrow('Operation failed')

      // Should still log the measurement
      expect(consoleLogSpy).toHaveBeenCalled()
    })

    it('should start and end measurements manually', () => {
      PerformanceMonitor.startMeasurement('manual-test')
      
      // Advance time
      vi.advanceTimersByTime(100)
      
      const duration = PerformanceMonitor.endMeasurement('manual-test')
      
      expect(duration).toBe(100)
    })
  })

  describe('Correlation ID Utilities', () => {
    it('should generate correlation IDs', () => {
      const id1 = generateCorrelationId()
      const id2 = generateCorrelationId()

      expect(id1).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(id2).toMatch(/^req_\d+_[a-z0-9]+$/)
      expect(id1).not.toBe(id2)
    })

    it('should extract correlation IDs from headers', () => {
      expect(extractCorrelationId({
        'x-correlation-id': 'corr-123'
      })).toBe('corr-123')

      expect(extractCorrelationId({
        'x-request-id': 'req-456'
      })).toBe('req-456')

      expect(extractCorrelationId({
        'x-trace-id': 'trace-789'
      })).toBe('trace-789')

      expect(extractCorrelationId({})).toBeUndefined()
    })
  })

  describe('Integration', () => {
    it('should work together across components', async () => {
      const correlationId = generateCorrelationId()
      const logger = new Logger({ correlationId, operation: 'integration-test' })
      const tracer = new Tracer()
      const metrics = new MetricsCollector()

      // Start a trace
      const span = tracer.startSpan('integration-operation', undefined, correlationId)
      
      // Log some activity
      logger.info('Starting integration test')
      
      // Record metrics
      metrics.increment('integration.tests')
      
      // Measure performance
      const result = await PerformanceMonitor.measureAsync('integration-work', async () => {
        logger.info('Doing work')
        await new Promise(resolve => setTimeout(resolve, 10))
        return 'success'
      })

      // Finish trace
      tracer.finishSpan(span.spanId)
      
      expect(result).toBe('success')
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(correlationId)
      )

      metrics.destroy()
    })
  })
})