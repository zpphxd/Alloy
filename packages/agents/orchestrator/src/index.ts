import { BaseAgent, AgentContext, TaskPlan, TaskResult } from "@alloy/agent-core";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const OrchestrationRequestSchema = z.object({
  goal: z.string(),
  context: z.object({
    organizationId: z.string(),
    projectId: z.string(),
    userId: z.string(),
    role: z.enum(["OWNER", "ADMIN", "EDITOR", "VIEWER"]),
  }),
  constraints: z.object({
    budget: z.number().optional(),
    deadline: z.string().optional(),
    approvalRequired: z.boolean().default(true),
  }).optional(),
});

export type OrchestrationRequest = z.infer<typeof OrchestrationRequestSchema>;

export class OrchestratorAgent extends BaseAgent {
  private anthropic: Anthropic;
  
  constructor() {
    super({
      id: "orchestrator",
      name: "Alfred - The Orchestrator",
      description: "Master orchestrator that breaks down goals into tasks and coordinates other agents",
      version: "1.0.0",
    });
    
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }

  async execute(
    input: OrchestrationRequest,
    context: AgentContext
  ): Promise<TaskResult> {
    try {
      const validatedInput = OrchestrationRequestSchema.parse(input);
      
      // Use Claude to analyze the goal and create a task plan
      const taskPlan = await this.createTaskPlan(validatedInput, context);
      
      // Validate the plan meets constraints
      if (validatedInput.constraints?.approvalRequired) {
        await this.requestApproval(taskPlan, context);
      }
      
      // Dispatch tasks to appropriate agents
      const results = await this.dispatchTasks(taskPlan, context);
      
      return {
        success: true,
        data: {
          taskPlan,
          results,
          summary: this.generateSummary(results),
        },
        metadata: {
          executionTime: Date.now() - context.startTime,
          agentsInvolved: this.getInvolvedAgents(taskPlan),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        metadata: {
          executionTime: Date.now() - context.startTime,
        },
      };
    }
  }

  private async createTaskPlan(
    request: OrchestrationRequest,
    context: AgentContext
  ): Promise<TaskPlan> {
    const response = await this.anthropic.messages.create({
      model: "claude-3-opus-20240229",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `You are Alfred, the master orchestrator for Alloy.
        
Goal: ${request.goal}

Context:
- Organization: ${request.context.organizationId}
- Project: ${request.context.projectId}
- User Role: ${request.context.role}

Available Agents:
- requirements: Analyzes and documents requirements
- scaffolder: Creates project structure from templates
- ui: Builds UI components and pages
- data: Handles database and API implementation
- qa: Runs tests and quality checks
- security: Performs security audits
- devops: Manages deployment and CI/CD
- docs: Creates documentation

Create a detailed task plan breaking down this goal into specific tasks.
Return as JSON with structure:
{
  "tasks": [
    {
      "id": "task-1",
      "agent": "agent-name",
      "description": "task description",
      "dependencies": [],
      "priority": 1-5,
      "estimatedTime": "time estimate"
    }
  ],
  "criticalPath": ["task-1", "task-2"],
  "totalEstimatedTime": "total time"
}`
      }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    return JSON.parse(content.text);
  }

  private async requestApproval(
    taskPlan: TaskPlan,
    context: AgentContext
  ): Promise<void> {
    // Implementation for two-man approval rule
    context.logger.info("Requesting approval for task plan", { taskPlan });
    
    // In production, this would integrate with the approval system
    // For now, we'll simulate approval
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  private async dispatchTasks(
    taskPlan: TaskPlan,
    context: AgentContext
  ): Promise<any[]> {
    const results = [];
    
    for (const task of taskPlan.tasks) {
      // Check dependencies
      const dependenciesMet = task.dependencies.every(depId =>
        results.find(r => r.taskId === depId && r.success)
      );
      
      if (!dependenciesMet) {
        results.push({
          taskId: task.id,
          success: false,
          error: "Dependencies not met",
        });
        continue;
      }
      
      // Dispatch to appropriate agent
      const agentResult = await context.invokeAgent(task.agent, {
        task: task.description,
        context: context,
      });
      
      results.push({
        taskId: task.id,
        ...agentResult,
      });
    }
    
    return results;
  }

  private generateSummary(results: any[]): string {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    return `Completed ${successful} tasks successfully, ${failed} failed.`;
  }

  private getInvolvedAgents(taskPlan: TaskPlan): string[] {
    return [...new Set(taskPlan.tasks.map(t => t.agent))];
  }
}

export default new OrchestratorAgent();