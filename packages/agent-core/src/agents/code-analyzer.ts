import { z } from 'zod'
import { BaseAgent } from '../base-agent'
import type { ExecutionContext } from '../orchestration'

const inputSchema = z.object({
  repository: z.string().url().optional(),
  branch: z.string().default('main'),
  analysisType: z.enum(['security', 'quality', 'complexity', 'all']).default('all'),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  localPath: z.string().optional(),
})

const outputSchema = z.object({
  summary: z.object({
    totalFiles: z.number(),
    linesOfCode: z.number(),
    issues: z.number(),
    score: z.number().min(0).max(100),
  }),
  security: z.object({
    vulnerabilities: z.array(z.object({
      type: z.string(),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
      file: z.string(),
      line: z.number(),
      description: z.string(),
      recommendation: z.string().optional(),
    })),
    score: z.number().min(0).max(100),
  }).optional(),
  quality: z.object({
    issues: z.array(z.object({
      type: z.string(),
      severity: z.enum(['info', 'warning', 'error']),
      file: z.string(),
      line: z.number(),
      message: z.string(),
      rule: z.string(),
    })),
    maintainabilityIndex: z.number().min(0).max(100),
    testCoverage: z.number().min(0).max(100).optional(),
  }).optional(),
  complexity: z.object({
    cyclomaticComplexity: z.number(),
    cognitiveComplexity: z.number(),
    files: z.array(z.object({
      path: z.string(),
      complexity: z.number(),
      functions: z.array(z.object({
        name: z.string(),
        complexity: z.number(),
        line: z.number(),
      })),
    })),
  }).optional(),
  dependencies: z.object({
    total: z.number(),
    outdated: z.number(),
    vulnerable: z.number(),
    packages: z.array(z.object({
      name: z.string(),
      version: z.string(),
      latest: z.string().optional(),
      vulnerabilities: z.number(),
    })),
  }).optional(),
})

type CodeAnalysisInput = z.infer<typeof inputSchema>
type CodeAnalysisOutput = z.infer<typeof outputSchema>

/**
 * Analyzes code for security, quality, and complexity issues
 */
export class CodeAnalyzerAgent extends BaseAgent {
  constructor() {
    super({
      type: 'CODE_ANALYZER',
      name: 'Code Quality Analyzer',
      version: '2.0.0',
      description: 'Comprehensive code analysis for security, quality, and complexity metrics',
      inputSchema,
      outputSchema,
      resourceLimits: {
        maxMemoryMB: 512,
        maxCpuPercent: 75,
        maxExecutionTimeMs: 300000, // 5 minutes
        maxDiskUsageMB: 1024, // 1GB for code downloads
      },
      securityPolicy: {
        networkAccess: 'restricted',
        fileSystemAccess: 'read-only',
        allowedUrls: [
          'https://github.com',
          'https://gitlab.com',
          'https://bitbucket.org',
          'https://api.github.com',
        ],
        allowedModules: [
          'fs', 'path', 'crypto', 'util', 'os',
          'child_process', // Needed for git operations
        ],
      },
    })
  }

