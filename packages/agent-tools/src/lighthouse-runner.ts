import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { z } from "zod";

export const LighthouseConfigSchema = z.object({
  url: z.string().url(),
  categories: z.array(z.enum(["performance", "accessibility", "best-practices", "seo", "pwa"]))
    .default(["performance", "accessibility"]),
  budget: z.object({
    performance: z.number().min(0).max(100).optional(),
    accessibility: z.number().min(0).max(100).optional(),
    bestPractices: z.number().min(0).max(100).optional(),
    seo: z.number().min(0).max(100).optional(),
    pwa: z.number().min(0).max(100).optional(),
  }).optional(),
  device: z.enum(["mobile", "desktop"]).default("mobile"),
});

export type LighthouseConfig = z.infer<typeof LighthouseConfigSchema>;

export interface LighthouseResult {
  scores: {
    performance?: number;
    accessibility?: number;
    bestPractices?: number;
    seo?: number;
    pwa?: number;
  };
  metrics: {
    firstContentfulPaint?: number;
    largestContentfulPaint?: number;
    totalBlockingTime?: number;
    cumulativeLayoutShift?: number;
    speedIndex?: number;
    timeToInteractive?: number;
  };
  opportunities: Array<{
    id: string;
    title: string;
    description: string;
    savings?: number;
  }>;
  diagnostics: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  budgetPassed: boolean;
}

export class LighthouseRunner {
  async run(config: LighthouseConfig): Promise<LighthouseResult> {
    const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless"] });
    
    try {
      const options = {
        logLevel: "info" as const,
        output: "json" as const,
        onlyCategories: config.categories,
        port: chrome.port,
        formFactor: config.device,
        screenEmulation: config.device === "mobile" ? {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          disabled: false,
        } : {
          mobile: false,
          width: 1350,
          height: 940,
          deviceScaleFactor: 1,
          disabled: false,
        },
      };

      const runnerResult = await lighthouse(config.url, options);
      
      if (!runnerResult || !runnerResult.lhr) {
        throw new Error("Lighthouse failed to generate report");
      }

      const lhr = runnerResult.lhr;
      
      return this.parseResults(lhr, config.budget);
    } finally {
      await chrome.kill();
    }
  }

  private parseResults(lhr: any, budget?: LighthouseConfig["budget"]): LighthouseResult {
    const scores: LighthouseResult["scores"] = {};
    const metrics: LighthouseResult["metrics"] = {};
    const opportunities: LighthouseResult["opportunities"] = [];
    const diagnostics: LighthouseResult["diagnostics"] = [];

    // Extract scores
    if (lhr.categories.performance) {
      scores.performance = Math.round(lhr.categories.performance.score * 100);
    }
    if (lhr.categories.accessibility) {
      scores.accessibility = Math.round(lhr.categories.accessibility.score * 100);
    }
    if (lhr.categories["best-practices"]) {
      scores.bestPractices = Math.round(lhr.categories["best-practices"].score * 100);
    }
    if (lhr.categories.seo) {
      scores.seo = Math.round(lhr.categories.seo.score * 100);
    }
    if (lhr.categories.pwa) {
      scores.pwa = Math.round(lhr.categories.pwa.score * 100);
    }

    // Extract performance metrics
    if (lhr.audits) {
      if (lhr.audits["first-contentful-paint"]) {
        metrics.firstContentfulPaint = lhr.audits["first-contentful-paint"].numericValue;
      }
      if (lhr.audits["largest-contentful-paint"]) {
        metrics.largestContentfulPaint = lhr.audits["largest-contentful-paint"].numericValue;
      }
      if (lhr.audits["total-blocking-time"]) {
        metrics.totalBlockingTime = lhr.audits["total-blocking-time"].numericValue;
      }
      if (lhr.audits["cumulative-layout-shift"]) {
        metrics.cumulativeLayoutShift = lhr.audits["cumulative-layout-shift"].numericValue;
      }
      if (lhr.audits["speed-index"]) {
        metrics.speedIndex = lhr.audits["speed-index"].numericValue;
      }
      if (lhr.audits["interactive"]) {
        metrics.timeToInteractive = lhr.audits["interactive"].numericValue;
      }
    }

    // Extract opportunities
    Object.values(lhr.audits || {}).forEach((audit: any) => {
      if (audit.score !== null && audit.score < 0.9 && audit.details?.type === "opportunity") {
        opportunities.push({
          id: audit.id,
          title: audit.title,
          description: audit.description,
          savings: audit.details?.overallSavingsMs,
        });
      }
    });

    // Extract diagnostics
    Object.values(lhr.audits || {}).forEach((audit: any) => {
      if (audit.score !== null && audit.score < 0.9 && audit.details?.type === "table") {
        diagnostics.push({
          id: audit.id,
          title: audit.title,
          description: audit.description,
        });
      }
    });

    // Check if budget is met
    let budgetPassed = true;
    if (budget) {
      if (budget.performance && scores.performance && scores.performance < budget.performance) {
        budgetPassed = false;
      }
      if (budget.accessibility && scores.accessibility && scores.accessibility < budget.accessibility) {
        budgetPassed = false;
      }
      if (budget.bestPractices && scores.bestPractices && scores.bestPractices < budget.bestPractices) {
        budgetPassed = false;
      }
      if (budget.seo && scores.seo && scores.seo < budget.seo) {
        budgetPassed = false;
      }
      if (budget.pwa && scores.pwa && scores.pwa < budget.pwa) {
        budgetPassed = false;
      }
    }

    return {
      scores,
      metrics,
      opportunities: opportunities.slice(0, 5), // Top 5 opportunities
      diagnostics: diagnostics.slice(0, 5), // Top 5 diagnostics
      budgetPassed,
    };
  }

  async compareRuns(
    urls: string[],
    config: Omit<LighthouseConfig, "url">
  ): Promise<{ url: string; result: LighthouseResult }[]> {
    const results: { url: string; result: LighthouseResult }[] = [];
    
    for (const url of urls) {
      const result = await this.run({ ...config, url });
      results.push({ url, result });
    }
    
    return results;
  }
}