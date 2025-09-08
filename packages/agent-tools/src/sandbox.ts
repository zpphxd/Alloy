import { VM } from "vm2";
import Docker from "dockerode";
import { z } from "zod";

export const SandboxConfigSchema = z.object({
  timeout: z.number().default(30000),
  memory: z.string().default("512m"),
  cpu: z.number().default(0.5),
  network: z.boolean().default(false),
  readOnly: z.boolean().default(true),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

export interface SandboxResult {
  output: string;
  error?: string;
  exitCode: number;
  duration: number;
  memoryUsed: number;
}

export class Sandbox {
  private docker: Docker;
  private config: SandboxConfig;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.docker = new Docker();
    this.config = SandboxConfigSchema.parse(config);
  }

  async executeCode(code: string, language: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const vm = new VM({
      timeout: this.config.timeout,
      sandbox: {
        console: {
          log: (...args: any[]) => {
            return args.join(" ");
          },
        },
      },
    });

    try {
      const output = await vm.run(code);
      return {
        output: String(output),
        exitCode: 0,
        duration: Date.now() - startTime,
        memoryUsed: process.memoryUsage().heapUsed,
      };
    } catch (error) {
      return {
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
        exitCode: 1,
        duration: Date.now() - startTime,
        memoryUsed: process.memoryUsage().heapUsed,
      };
    }
  }

  async executeInDocker(
    image: string,
    command: string[]
  ): Promise<SandboxResult> {
    const startTime = Date.now();
    
    try {
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: command,
        HostConfig: {
          Memory: parseInt(this.config.memory) * 1024 * 1024,
          CpuQuota: this.config.cpu * 100000,
          ReadonlyRootfs: this.config.readOnly,
          NetworkMode: this.config.network ? "bridge" : "none",
        },
      });

      await container.start();
      const stream = await container.logs({
        stdout: true,
        stderr: true,
        follow: true,
      });

      const output = stream.toString();
      const { StatusCode } = await container.wait();
      await container.remove();

      return {
        output,
        exitCode: StatusCode,
        duration: Date.now() - startTime,
        memoryUsed: 0,
      };
    } catch (error) {
      return {
        output: "",
        error: error instanceof Error ? error.message : "Unknown error",
        exitCode: 1,
        duration: Date.now() - startTime,
        memoryUsed: 0,
      };
    }
  }

  async cleanup(): Promise<void> {
    const containers = await this.docker.listContainers({ all: true });
    for (const containerInfo of containers) {
      const container = this.docker.getContainer(containerInfo.Id);
      await container.remove({ force: true });
    }
  }
}