  async execute(input: CodeAnalysisInput, context: ExecutionContext): Promise<CodeAnalysisOutput> {
    const validatedInput = this.validateInput(input)
    
    this.log('info', 'Starting code analysis', { 
      repository: validatedInput.repository,
      analysisType: validatedInput.analysisType 
    })
    this.reportProgress(10, 'Initializing analysis')

    let codebasePath: string
    let totalFiles = 0
    let linesOfCode = 0

    try {
      // Step 1: Acquire codebase
      if (validatedInput.repository) {
        codebasePath = await this.cloneRepository(validatedInput.repository, validatedInput.branch)
        this.reportProgress(20, 'Repository cloned')
      } else if (validatedInput.localPath) {
        codebasePath = validatedInput.localPath
        this.reportProgress(20, 'Using local path')
      } else {
        throw new Error('Either repository URL or local path must be provided')
      }

      // Step 2: Scan codebase
      const scanResult = await this.scanCodebase(codebasePath, validatedInput)
      totalFiles = scanResult.totalFiles
      linesOfCode = scanResult.linesOfCode
      this.reportProgress(40, 'Codebase scanned')

      const result: CodeAnalysisOutput = {
        summary: {
          totalFiles,
          linesOfCode,
          issues: 0,
          score: 100,
        },
      }

      // Step 3: Run analyses based on type
      if (validatedInput.analysisType === 'security' || validatedInput.analysisType === 'all') {
        this.log('info', 'Running security analysis')
        result.security = await this.runSecurityAnalysis(codebasePath, scanResult.files)
        result.summary.issues += result.security.vulnerabilities.length
        this.reportProgress(60, 'Security analysis complete')
      }

      if (validatedInput.analysisType === 'quality' || validatedInput.analysisType === 'all') {
        this.log('info', 'Running quality analysis')
        result.quality = await this.runQualityAnalysis(codebasePath, scanResult.files)
        result.summary.issues += result.quality.issues.length
        this.reportProgress(80, 'Quality analysis complete')
      }

      if (validatedInput.analysisType === 'complexity' || validatedInput.analysisType === 'all') {
        this.log('info', 'Running complexity analysis')
        result.complexity = await this.runComplexityAnalysis(codebasePath, scanResult.files)
        this.reportProgress(90, 'Complexity analysis complete')
      }

      // Step 4: Analyze dependencies
      result.dependencies = await this.analyzeDependencies(codebasePath)

      // Step 5: Calculate overall score
      result.summary.score = this.calculateOverallScore(result)
      
      this.reportProgress(100, 'Analysis complete')
      this.log('info', 'Code analysis completed successfully', {
        totalFiles: result.summary.totalFiles,
        issues: result.summary.issues,
        score: result.summary.score,
      })

      return this.validateOutput(result)

    } catch (error) {
      this.log('error', 'Code analysis failed', { error: error instanceof Error ? error.message : error })
      throw error
    }
  }

  protected getCapabilities(): string[] {
    return [
      'security_scanning',
      'quality_analysis', 
      'complexity_metrics',
      'dependency_analysis',
      'git_integration',
      'multi_language_support',
    ]
  }

  protected getAuthor(): string {
    return 'Alloy Development Team'
  }

  protected getTags(): string[] {
    return ['code-analysis', 'security', 'quality', 'static-analysis']
  }

  private async cloneRepository(repository: string, branch: string): Promise<string> {
    // In a real implementation, this would use git to clone the repository
    // For demo purposes, we'll simulate this
    this.log('debug', 'Cloning repository', { repository, branch })
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    return `/tmp/code_analysis_${Date.now()}`
  }

  private async scanCodebase(path: string, options: CodeAnalysisInput): Promise<{
    totalFiles: number
    linesOfCode: number
    files: string[]
  }> {
    // In a real implementation, this would scan the filesystem
    // For demo purposes, we'll simulate this
    this.log('debug', 'Scanning codebase', { path })

    const mockFiles = [
      'src/index.ts',
      'src/components/Button.tsx',
      'src/utils/helpers.ts',
      'src/services/api.ts',
      'tests/Button.test.tsx',
      'package.json',
      'tsconfig.json',
    ]

    return {
      totalFiles: mockFiles.length,
      linesOfCode: mockFiles.length * 50, // Average 50 lines per file
      files: mockFiles,
    }
  }

  private async runSecurityAnalysis(path: string, files: string[]): Promise<{
    vulnerabilities: Array<{
      type: string
      severity: 'low' | 'medium' | 'high' | 'critical'
      file: string
      line: number
      description: string
      recommendation?: string
    }>
    score: number
  }> {
    // Simulate security scanning
    await new Promise(resolve => setTimeout(resolve, 1000))

    const mockVulnerabilities = [
      {
        type: 'hardcoded-secret',
        severity: 'high' as const,
        file: 'src/services/api.ts',
        line: 23,
        description: 'Hardcoded API key detected',
        recommendation: 'Move API key to environment variables',
      },
      {
        type: 'sql-injection',
        severity: 'critical' as const,
        file: 'src/database/queries.ts',
        line: 45,
        description: 'Potential SQL injection vulnerability',
        recommendation: 'Use parameterized queries',
      },
    ]

    return {
      vulnerabilities: mockVulnerabilities,
      score: Math.max(0, 100 - (mockVulnerabilities.length * 15)),
    }
  }

