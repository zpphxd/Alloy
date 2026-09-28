/**
 * ZoomInfo: company resolution, lookalikes, scoops, intent, and contacts.
 *
 * Pescadora talks to ZoomInfo through the `CompanyIntel` interface so the
 * pipeline doesn't care which way we reach it:
 *  - `ZoomInfoApi`: the Enterprise REST API, for the 24/7 unattended run.
 *    Needs API credentials from Baldwin's ZoomInfo admin.
 *  - Interactive: during a Claude session the ZoomInfo MCP connector does the
 *    same lookups (search_companies, find_similar_companies, search_scoops,
 *    search_intent, enrich_contacts). Results are saved as JSON in
 *    data/zoominfo/ and loaded with `FileIntel`.
 *
 * Compliance: ZoomInfo data is licensed. Keep it in data/ (gitignored), use it
 * only for this targeted research, and don't bulk-export or share it.
 */
import { readFile } from "node:fs/promises";

export interface CompanyMatch {
  zoominfoId: string;
  name: string;
  website?: string;
  hqState?: string;
  employeeCount?: number;
  revenueUsd?: number;
  industries?: string[];
  parentName?: string;
}

export interface Scoop {
  companyId: string;
  date: string;
  topic: string;
  description: string;
}

export interface ContactMatch {
  companyId: string;
  name: string;
  title: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}

export interface CompanyIntel {
  findCompany(name: string): Promise<CompanyMatch | null>;
  similarCompanies(seed: CompanyMatch, limit?: number): Promise<CompanyMatch[]>;
  scoops(companyId: string, sinceIso: string): Promise<Scoop[]>;
  decisionMakers(companyId: string): Promise<ContactMatch[]>;
}

/**
 * ZoomInfo Enterprise API client. The endpoint paths below follow ZoomInfo's
 * published Enterprise API (authenticate -> JWT, then /search and /enrich).
 * Field names differ by contract, so check the request and response mapping
 * against Baldwin's API docs before the first unattended run. The mapping is
 * isolated in `mapCompany` for that reason.
 */
export class ZoomInfoApi implements CompanyIntel {
  private jwt?: { token: string; expires: number };
  constructor(
    private username = process.env.ZOOMINFO_USERNAME,
    private password = process.env.ZOOMINFO_PASSWORD,
    private base = "https://api.zoominfo.com",
  ) {}

  private async token(): Promise<string> {
    if (this.jwt && this.jwt.expires > Date.now()) return this.jwt.token;
    if (!this.username || !this.password) throw new Error("ZOOMINFO_USERNAME / ZOOMINFO_PASSWORD not set");
    const res = await fetch(`${this.base}/authenticate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    if (!res.ok) throw new Error(`ZoomInfo auth failed: ${res.status}`);
    const { jwt } = (await res.json()) as { jwt: string };
    this.jwt = { token: jwt, expires: Date.now() + 55 * 60_000 };
    return jwt;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`ZoomInfo ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  private mapCompany(c: Record<string, unknown>): CompanyMatch {
    return {
      zoominfoId: String(c.id),
      name: String(c.name),
      website: c.website as string | undefined,
      hqState: c.state as string | undefined,
      employeeCount: c.employeeCount as number | undefined,
      revenueUsd: typeof c.revenue === "number" ? c.revenue * 1000 : undefined,
      parentName: (c.parentName as string | undefined) || undefined,
    };
  }

  async findCompany(name: string): Promise<CompanyMatch | null> {
    const r = await this.post<{ data: Record<string, unknown>[] }>("/search/company", { companyName: name, rpp: 1 });
    return r.data[0] ? this.mapCompany(r.data[0]) : null;
  }

  async similarCompanies(): Promise<CompanyMatch[]> {
    // Lookalikes aren't a standard Enterprise API endpoint. Use the MCP
    // connector's find_similar_companies interactively and load via FileIntel.
    throw new Error("similarCompanies: use the ZoomInfo MCP connector + FileIntel");
  }

  async scoops(companyId: string, sinceIso: string): Promise<Scoop[]> {
    const r = await this.post<{ data: Record<string, unknown>[] }>("/search/scoop", {
      companyId,
      publishedStartDate: sinceIso.slice(0, 10),
    });
    return r.data.map((s) => ({
      companyId,
      date: String(s.publishedDate ?? ""),
      topic: String(s.topics ?? s.type ?? ""),
      description: String(s.description ?? ""),
    }));
  }

  async decisionMakers(companyId: string): Promise<ContactMatch[]> {
    const r = await this.post<{ data: Record<string, unknown>[] }>("/search/contact", {
      companyId,
      managementLevel: "C Level Exec,VP Level Exec,Director",
      jobFunction: "Finance,Risk Management,Operations",
      rpp: 10,
    });
    return r.data.map((c) => ({
      companyId,
      name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
      title: String(c.jobTitle ?? ""),
    }));
  }
}

/** Reads ZoomInfo results saved from an interactive (MCP) session. */
export class FileIntel implements CompanyIntel {
  private companies: CompanyMatch[] = [];
  private scoopList: Scoop[] = [];
  private contacts: ContactMatch[] = [];
  static async load(path = "data/zoominfo/intel.json"): Promise<FileIntel> {
    const f = new FileIntel();
    try {
      const j = JSON.parse(await readFile(path, "utf8")) as { companies?: CompanyMatch[]; scoops?: Scoop[]; contacts?: ContactMatch[] };
      f.companies = j.companies ?? [];
      f.scoopList = j.scoops ?? [];
      f.contacts = j.contacts ?? [];
    } catch {
      // No saved intel yet.
    }
    return f;
  }
  async findCompany(name: string) {
    const n = name.toLowerCase();
    return this.companies.find((c) => c.name.toLowerCase() === n) ?? null;
  }
  async similarCompanies() {
    return this.companies;
  }
  async scoops(companyId: string, sinceIso: string) {
    return this.scoopList.filter((s) => s.companyId === companyId && s.date >= sinceIso);
  }
  async decisionMakers(companyId: string) {
    return this.contacts.filter((c) => c.companyId === companyId);
  }
}
