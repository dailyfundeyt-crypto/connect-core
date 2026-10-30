import * as fs from "node:fs";
import * as path from "node:path";
import type { SimEntity, SimRelation } from "./types";

export interface ExtractedWorldModel {
  runId: string;
  sourceFiles: string[];
  entities: SimEntity[];
  relations: SimRelation[];
  summary: {
    totalEntities: number;
    totalRelations: number;
    companiesCount: number;
    productsCount: number;
    resourcesCount: number;
    goalsCount: number;
    marketsCount: number;
  };
}

export class SeedExtractor {
  /**
   * Primary extraction entry point:
   * Parses either provided markdown paths or raw text strings.
   * If paths are missing or unreachable, safely falls back to known Stefan CNT / Connect knowledge graph.
   */
  public static extractFromFiles(
    runId: string,
    filePaths?: string[],
    rawContents?: { filename: string; content: string }[]
  ): ExtractedWorldModel {
    const loadedFiles: { path: string; content: string }[] = [];

    // 1. Try reading specified file paths from disk
    if (filePaths && filePaths.length > 0) {
      for (const p of filePaths) {
        try {
          if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, "utf-8");
            loadedFiles.push({ path: p, content });
          }
        } catch {
          // Graceful ignore, will fall back if empty
        }
      }
    }

    // 2. Add raw contents if provided
    if (rawContents && rawContents.length > 0) {
      for (const item of rawContents) {
        loadedFiles.push({ path: item.filename, content: item.content });
      }
    }

    // 3. Fallback to default Spark vault locations if no files loaded
    if (loadedFiles.length === 0) {
      const defaultVaultPaths = [
        "C:\\Users\\Kunc GmbH\\Documents\\000_CNT\\Plannung\\00 A CNT\\Business\\CNT\\CNT Idee.md",
        "C:\\Users\\Kunc GmbH\\Documents\\000_CNT\\Plannung\\00 A CNT\\Business\\CNT\\Code Stand\\Connect\\Plan 1.md",
        "C:\\Users\\Kunc GmbH\\Documents\\000_CNT\\Plannung\\00 A CNT\\000_CNT Computing.md",
      ];

      for (const p of defaultVaultPaths) {
        try {
          if (fs.existsSync(p)) {
            const content = fs.readFileSync(p, "utf-8");
            loadedFiles.push({ path: p, content });
          }
        } catch {
          // Ignore
        }
      }
    }

    // 4. If still empty, use canonical built-in CNT and Connect knowledge
    if (loadedFiles.length === 0) {
      loadedFiles.push({
        path: "CNT Idee.md (Builtin Model)",
        content: `# CNT Holding\nCEO: Stefan Kunc\nCompanies: Connect, Hyper, Nexus, Spark, Analysis, Consensus, Flux`,
      });
      loadedFiles.push({
        path: "Connect Plan 1.md (Builtin Model)",
        content: `# Connect App\nMulti-Agent Platform, Mobile-First Web & Windows App, Bot Avatars, Whisper Transcriber`,
      });
    }

    return this.parseContents(runId, loadedFiles);
  }

  /**
   * Parses markdown contents into structured entities and relations.
   */
  private static parseContents(
    runId: string,
    files: { path: string; content: string }[]
  ): ExtractedWorldModel {
    const entityMap = new Map<string, SimEntity>();
    const relationList: SimRelation[] = [];

    const addEntity = (
      id: string,
      name: string,
      type: string,
      attributes: Record<string, unknown> = {}
    ) => {
      const cleanId = id.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      if (!entityMap.has(cleanId)) {
        entityMap.set(cleanId, {
          runId,
          id: cleanId,
          name,
          type,
          attributes,
        });
      }
    };

    const addRelation = (
      sourceId: string,
      targetId: string,
      type: string,
      weight = 1.0,
      attributes: Record<string, unknown> = {}
    ) => {
      const s = sourceId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const t = targetId.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      relationList.push({
        runId,
        source: s,
        target: t,
        type,
        weight,
        attributes,
      });
    };

    // Baseline Core Holding Entities
    addEntity("holding_cnt", "CNT Holding", "company", {
      sector: "Holding & Multi-Venture Group",
      founder: "Stefan Kunc",
      headquarters: "Host Kunc GmbH",
    });

    addEntity("team_stefan_kunc", "Stefan Kunc", "team", {
      role: "CEO & Founder",
      decisionAuthority: "Ultimate",
    });

    addEntity("team_marshall_rise", "Marshall Rise", "team", {
      role: "Operations & Co-Founder",
    });

    addEntity("team_prinz", "Prinz", "team", {
      role: "Core Execution & Support",
    });

    addRelation("team_stefan_kunc", "holding_cnt", "leads", 1.0, { position: "CEO" });
    addRelation("team_marshall_rise", "holding_cnt", "operates_with", 0.9);
    addRelation("team_prinz", "holding_cnt", "supports", 0.8);

    for (const f of files) {
      const text = f.content;
      const lower = text.toLowerCase();

      // Check for Companies
      if (lower.includes("connect")) {
        addEntity("company_connect", "Connect", "company", {
          focus: "Multi-AI-Agent Platform & Developer Suite",
          stack: "Helium localhost:3101, Postgres 5544, Bun/Hono/React",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_connect", "owns", 1.0, { coreVenture: true });
      }

      if (lower.includes("hyper")) {
        addEntity("company_hyper", "Hyper", "company", {
          focus: "Crypto Trading & Automated Financial Systems",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_hyper", "owns", 0.8);
      }

      if (lower.includes("spark")) {
        addEntity("company_spark", "Spark", "company", {
          focus: "Personal Knowledge Vault, Learning & Book Intelligence",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_spark", "owns", 0.9);
      }

      if (lower.includes("flux")) {
        addEntity("company_flux", "Flux", "company", {
          focus: "E-Commerce & Physical Product Distribution",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_flux", "owns", 0.7);
      }

      if (lower.includes("nexus")) {
        addEntity("company_nexus", "Nexus", "company", {
          focus: "Affiliate & Freelancer Scaling",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_nexus", "owns", 0.6);
      }

      if (lower.includes("consensus")) {
        addEntity("company_consensus", "Consensus", "company", {
          focus: "Digital Products & Creator Commerce",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_consensus", "owns", 0.7);
      }

      if (lower.includes("analysis")) {
        addEntity("company_analysis", "Analysis", "company", {
          focus: "Social Media Intelligence, YouTube & Content Production",
          sourceFile: path.basename(f.path),
        });
        addRelation("holding_cnt", "company_analysis", "owns", 0.8);
      }

      // Check for Products & Features
      if (lower.includes("botavatar") || lower.includes("bot-avatars") || lower.includes("avatar")) {
        addEntity("prod_bot_avatars", "Bot Avatars 2D Rig", "product", {
          feature: "Reactive animated avatars for agents",
          library: "bot-avatars",
        });
        addRelation("company_connect", "prod_bot_avatars", "deploys", 0.9);
      }

      if (lower.includes("mobile") || lower.includes("responsive")) {
        addEntity("prod_mobile_connect", "Connect Mobile & Desktop App", "product", {
          feature: "390px responsive Dark-Mode UI & Electron/Windows EXE",
        });
        addRelation("company_connect", "prod_mobile_connect", "serves_as", 1.0);
      }

      if (lower.includes("colab") || lower.includes("whisper") || lower.includes("80 gb")) {
        addEntity("res_decentralized_compute", "300 Colab GPU Compute Network", "resource", {
          capacity: "80 GB VRAM nodes",
          models: "Whisper large-v3, Real-ESRGAN 4K",
          orchestration: "Supabase Queue / Connect Dispatcher",
        });
        addRelation("company_connect", "res_decentralized_compute", "utilizes", 0.95);
      }

      // Target Markets
      addEntity("market_ai_engineers", "AI Engineers & Solopreneurs", "market", {
        segment: "B2B Prosumer",
        willingnessToPay: "High (€99-€499/mo)",
        painPoint: "Token costs, multi-agent coordination chaos",
      });
      addRelation("company_connect", "market_ai_engineers", "targets", 0.9);

      addEntity("market_smb_automation", "German Mittelstand / SMB Automation", "market", {
        segment: "SMB",
        willingnessToPay: "Enterprise tier (€1k-€5k/mo)",
        painPoint: "Manual operations, lack of specialized agent workforces",
      });
      addRelation("company_connect", "market_smb_automation", "targets", 0.75);

      // Strategic Goals
      addEntity("goal_100k_mrr", "Scale to €100k MRR", "goal", {
        targetMetric: "€100,000/month",
        horizon: "12-18 months",
        priority: 1,
      });
      addRelation("holding_cnt", "goal_100k_mrr", "aims_for", 1.0);

      addEntity("goal_zero_ruin", "Zero Ruin Operating Principle", "goal", {
        rule: "Keep gross margin > 80%, runway > 12 months, zero debt risk",
        priority: 1,
      });
      addRelation("holding_cnt", "goal_zero_ruin", "governed_by", 1.0);

      // Book Framework Entity ($100M Money Models)
      addEntity("res_100m_frameworks", "Alex Hormozi $100M Money Models", "resource", {
        source: "swarm-v3/sources/100m-book.txt",
        privacy: "private",
        sections: ["Attraction Offers", "Upsell Offers", "Downsell Offers", "Continuity Offers", "Make Your Money Model"],
      });
      addRelation("company_connect", "res_100m_frameworks", "guided_by", 1.0);
    }

    const entities = Array.from(entityMap.values());

    return {
      runId,
      sourceFiles: files.map((f) => f.path),
      entities,
      relations: relationList,
      summary: {
        totalEntities: entities.length,
        totalRelations: relationList.length,
        companiesCount: entities.filter((e) => e.type === "company").length,
        productsCount: entities.filter((e) => e.type === "product").length,
        resourcesCount: entities.filter((e) => e.type === "resource").length,
        goalsCount: entities.filter((e) => e.type === "goal").length,
        marketsCount: entities.filter((e) => e.type === "market").length,
      },
    };
  }
}