  private async runQualityAnalysis(path: string, files: string[]): Promise<{
    issues: Array<{
      type: string
      severity: 'info' | 'warning' | 'error'
      file: string
      line: number
      message: string
      rule: string
    }>
    maintainabilityIndex: number
    testCoverage?: number
  }> {
    // Simulate quality analysis
    await new Promise(resolve => setTimeout(resolve, 1500))

    const mockIssues = [
      {
        type: 'code-smell',
        severity: 'warning' as const,
        file: 'src/components/Button.tsx',
        line: 12,
        message: 'Function is too long (35 lines)',
        rule: 'max-function-length',
      },
      {
        type: 'unused-variable',
        severity: 'warning' as const,
        file: 'src/utils/helpers.ts',
        line: 8,
        message: 'Variable is declared but never used',
        rule: 'no-unused-vars',
      },
    ]

    return {
      issues: mockIssues,
      maintainabilityIndex: 75,
      testCoverage: 82,
    }
  }

  private async runComplexityAnalysis(path: string, files: string[]): Promise<{
    cyclomaticComplexity: number
    cognitiveComplexity: number
    files: Array<{
      path: string
      complexity: number
      functions: Array<{
        name: string
        complexity: number
        line: number
      }>
    }>
  }> {
    // Simulate complexity analysis
    await new Promise(resolve => setTimeout(resolve, 1000))

    const mockComplexityFiles = [
      {
        path: 'src/components/Button.tsx',
        complexity: 8,
        functions: [
          { name: 'Button', complexity: 3, line: 15 },
          { name: 'handleClick', complexity: 5, line: 28 },
        ],
      },
      {
        path: 'src/services/api.ts',
        complexity: 12,
        functions: [
          { name: 'fetchData', complexity: 7, line: 10 },
          { name: 'postData', complexity: 5, line: 45 },
        ],
      },
    ]

    return {
      cyclomaticComplexity: 15,
      cognitiveComplexity: 22,
      files: mockComplexityFiles,
    }
  }

  private async analyzeDependencies(path: string): Promise<{
    total: number
    outdated: number
    vulnerable: number
    packages: Array<{
      name: string
      version: string
      latest?: string
      vulnerabilities: number
    }>
  }> {
    // Simulate dependency analysis
    await new Promise(resolve => setTimeout(resolve, 800))

    const mockPackages = [
      {
        name: 'react',
        version: '18.2.0',
        latest: '18.3.0',
        vulnerabilities: 0,
      },
      {
        name: 'lodash',
        version: '4.17.15',
        latest: '4.17.21',
        vulnerabilities: 2,
      },
      {
        name: 'axios',
        version: '0.27.2',
        latest: '1.6.0',
        vulnerabilities: 1,
      },
    ]

    return {
      total: mockPackages.length,
      outdated: mockPackages.filter(p => p.latest && p.version !== p.latest).length,
      vulnerable: mockPackages.filter(p => p.vulnerabilities > 0).length,
      packages: mockPackages,
    }
  }

  private calculateOverallScore(result: CodeAnalysisOutput): number {
    let totalScore = 0
    let weights = 0

    if (result.security) {
      totalScore += result.security.score * 0.4 // Security is 40% of score
      weights += 0.4
    }

    if (result.quality) {
      totalScore += result.quality.maintainabilityIndex * 0.3 // Quality is 30%
      weights += 0.3
    }

    if (result.dependencies) {
      const depScore = Math.max(0, 100 - (result.dependencies.vulnerable * 20))
      totalScore += depScore * 0.2 // Dependencies are 20%
      weights += 0.2
    }

    // Complexity penalty (up to 10% reduction)
    if (result.complexity) {
      const complexityPenalty = Math.min(10, result.complexity.cyclomaticComplexity / 2)
      totalScore -= complexityPenalty * weights
    }

    return weights > 0 ? Math.round(totalScore / weights) : 85
  }
}