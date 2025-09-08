import { execa } from "execa";
import fs from "fs-extra";
import path from "path";
import { glob } from "glob";

export class RepoOperations {
  constructor(private basePath: string) {}

  async cloneRepo(url: string, destination: string): Promise<void> {
    await execa("git", ["clone", url, destination], {
      cwd: this.basePath,
    });
  }

  async createBranch(name: string): Promise<void> {
    await execa("git", ["checkout", "-b", name], {
      cwd: this.basePath,
    });
  }

  async commitChanges(message: string): Promise<void> {
    await execa("git", ["add", "."], { cwd: this.basePath });
    await execa("git", ["commit", "-m", message], {
      cwd: this.basePath,
    });
  }

  async pushChanges(branch: string): Promise<void> {
    await execa("git", ["push", "origin", branch], {
      cwd: this.basePath,
    });
  }

  async createPullRequest(
    title: string,
    body: string,
    base: string = "main"
  ): Promise<string> {
    const { stdout } = await execa(
      "gh",
      ["pr", "create", "--title", title, "--body", body, "--base", base],
      { cwd: this.basePath }
    );
    return stdout;
  }

  async findFiles(pattern: string): Promise<string[]> {
    return glob(pattern, {
      cwd: this.basePath,
      ignore: ["node_modules/**", ".git/**"],
    });
  }

  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.readFile(fullPath, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, "utf-8");
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    await fs.remove(fullPath);
  }

  async copyFile(source: string, destination: string): Promise<void> {
    const sourcePath = path.join(this.basePath, source);
    const destPath = path.join(this.basePath, destination);
    await fs.copy(sourcePath, destPath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.pathExists(fullPath);
  }

  async getFileStats(filePath: string): Promise<fs.Stats> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.stat(fullPath);
  }
}