import { EventEmitter } from 'events'
import { TaskPlan, AgentExecution, type AgentType } from './orchestration'

/**
 * Represents a pipeline of agents that process data sequentially
 */
export class AgentPipeline extends EventEmitter {
  public readonly id: string
  public readonly name: string
  private stages: PipelineStage[] = []

  constructor(config: { id: string; name: string }) {
    super()
    this.id = config.id
    this.name = config.name
  }

  /**
   * Add a stage to the pipeline
   */
  addStage(config: {
    name: string
    agentType: AgentType
    transform?: (input: any, previousResults: any[]) => any
    condition?: (input: any, previousResults: any[]) => boolean
  }): AgentPipeline {
    this.stages.push({
      id: `${this.id}_stage_${this.stages.length}`,
      name: config.name,
      agentType: config.agentType,
      transform: config.transform,
      condition: config.condition,
    })
    return this
  }

  /**
   * Execute the pipeline with initial input
   */
  async execute(
    initialInput: any,
    context: {
      environmentId: string
      triggeredById: string
      orchestrator: any // TaskOrchestrator
    }
  ): Promise<PipelineResult> {
    const executionId = `pipeline_${this.id}_${Date.now()}`
    const results: StageResult[] = []
    let currentInput = initialInput

    this.emit('pipelineStarted', {
      pipelineId: this.id,
      executionId,
      initialInput,
    })

    try {
      for (let i = 0; i < this.stages.length; i++) {
        const stage = this.stages[i]
        
        this.emit('stageStarted', {
          pipelineId: this.id,
          executionId,
          stageIndex: i,
          stageName: stage.name,
        })

        // Check condition if provided
        if (stage.condition && !stage.condition(currentInput, results.map(r => r.output))) {
          this.emit('stageSkipped', {
            pipelineId: this.id,
            executionId,
            stageIndex: i,
            stageName: stage.name,
            reason: 'Condition not met',
          })

          results.push({
            stageId: stage.id,
            stageName: stage.name,
            agentType: stage.agentType,
            input: currentInput,
            output: null,
            skipped: true,
            executionTime: 0,
          })
          
          continue
        }

        // Transform input if transformer provided
        const stageInput = stage.transform 
          ? stage.transform(currentInput, results.map(r => r.output))
          : currentInput

        // Create and execute task plan
        const plan = new TaskPlan({
          id: `${stage.id}_${executionId}`,
          agentType: stage.agentType,
          input: stageInput,
          environmentId: context.environmentId,
          triggeredById: context.triggeredById,
        })

        const startTime = Date.now()
        const execution = await context.orchestrator.execute(plan)
        
        // Wait for completion
        await this.waitForExecution(execution)
        
        const executionTime = Date.now() - startTime

        if (execution.status === 'failed') {
          throw new Error(`Stage ${stage.name} failed: ${execution.error}`)
        }

        const stageResult: StageResult = {
          stageId: stage.id,
          stageName: stage.name,
          agentType: stage.agentType,
          input: stageInput,
          output: execution.output,
          skipped: false,
          executionTime,
          execution,
        }

        results.push(stageResult)
        currentInput = execution.output

        this.emit('stageCompleted', {
          pipelineId: this.id,
          executionId,
          stageIndex: i,
          stageName: stage.name,
          result: stageResult,
        })
      }

      const pipelineResult: PipelineResult = {
        pipelineId: this.id,
        executionId,
        initialInput,
        finalOutput: currentInput,
        stageResults: results,
        successful: true,
        totalExecutionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
      }

      this.emit('pipelineCompleted', pipelineResult)
      return pipelineResult

    } catch (error) {
      const pipelineResult: PipelineResult = {
        pipelineId: this.id,
        executionId,
        initialInput,
        finalOutput: null,
        stageResults: results,
        successful: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        totalExecutionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
      }

      this.emit('pipelineFailed', pipelineResult)
      throw error
    }
  }

  /**
   * Get pipeline metadata
   */
  getMetadata(): {
    id: string
    name: string
    stageCount: number
    stages: Array<{
      name: string
      agentType: AgentType
      hasTransform: boolean
      hasCondition: boolean
    }>
  } {
    return {
      id: this.id,
      name: this.name,
      stageCount: this.stages.length,
      stages: this.stages.map(stage => ({
        name: stage.name,
        agentType: stage.agentType,
        hasTransform: !!stage.transform,
        hasCondition: !!stage.condition,
      })),
    }
  }

  /**
   * Clone the pipeline with a new ID
   */
  clone(newId: string, newName?: string): AgentPipeline {
    const cloned = new AgentPipeline({
      id: newId,
      name: newName || `${this.name} (Clone)`,
    })

    this.stages.forEach(stage => {
      cloned.addStage({
        name: stage.name,
        agentType: stage.agentType,
        transform: stage.transform,
        condition: stage.condition,
      })
    })

    return cloned
  }

  private async waitForExecution(execution: AgentExecution): Promise<void> {
    return new Promise((resolve, reject) => {
      if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
        resolve()
        return
      }

      const onStatusChanged = (status: string) => {
        if (status === 'completed') {
          execution.off('statusChanged', onStatusChanged)
          resolve()
        } else if (['failed', 'cancelled'].includes(status)) {
          execution.off('statusChanged', onStatusChanged)
          reject(new Error(`Execution ${status}: ${execution.error || 'Unknown error'}`))
        }
      }

      execution.on('statusChanged', onStatusChanged)
    })
  }
}

interface PipelineStage {
  id: string
  name: string
  agentType: AgentType
  transform?: (input: any, previousResults: any[]) => any
  condition?: (input: any, previousResults: any[]) => boolean
}

interface StageResult {
  stageId: string
  stageName: string
  agentType: AgentType
  input: any
  output: any
  skipped: boolean
  executionTime: number
  execution?: AgentExecution
}

interface PipelineResult {
  pipelineId: string
  executionId: string
  initialInput: any
  finalOutput: any
  stageResults: StageResult[]
  successful: boolean
  error?: string
  totalExecutionTime: number
}