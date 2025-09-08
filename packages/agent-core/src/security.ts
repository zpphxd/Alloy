import { EventEmitter } from 'events'
import type { SecurityPolicy, SecurityViolation, ResourceUsage, ResourceLimits } from './orchestration'

/**
 * Monitors and enforces security policies for agent execution
 */
export class SecurityMonitor extends EventEmitter {
  private readonly globalPolicy: SecurityPolicy
  private readonly violationHistory: SecurityViolation[] = []
  private readonly maxViolationHistory = 1000

  constructor(policy: SecurityPolicy) {
    super()
    this.globalPolicy = policy
  }

  /**
   * Check if a network request is allowed
   */
  checkNetworkAccess(url: string, agentPolicy?: SecurityPolicy): boolean {
    const policy = { ...this.globalPolicy, ...agentPolicy }

    if (policy.networkAccess === 'none') {
      this.recordViolation({
        type: 'NETWORK_ACCESS_DENIED',
        details: `Network access denied for URL: ${url}`,
        timestamp: new Date(),
        severity: 'medium',
      })
      return false
    }

    if (policy.networkAccess === 'restricted') {
      const allowedUrls = policy.allowedUrls || []
      const blockedUrls = policy.blockedUrls || []

      // Check if URL is explicitly blocked
      if (blockedUrls.some(blocked => url.includes(blocked))) {
        this.recordViolation({
          type: 'NETWORK_ACCESS_DENIED',
          details: `Blocked URL access attempt: ${url}`,
          timestamp: new Date(),
          severity: 'high',
        })
        return false
      }

      // Check if URL is in allowed list
      if (allowedUrls.length > 0 && !allowedUrls.some(allowed => url.startsWith(allowed))) {
        this.recordViolation({
          type: 'NETWORK_ACCESS_DENIED',
          details: `Unauthorized URL access attempt: ${url}`,
          timestamp: new Date(),
          severity: 'medium',
        })
        return false
      }
    }

    return true
  }

  /**
   * Check if file system access is allowed
   */
  checkFileSystemAccess(path: string, operation: 'read' | 'write' | 'execute', agentPolicy?: SecurityPolicy): boolean {
    const policy = { ...this.globalPolicy, ...agentPolicy }

    if (policy.fileSystemAccess === 'none') {
      this.recordViolation({
        type: 'FILE_ACCESS_DENIED',
        details: `File system access denied for path: ${path}`,
        timestamp: new Date(),
        severity: 'high',
      })
      return false
    }

    // Check for access to sensitive system paths
    const sensitivePaths = ['/etc', '/proc', '/sys', '/var/log', '/root', '/home']
    if (sensitivePaths.some(sensitive => path.startsWith(sensitive))) {
      this.recordViolation({
        type: 'FILE_ACCESS_DENIED',
        details: `Attempted access to sensitive path: ${path}`,
        timestamp: new Date(),
        severity: 'critical',
      })
      return false
    }

    if (policy.fileSystemAccess === 'read-only' && ['write', 'execute'].includes(operation)) {
      this.recordViolation({
        type: 'FILE_ACCESS_DENIED',
        details: `Write/execute access denied for path: ${path}`,
        timestamp: new Date(),
        severity: 'medium',
      })
      return false
    }

    return true
  }

  /**
   * Check if module access is allowed
   */
  checkModuleAccess(moduleName: string, agentPolicy?: SecurityPolicy): boolean {
    const policy = { ...this.globalPolicy, ...agentPolicy }

    // Always block dangerous modules
    const dangerousModules = [
      'child_process',
      'cluster', 
      'dgram',
      'net',
      'tls',
      'vm',
      'worker_threads'
    ]

    if (dangerousModules.includes(moduleName)) {
      this.recordViolation({
        type: 'MODULE_ACCESS_DENIED',
        details: `Access to dangerous module denied: ${moduleName}`,
        timestamp: new Date(),
        severity: 'critical',
      })
      return false
    }

    // Check against allowed modules list
    if (policy.allowedModules && !policy.allowedModules.includes(moduleName)) {
      this.recordViolation({
        type: 'MODULE_ACCESS_DENIED',
        details: `Unauthorized module access attempt: ${moduleName}`,
        timestamp: new Date(),
        severity: 'medium',
      })
      return false
    }

    return true
  }

  /**
   * Validate resource usage against limits
   */
  validateResourceUsage(usage: ResourceUsage, limits: ResourceLimits): SecurityViolation[] {
    const violations: SecurityViolation[] = []

    if (limits.maxMemoryMB && usage.memoryUsageMB > limits.maxMemoryMB) {
      violations.push({
        type: 'RESOURCE_LIMIT_EXCEEDED',
        details: `Memory usage ${usage.memoryUsageMB}MB exceeds limit ${limits.maxMemoryMB}MB`,
        timestamp: new Date(),
        severity: 'high',
      })
    }

    if (limits.maxCpuPercent && usage.cpuUsagePercent > limits.maxCpuPercent) {
      violations.push({
        type: 'RESOURCE_LIMIT_EXCEEDED',
        details: `CPU usage ${usage.cpuUsagePercent}% exceeds limit ${limits.maxCpuPercent}%`,
        timestamp: new Date(),
        severity: 'high',
      })
    }

    if (limits.maxExecutionTimeMs && usage.executionTimeMs > limits.maxExecutionTimeMs) {
      violations.push({
        type: 'RESOURCE_LIMIT_EXCEEDED',
        details: `Execution time ${usage.executionTimeMs}ms exceeds limit ${limits.maxExecutionTimeMs}ms`,
        timestamp: new Date(),
        severity: 'high',
      })
    }

    if (limits.maxDiskUsageMB && usage.diskUsageMB && usage.diskUsageMB > limits.maxDiskUsageMB) {
      violations.push({
        type: 'RESOURCE_LIMIT_EXCEEDED',
        details: `Disk usage ${usage.diskUsageMB}MB exceeds limit ${limits.maxDiskUsageMB}MB`,
        timestamp: new Date(),
        severity: 'medium',
      })
    }

    violations.forEach(violation => this.recordViolation(violation))
    return violations
  }

