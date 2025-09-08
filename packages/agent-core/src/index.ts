/**
 * @alloy/agent-core
 * 
 * Core orchestration engine for Alloy AI agents providing:
 * - Secure sandbox execution
 * - Resource management and limits
 * - Task orchestration and workflow management
 * - Agent registry and discovery
 * - Security policy enforcement
 */

export {
  // Core orchestration classes
  TaskOrchestrator,
  AgentRegistry,
  SecurityManager,
  TaskPlan,
  AgentExecution,

  // Types
  type AgentType,
  type TaskStatus,
  type NetworkAccessLevel,
  type FileSystemAccessLevel,
  type ResourceLimits,
  type SecurityPolicy,
  type AgentConfig,
  type ExecutionContext,
  type ResourceUsage,
  type SecurityViolation,
  type Sandbox,
} from './orchestration'

// Agent base classes and utilities
export { BaseAgent } from './base-agent'
export { AgentSandbox } from './sandbox'
export { SecurityMonitor } from './security'

// Workflow and pipeline utilities
export { WorkflowBuilder } from './workflow'
export { AgentPipeline } from './pipeline'

// Built-in agent implementations
export { CodeAnalyzerAgent } from './agents/code-analyzer'
export { SecurityScannerAgent } from './agents/security-scanner'
export { DeploymentValidatorAgent } from './agents/deployment-validator'