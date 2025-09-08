import { execa } from "execa";
import path from "path";
import { z } from "zod";

export const TestConfigSchema = z.object({
  type: z.enum(["unit", "integration", "e2e"]),
  framework: z.enum(["vitest", "jest", "playwright", "cypress"]),
  coverage: z.boolean().default(false),
  watch: z.boolean().default(false),
  filter: z.string().optional(),
});

export type TestConfig = z.infer<typeof TestConfigSchema>;

export interface TestResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  coverage?: {
    statements: number;
    branches: number;
    functions: number;
    lines: number;
  };
  failures?: Array<{
    test: string;
    error: string;
    stack?: string;
  }>;
}

export class TestRunner {
  constructor(private projectPath: string) {}

  async runTests(config: TestConfig): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const command = this.buildCommand(config);
      const { stdout, stderr } = await execa(
        command.cmd,
        command.args,
        {
          cwd: this.projectPath,
          env: {
            ...process.env,
            CI: "true",
            NODE_ENV: "test",
          },
        }
      );

      return this.parseResults(stdout, stderr, config, Date.now() - startTime);
    } catch (error) {
      if (error instanceof Error && 'stdout' in error) {
        // Tests failed but we can still parse results
        return this.parseResults(
          (error as any).stdout,
          (error as any).stderr,
          config,
          Date.now() - startTime
        );
      }
      throw error;
    }
  }

  async runE2ETests(url: string, specs?: string[]): Promise<TestResult> {
    const config: TestConfig = {
      type: "e2e",
      framework: "playwright",
      coverage: false,
      watch: false,
    };

    const { stdout } = await execa(
      "npx",
      [
        "playwright",
        "test",
        ...(specs || []),
        "--reporter=json",
        `--base-url=${url}`,
      ],
      {
        cwd: this.projectPath,
        env: {
          ...process.env,
          BASE_URL: url,
        },
      }
    );

    return this.parsePlaywrightResults(stdout);
  }

  private buildCommand(config: TestConfig): { cmd: string; args: string[] } {
    switch (config.framework) {
      case "vitest":
        return {
          cmd: "npx",
          args: [
            "vitest",
            "run",
            ...(config.coverage ? ["--coverage"] : []),
            ...(config.filter ? ["--grep", config.filter] : []),
            "--reporter=json",
          ],
        };
      
      case "jest":
        return {
          cmd: "npx",
          args: [
            "jest",
            ...(config.coverage ? ["--coverage"] : []),
            ...(config.filter ? ["--testNamePattern", config.filter] : []),
            "--json",
          ],
        };
      
      case "playwright":
        return {
          cmd: "npx",
          args: [
            "playwright",
            "test",
            ...(config.filter ? [config.filter] : []),
            "--reporter=json",
          ],
        };
      
      default:
        throw new Error(`Unsupported framework: ${config.framework}`);
    }
  }

  private parseResults(
    stdout: string,
    stderr: string,
    config: TestConfig,
    duration: number
  ): TestResult {
    try {
      const jsonOutput = this.extractJson(stdout);
      
      if (config.framework === "vitest" || config.framework === "jest") {
        return this.parseJestVitestResults(jsonOutput, duration);
      } else if (config.framework === "playwright") {
        return this.parsePlaywrightResults(jsonOutput);
      }
    } catch (error) {
      console.error("Failed to parse test results:", error);
    }

    // Fallback parsing
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      duration,
    };
  }

  private extractJson(output: string): any {
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  }

  private parseJestVitestResults(json: any, duration: number): TestResult {
    return {
      passed: json.numPassedTests || 0,
      failed: json.numFailedTests || 0,
      skipped: json.numPendingTests || 0,
      duration,
      coverage: json.coverageMap ? {
        statements: json.coverageMap.statements.pct,
        branches: json.coverageMap.branches.pct,
        functions: json.coverageMap.functions.pct,
        lines: json.coverageMap.lines.pct,
      } : undefined,
      failures: json.testResults?.flatMap((suite: any) =>
        suite.assertionResults
          ?.filter((test: any) => test.status === "failed")
          .map((test: any) => ({
            test: test.fullName,
            error: test.failureMessages[0],
          }))
      ),
    };
  }

  private parsePlaywrightResults(jsonStr: string): TestResult {
    const json = JSON.parse(jsonStr);
    return {
      passed: json.stats.expected,
      failed: json.stats.unexpected,
      skipped: json.stats.skipped,
      duration: json.stats.duration,
      failures: json.suites?.flatMap((suite: any) =>
        suite.specs
          ?.filter((spec: any) => spec.tests.some((t: any) => t.status === "failed"))
          .map((spec: any) => ({
            test: spec.title,
            error: spec.tests[0].error?.message,
            stack: spec.tests[0].error?.stack,
          }))
      ),
    };
  }
}