  /**
   * Check environment variable access
   */
  checkEnvironmentVariableAccess(varName: string, agentPolicy?: SecurityPolicy): boolean {
    const policy = { ...this.globalPolicy, ...agentPolicy }

    // Block access to sensitive environment variables
    const sensitiveVars = [
      'PASSWORD',
      'SECRET',
      'PRIVATE_KEY',
      'TOKEN',
      'API_KEY',
      'DATABASE_URL',
      'CLERK_SECRET_KEY',
    ]

    if (sensitiveVars.some(sensitive => varName.toUpperCase().includes(sensitive))) {
      this.recordViolation({
        type: 'NETWORK_ACCESS_DENIED', // Using closest existing type
        details: `Access to sensitive environment variable denied: ${varName}`,
        timestamp: new Date(),
        severity: 'high',
      })
      return false
    }

    // Check against allowed variables list
    if (policy.environmentVariables && !policy.environmentVariables.includes(varName)) {
      return false
    }

    return true
  }

  /**
   * Get violation history
   */
  getViolationHistory(limit?: number): SecurityViolation[] {
    const violations = [...this.violationHistory].reverse() // Most recent first
    return limit ? violations.slice(0, limit) : violations
  }

  /**
   * Get violations by severity
   */
  getViolationsBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): SecurityViolation[] {
    return this.violationHistory.filter(v => v.severity === severity)
  }

  /**
   * Get violation statistics
   */
  getViolationStats(timeRangeMs?: number): {
    total: number
    bySeverity: Record<string, number>
    byType: Record<string, number>
    recent: number
  } {
    const since = timeRangeMs ? Date.now() - timeRangeMs : 0
    const relevantViolations = this.violationHistory.filter(
      v => v.timestamp.getTime() >= since
    )

    const stats = {
      total: this.violationHistory.length,
      bySeverity: {} as Record<string, number>,
      byType: {} as Record<string, number>,
      recent: relevantViolations.length,
    }

    this.violationHistory.forEach(violation => {
      stats.bySeverity[violation.severity] = (stats.bySeverity[violation.severity] || 0) + 1
      stats.byType[violation.type] = (stats.byType[violation.type] || 0) + 1
    })

    return stats
  }

  /**
   * Clear violation history
   */
  clearViolationHistory(): void {
    this.violationHistory.splice(0)
    this.emit('historyCleared')
  }

  /**
   * Create a security audit report
   */
  generateAuditReport(timeRangeMs?: number): {
    reportId: string
    timestamp: Date
    timeRange: string
    summary: any
    violations: SecurityViolation[]
    recommendations: string[]
  } {
    const reportId = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const since = timeRangeMs ? Date.now() - timeRangeMs : 0
    const relevantViolations = this.violationHistory.filter(
      v => v.timestamp.getTime() >= since
    )

    const stats = this.getViolationStats(timeRangeMs)
    const criticalViolations = this.getViolationsBySeverity('critical')
    const highViolations = this.getViolationsBySeverity('high')

    const recommendations: string[] = []

    if (criticalViolations.length > 0) {
      recommendations.push('Immediately investigate critical security violations')
    }

    if (highViolations.length > 10) {
      recommendations.push('Review and tighten security policies - high violation count detected')
    }

    if (stats.byType['NETWORK_ACCESS_DENIED'] > 20) {
      recommendations.push('Consider updating network access policies - many blocked requests')
    }

    if (stats.byType['RESOURCE_LIMIT_EXCEEDED'] > 15) {
      recommendations.push('Review resource limits - agents may need more resources or optimization')
    }

    return {
      reportId,
      timestamp: new Date(),
      timeRange: timeRangeMs ? `${timeRangeMs / 1000 / 60} minutes` : 'all time',
      summary: {
        totalViolations: stats.total,
        recentViolations: stats.recent,
        criticalCount: criticalViolations.length,
        highCount: highViolations.length,
        mostCommonType: this.getMostCommonViolationType(relevantViolations),
      },
      violations: relevantViolations,
      recommendations,
    }
  }

  private recordViolation(violation: SecurityViolation): void {
    this.violationHistory.push(violation)

    // Trim history if it gets too large
    if (this.violationHistory.length > this.maxViolationHistory) {
      this.violationHistory.splice(0, this.violationHistory.length - this.maxViolationHistory)
    }

    this.emit('violation', violation)

    // Log critical violations immediately
    if (violation.severity === 'critical') {
      console.error('[SECURITY] Critical violation:', violation)
      this.emit('criticalViolation', violation)
    }
  }

  private getMostCommonViolationType(violations: SecurityViolation[]): string | null {
    if (violations.length === 0) return null

    const typeCount: Record<string, number> = {}
    violations.forEach(v => {
      typeCount[v.type] = (typeCount[v.type] || 0) + 1
    })

    let maxCount = 0
    let mostCommonType = ''

    Object.entries(typeCount).forEach(([type, count]) => {
      if (count > maxCount) {
        maxCount = count
        mostCommonType = type
      }
    })

    return mostCommonType
  }
}