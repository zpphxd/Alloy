import { TaskPlan, type AgentType } from './orchestration'

/**
 * Builder for creating complex workflows with dependencies
 */
export class WorkflowBuilder {
  private tasks: TaskPlan[] = []
  private currentStep = 0

  /**
   * Add a task to the workflow
   */
  addTask(config: {
    id: string
    agentType: AgentType
    input: any
    environmentId: string
    triggeredById: string
    dependsOn?: string[]
    timeout?: number
    retryAttempts?: number
  }): WorkflowBuilder {
    const task = new TaskPlan({
      id: config.id,
      agentType: config.agentType,
      input: config.input,
      environmentId: config.environmentId,
      triggeredById: config.triggeredById,
      dependencies: config.dependsOn || [],
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
    })

    this.tasks.push(task)
    return this
  }

  /**
   * Add a parallel group of tasks
   */
  addParallelGroup(configs: Array<{
    id: string
    agentType: AgentType
    input: any
    environmentId: string
    triggeredById: string
    timeout?: number
    retryAttempts?: number
  }>): WorkflowBuilder {
    configs.forEach(config => {
      this.addTask({
        ...config,
        dependsOn: this.getLastStepTaskIds(),
      })
    })

    this.currentStep++
    return this
  }

  /**
   * Add a sequential task that depends on all previous tasks
   */
  addSequentialTask(config: {
    id: string
    agentType: AgentType
    input: any
    environmentId: string
    triggeredById: string
    timeout?: number
    retryAttempts?: number
  }): WorkflowBuilder {
    return this.addTask({
      ...config,
      dependsOn: this.getAllPreviousTaskIds(),
    })
  }

  /**
   * Add a conditional task that only runs if a condition is met
   */
  addConditionalTask(config: {
    id: string
    agentType: AgentType
    input: any
    environmentId: string
    triggeredById: string
    condition: (results: Record<string, any>) => boolean
    dependsOn?: string[]
    timeout?: number
    retryAttempts?: number
  }): WorkflowBuilder {
    const task = new TaskPlan({
      id: config.id,
      agentType: config.agentType,
      input: {
        ...config.input,
        _condition: config.condition.toString(),
      },
      environmentId: config.environmentId,
      triggeredById: config.triggeredById,
      dependencies: config.dependsOn || [],
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
    })

    this.tasks.push(task)
    return this
  }

  /**
   * Build the workflow
   */
  build(): TaskPlan[] {
    return [...this.tasks]
  }

  /**
   * Validate the workflow for circular dependencies and other issues
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    // Check for circular dependencies
    if (this.hasCircularDependencies()) {
      errors.push('Circular dependencies detected')
    }

    // Check that all dependencies exist
    const taskIds = new Set(this.tasks.map(t => t.id))
    this.tasks.forEach(task => {
      task.dependencies.forEach(dep => {
        if (!taskIds.has(dep)) {
          errors.push(`Task ${task.id} depends on non-existent task ${dep}`)
        }
      })
    })

    // Check for duplicate task IDs
    const seenIds = new Set<string>()
    this.tasks.forEach(task => {
      if (seenIds.has(task.id)) {
        errors.push(`Duplicate task ID: ${task.id}`)
      }
      seenIds.add(task.id)
    })

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Generate a visual representation of the workflow
   */
  generateDiagram(): string {
    const lines: string[] = []
    const processed = new Set<string>()

    const renderTask = (taskId: string, depth = 0): void => {
      if (processed.has(taskId)) return

      const task = this.tasks.find(t => t.id === taskId)
      if (!task) return

      const indent = '  '.repeat(depth)
      lines.push(`${indent}[${task.id}] ${task.agentType}`)

      processed.add(taskId)

      // Find tasks that depend on this one
      const dependents = this.tasks.filter(t => t.dependencies.includes(taskId))
      dependents.forEach(dep => renderTask(dep.id, depth + 1))
    }

    // Start with tasks that have no dependencies
    const rootTasks = this.tasks.filter(t => t.dependencies.length === 0)
    rootTasks.forEach(task => renderTask(task.id))

    return lines.join('\n')
  }

  private hasCircularDependencies(): boolean {
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    const hasCycle = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) return true
      if (visited.has(taskId)) return false

      visited.add(taskId)
      recursionStack.add(taskId)

      const task = this.tasks.find(t => t.id === taskId)
      if (task) {
        for (const dep of task.dependencies) {
          if (hasCycle(dep)) return true
        }
      }

      recursionStack.delete(taskId)
      return false
    }

    return this.tasks.some(task => hasCycle(task.id))
  }

  private getLastStepTaskIds(): string[] {
    // This is a simplified implementation
    // In a real implementation, you'd track step boundaries
    return this.tasks.slice(-1).map(t => t.id)
  }

  private getAllPreviousTaskIds(): string[] {
    return this.tasks.map(t => t.id)
  }
}