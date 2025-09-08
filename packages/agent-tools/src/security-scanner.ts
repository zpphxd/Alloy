import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { z } from "zod";

export const SecurityConfigSchema = z.object({
  scanType: z.enum(["dependencies", "code", "secrets", "headers", "all"]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  autoFix: z.boolean().default(false),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export interface SecurityFinding {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  file?: string;
  line?: number;
  recommendation: string;
  cwe?: string;
  owasp?: string;
}

export interface SecurityReport {
  findings: SecurityFinding[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  passed: boolean;
  scannedAt: string;
}

export class SecurityScanner {
  constructor(private projectPath: string) {}

  async scan(config: SecurityConfig): Promise<SecurityReport> {
    const findings: SecurityFinding[] = [];
    
    if (config.scanType === "all" || config.scanType === "dependencies") {
      findings.push(...await this.scanDependencies());
    }
    
    if (config.scanType === "all" || config.scanType === "code") {
      findings.push(...await this.scanCode());
    }
    
    if (config.scanType === "all" || config.scanType === "secrets") {
      findings.push(...await this.scanSecrets());
    }
    
    if (config.scanType === "all" || config.scanType === "headers") {
      findings.push(...await this.scanHeaders());
    }
    
    const filteredFindings = this.filterBySeverity(findings, config.severity);
    
    if (config.autoFix) {
      await this.attemptAutoFix(filteredFindings);
    }
    
    return this.generateReport(filteredFindings);
  }

  private async scanDependencies(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    
    try {
      const { stdout } = await execa("npm", ["audit", "--json"], {
        cwd: this.projectPath,
      });
      
      const audit = JSON.parse(stdout);
      
      for (const [id, vuln] of Object.entries(audit.vulnerabilities || {})) {
        const v = vuln as any;
        findings.push({
          type: "dependency",
          severity: v.severity,
          title: `Vulnerable dependency: ${v.name}`,
          description: v.title || v.overview,
          recommendation: v.fixAvailable 
            ? `Update ${v.name} to version ${v.fixAvailable.version}`
            : "No fix available yet",
          cwe: v.cwe?.join(", "),
        });
      }
    } catch (error) {
      console.error("Dependency scan failed:", error);
    }
    
    return findings;
  }

  private async scanCode(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    
    // Check for common security issues
    const patterns = [
      {
        pattern: /eval\s*\(/g,
        title: "Dangerous eval() usage",
        severity: "high" as const,
        description: "eval() can execute arbitrary code",
        recommendation: "Use JSON.parse() or safer alternatives",
        cwe: "CWE-94",
      },
      {
        pattern: /innerHTML\s*=/g,
        title: "Potential XSS via innerHTML",
        severity: "medium" as const,
        description: "innerHTML can introduce XSS vulnerabilities",
        recommendation: "Use textContent or sanitize HTML",
        cwe: "CWE-79",
      },
      {
        pattern: /process\.env\.\w+/g,
        title: "Environment variable usage",
        severity: "low" as const,
        description: "Ensure sensitive data is not exposed",
        recommendation: "Validate and sanitize environment variables",
        cwe: "CWE-209",
      },
    ];
    
    const files = await this.findSourceFiles();
    
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const lines = content.split("\n");
      
      for (const { pattern, ...finding } of patterns) {
        lines.forEach((line, index) => {
          if (pattern.test(line)) {
            findings.push({
              ...finding,
              type: "code",
              file: path.relative(this.projectPath, file),
              line: index + 1,
            });
          }
        });
      }
    }
    
    return findings;
  }

  private async scanSecrets(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    
    const secretPatterns = [
      {
        pattern: /(?:api[_-]?key|apikey)["\s]*[:=]["\s]*["']([^"']+)["']/gi,
        type: "API Key",
      },
      {
        pattern: /(?:secret|password|passwd|pwd)["\s]*[:=]["\s]*["']([^"']+)["']/gi,
        type: "Password/Secret",
      },
      {
        pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
        type: "Private Key",
      },
      {
        pattern: /sk_live_[0-9a-zA-Z]{24,}/,
        type: "Stripe Secret Key",
      },
    ];
    
    const files = await this.findSourceFiles();
    
    for (const file of files) {
      const content = await fs.readFile(file, "utf-8");
      const lines = content.split("\n");
      
      for (const { pattern, type } of secretPatterns) {
        lines.forEach((line, index) => {
          const match = pattern.exec(line);
          if (match) {
            findings.push({
              type: "secret",
              severity: "critical",
              title: `Exposed ${type}`,
              description: `Found ${type} in source code`,
              file: path.relative(this.projectPath, file),
              line: index + 1,
              recommendation: "Move to environment variables and never commit secrets",
              cwe: "CWE-798",
            });
          }
        });
      }
    }
    
    return findings;
  }

  private async scanHeaders(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];
    
    // Check Next.js config for security headers
    const configPath = path.join(this.projectPath, "next.config.js");
    
    if (await fs.pathExists(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      
      const requiredHeaders = [
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Content-Security-Policy",
      ];
      
      for (const header of requiredHeaders) {
        if (!content.includes(header)) {
          findings.push({
            type: "headers",
            severity: "medium",
            title: `Missing security header: ${header}`,
            description: `${header} header is not configured`,
            file: "next.config.js",
            recommendation: `Add ${header} to your security headers configuration`,
            owasp: "A05:2021",
          });
        }
      }
    }
    
    return findings;
  }

  private async findSourceFiles(): Promise<string[]> {
    const { stdout } = await execa(
      "find",
      [
        this.projectPath,
        "-type", "f",
        "\\(",
        "-name", "*.js",
        "-o", "-name", "*.jsx",
        "-o", "-name", "*.ts",
        "-o", "-name", "*.tsx",
        "\\)",
        "-not", "-path", "*/node_modules/*",
        "-not", "-path", "*/.next/*",
      ],
      { shell: true }
    );
    
    return stdout.split("\n").filter(Boolean);
  }

  private filterBySeverity(
    findings: SecurityFinding[],
    minSeverity: string
  ): SecurityFinding[] {
    const severityOrder = ["low", "medium", "high", "critical"];
    const minIndex = severityOrder.indexOf(minSeverity);
    
    return findings.filter(f => 
      severityOrder.indexOf(f.severity) >= minIndex
    );
  }

  private async attemptAutoFix(findings: SecurityFinding[]): Promise<void> {
    for (const finding of findings) {
      if (finding.type === "dependency" && finding.recommendation.includes("Update")) {
        // Attempt to update vulnerable dependencies
        try {
          const packageMatch = finding.recommendation.match(/Update (\S+) to version (\S+)/);
          if (packageMatch) {
            await execa("npm", ["install", `${packageMatch[1]}@${packageMatch[2]}`], {
              cwd: this.projectPath,
            });
          }
        } catch (error) {
          console.error(`Failed to auto-fix ${finding.title}:`, error);
        }
      }
    }
  }

  private generateReport(findings: SecurityFinding[]): SecurityReport {
    const summary = {
      total: findings.length,
      critical: findings.filter(f => f.severity === "critical").length,
      high: findings.filter(f => f.severity === "high").length,
      medium: findings.filter(f => f.severity === "medium").length,
      low: findings.filter(f => f.severity === "low").length,
    };
    
    return {
      findings,
      summary,
      passed: summary.critical === 0 && summary.high === 0,
      scannedAt: new Date().toISOString(),
    };
  }
}