import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { listAllMarkdown, readAgents, type BrainFile } from "../store";
import type {
  AreaDepartment,
  DocInsight,
  ExtendedBrainStructure,
  TopicCluster,
} from "./types";
import type { BrainStructureEdge, BrainStructureNode } from "../../contracts/api";

const GERMAN_ENGLISH_STOPWORDS = new Set([
  "der", "die", "das", "und", "in", "den", "von", "zu", "mit", "auf", "ist",
  "des", "nicht", "eine", "eine", "als", "für", "oder", "aber", "aus", "nach",
  "bei", "durch", "über", "dem", "ein", "einer", "einem", "einen", "im", "am",
  "an", "es", "wie", "so", "dass", "da", "sich", "um", "wir", "ihr", "sie",
  "sie", "ihr", "uns", "auch", "noch", "nur", "vor", "mehr", "sehr", "kann",
  "können", "hat", "hatte", "wurde", "werden", "sein", "waren", "wird", "haben",
  "the", "and", "in", "of", "to", "a", "for", "is", "on", "that", "by", "this",
  "with", "it", "as", "at", "from", "an", "be", "or", "are", "from", "all",
  "md", "pdf", "mp4", "txt", "1", "2", "3", "0", "00", "000", "cnt",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !GERMAN_ENGLISH_STOPWORDS.has(w) && !/^\d+$/.test(w));
}

interface TermStats {
  tf: Map<string, number>;
  totalWords: number;
}

export async function analyzeBrainStructure(
  root: string,
  companyId = "cnt-kunc",
): Promise<ExtendedBrainStructure> {
  const start = Date.now();
  const allFiles = await listAllMarkdown(root);
  const cfg = await readAgents(root).catch(() => ({ agents: [], projects: [] }));

  // Limit full text reading to top 150 most recent/relevant markdown files for speed (< 500ms)
  const sortedFiles = [...allFiles].sort((a, b) => {
    const timeA = a.mtime ? new Date(a.mtime).getTime() : 0;
    const timeB = b.mtime ? new Date(b.mtime).getTime() : 0;
    return timeB - timeA;
  });

  const filesToRead = sortedFiles.slice(0, 150);
  const docStats = new Map<string, TermStats>();
  const docContents = new Map<string, string>();
  const docTitles = new Map<string, string>();
  const df = new Map<string, number>();

  let totalBrainWords = 0;

  for (const file of filesToRead) {
    const fullPath = path.join(root, ...file.path.split("/"));
    let content = "";
    try {
      if (existsSync(fullPath)) {
        content = await fs.readFile(fullPath, "utf8");
      }
    } catch {
      // ignore unreadable
    }

    docContents.set(file.path, content);
    const title = file.path.split("/").pop()?.replace(/\.md$/i, "") ?? file.path;
    docTitles.set(file.path, title);

    const tokens = tokenize(title + " " + title + " " + content.slice(0, 3000));
    const tf = new Map<string, number>();
    const seenInDoc = new Set<string>();

    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
      if (!seenInDoc.has(t)) {
        seenInDoc.add(t);
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    totalBrainWords += tokens.length;
    docStats.set(file.path, { tf, totalWords: tokens.length });
  }

  // Calculate TF-IDF top terms per document
  const N = Math.max(docStats.size, 1);
  const docKeywords = new Map<string, string[]>();

  for (const [docPath, stats] of docStats.entries()) {
    const scores: { word: string; score: number }[] = [];
    for (const [word, count] of stats.tf.entries()) {
      const termDf = df.get(word) ?? 1;
      const idf = Math.log((N + 1) / termDf) + 1;
      const tfVal = count / Math.max(stats.totalWords, 1);
      scores.push({ word, score: tfVal * idf });
    }
    scores.sort((a, b) => b.score - a.score);
    docKeywords.set(docPath, scores.slice(0, 5).map((s) => s.word));
  }

  // Predefined business departments + dynamic cluster matching
  const areaDefinitions: {
    id: string;
    name: string;
    description: string;
    color: string;
    keywords: string[];
    topics: { id: string; name: string; keywords: string[] }[];
  }[] = [
    {
      id: "area-vision-mgmt",
      name: "Strategie & Führung",
      description: "Vision, Unternehmensaufbau, Geschäftsmodelle & Prioritäten",
      color: "#8B5CF6", // purple
      keywords: ["vision", "strategie", "plan", "business", "ziel", "führung", "grundlagen", "fragenkatalog", "persönlich"],
      topics: [
        { id: "top-strat-01", name: "Unternehmensstrategie & Vision", keywords: ["plan", "connect", "vision", "ziel", "strategie"] },
        { id: "top-strat-02", name: "Mindset & Führungsgrundsätze", keywords: ["mindset", "tolle", "fragenkatalog", "lernen", "tippen"] },
      ],
    },
    {
      id: "area-tech-ai",
      name: "Produkt, Connect & KI",
      description: "Connect App, KI-Agenten, Automatisierung & Systemarchitektur",
      color: "#3B82F6", // blue
      keywords: ["connect", "agent", "spark", "tools", "code", "ki", "prompt", "lovable", "tokens", "figma", "ui", "chat"],
      topics: [
        { id: "top-tech-01", name: "Connect Core & Agenten-Swarm", keywords: ["connect", "agent", "spark", "swarm", "plan"] },
        { id: "top-tech-02", name: "KI Tools & No-Code / Lovable", keywords: ["lovable", "tools", "figma", "tokens", "chat"] },
        { id: "top-tech-03", name: "Automatisierung & Prompts", keywords: ["prompt", "prompts", "code", "browser", "action"] },
      ],
    },
    {
      id: "area-marketing-media",
      name: "Marketing, Video & Social",
      description: "YouTube Content, Shorts, Videoschnitt, Branding & Werbekampagnen",
      color: "#EC4899", // pink
      keywords: ["video", "youtube", "shorts", "brand", "audio", "sound", "premiere", "logo", "social", "thumbnail", "werben"],
      topics: [
        { id: "top-mkt-01", name: "Video Produktion & Premiere Pro", keywords: ["video", "premiere", "schnitt", "sound", "stimme", "audio"] },
        { id: "top-mkt-02", name: "YouTube, Shorts & Social Media", keywords: ["youtube", "shorts", "thumbnail", "instagram", "social"] },
        { id: "top-mkt-03", name: "Branding, Logo & Werbepsychologie", keywords: ["brand", "logo", "werben", "werbe", "inspiration"] },
      ],
    },
    {
      id: "area-finance-legal",
      name: "Finanzen, Krypto & Recht",
      description: "Investitionen, Krypto-Strategien, Buchhaltung, Steuern & Passwörter",
      color: "#10B981", // emerald
      keywords: ["crypto", "krypto", "investing", "steuern", "passwörter", "finanzen", "indikator", "trading"],
      topics: [
        { id: "top-fin-01", name: "Krypto-Portfolio & Trading", keywords: ["crypto", "krypto", "trading", "indikator", "investing"] },
        { id: "top-fin-02", name: "Finanzplanung, Steuern & Sicherheit", keywords: ["steuern", "passwörter", "finanz", "recht"] },
      ],
    },
    {
      id: "area-operations",
      name: "Tagesgeschäft & Organisation",
      description: "Routinen, tägliche Notizen, Wissenssammlung & Inbox",
      color: "#F59E0B", // amber
      keywords: ["daily", "inbox", "memory", "shared", "notiz", "draft", "entwurf", "material"],
      topics: [
        { id: "top-ops-01", name: "Tägliche Notizen & Protokolle", keywords: ["daily", "notiz", "protokoll", "tagebuch"] },
        { id: "top-ops-02", name: "Materialsammlung & Recherche", keywords: ["material", "analysis", "inbox", "entwurf", "clip"] },
      ],
    },
  ];

  // Assign documents to the best matching area and topic
  const docInsightsList: DocInsight[] = [];
  const topicDocMap = new Map<string, DocInsight[]>();
  const areaDocCount = new Map<string, number>();

  for (const file of allFiles) {
    const p = file.path.toLowerCase();
    const title = docTitles.get(file.path) ?? file.path.split("/").pop()?.replace(/\.md$/i, "") ?? file.path;
    const content = docContents.get(file.path) ?? "";
    const keywords = docKeywords.get(file.path) ?? tokenize(title).slice(0, 4);
    const snippet = content.slice(0, 180).replace(/[#*`>-]/g, " ").trim() || "Dokument im Spark Knowledge-Graph";

    // Score against each topic
    let bestTopicId = "top-ops-02";
    let bestAreaId = "area-operations";
    let highestScore = -1;

    for (const area of areaDefinitions) {
      let areaScore = 0;
      for (const kw of area.keywords) {
        if (p.includes(kw) || title.toLowerCase().includes(kw)) areaScore += 3;
        if (keywords.includes(kw)) areaScore += 2;
      }

      for (const top of area.topics) {
        let topicScore = areaScore;
        for (const kw of top.keywords) {
          if (p.includes(kw) || title.toLowerCase().includes(kw)) topicScore += 5;
          if (keywords.includes(kw)) topicScore += 3;
        }

        if (topicScore > highestScore) {
          highestScore = topicScore;
          bestTopicId = top.id;
          bestAreaId = area.id;
        }
      }
    }

    const docInsight: DocInsight = {
      path: file.path,
      title,
      snippet,
      keywords,
      wordCount: (docStats.get(file.path)?.totalWords ?? 0) || Math.max(Math.floor(content.length / 5), 10),
      mtime: file.mtime || new Date().toISOString(),
      areaId: bestAreaId,
      topicId: bestTopicId,
    };

    docInsightsList.push(docInsight);
    areaDocCount.set(bestAreaId, (areaDocCount.get(bestAreaId) ?? 0) + 1);

    if (!topicDocMap.has(bestTopicId)) {
      topicDocMap.set(bestTopicId, []);
    }
    topicDocMap.get(bestTopicId)!.push(docInsight);
  }

  // Build topics list
  const topicClusters: TopicCluster[] = [];
  const areaDepartments: AreaDepartment[] = [];

  for (const areaDef of areaDefinitions) {
    const areaTopics: TopicCluster[] = [];

    for (const tDef of areaDef.topics) {
      const docs = (topicDocMap.get(tDef.id) ?? []).sort((a, b) => {
        const timeA = new Date(a.mtime).getTime();
        const timeB = new Date(b.mtime).getTime();
        return timeB - timeA;
      });

      const cluster: TopicCluster = {
        id: tDef.id,
        name: tDef.name,
        areaId: areaDef.id,
        areaName: areaDef.name,
        keywords: tDef.keywords,
        docCount: docs.length,
        score: Math.min(Math.round(docs.length * 1.5 + (docs[0]?.wordCount ? 20 : 0)), 100),
        topDocs: docs.slice(0, 8),
      };

      areaTopics.push(cluster);
      topicClusters.push(cluster);
    }

    areaDepartments.push({
      id: areaDef.id,
      name: areaDef.name,
      description: areaDef.description,
      color: areaDef.color,
      docCount: areaDocCount.get(areaDef.id) ?? 0,
      topics: areaTopics,
    });
  }

  // Create Canonical Nodes & Edges according to Contract
  const nodes: BrainStructureNode[] = [];
  const edges: BrainStructureEdge[] = [];

  // 1. Company Root Node
  const companyNodeId = `comp-${companyId}`;
  nodes.push({
    id: companyNodeId,
    label: "Kunc GmbH / Spark Brain",
    kind: "company",
    status: "active",
    metadata: {
      companyId,
      totalFiles: allFiles.length,
      analyzedFiles: docInsightsList.length,
      totalWords: totalBrainWords,
      totalAreas: areaDepartments.length,
      totalTopics: topicClusters.length,
      computeDurationMs: Date.now() - start,
    },
  });

  // 2. Area Nodes
  for (const area of areaDepartments) {
    nodes.push({
      id: area.id,
      label: area.name,
      kind: "custom",
      status: "active",
      parentId: companyNodeId,
      metadata: {
        description: area.description,
        color: area.color,
        docCount: area.docCount,
      },
    });

    edges.push({
      id: `edge-${companyNodeId}-${area.id}`,
      source: companyNodeId,
      target: area.id,
      label: "bereich",
    });

    // 3. Topic Nodes
    for (const topic of area.topics) {
      nodes.push({
        id: topic.id,
        label: topic.name,
        kind: "topic",
        status: "active",
        parentId: area.id,
        metadata: {
          docCount: topic.docCount,
          score: topic.score,
          keywords: topic.keywords,
          topDocs: topic.topDocs.map((d) => ({ path: d.path, title: d.title })),
        },
      });

      edges.push({
        id: `edge-${area.id}-${topic.id}`,
        source: area.id,
        target: topic.id,
        label: "thema",
      });

      // 4. Top Document Nodes
      for (const doc of topic.topDocs.slice(0, 3)) {
        const docNodeId = `doc-${encodeURIComponent(doc.path).replace(/%/g, "_")}`;
        nodes.push({
          id: docNodeId,
          label: doc.title,
          kind: "doc",
          status: "synced",
          parentId: topic.id,
          metadata: {
            path: doc.path,
            snippet: doc.snippet,
            mtime: doc.mtime,
            wordCount: doc.wordCount,
          },
        });

        edges.push({
          id: `edge-${topic.id}-${docNodeId}`,
          source: topic.id,
          target: docNodeId,
          label: "dokument",
        });
      }
    }
  }

  // 5. Agent Nodes from agents.json
  for (const agent of cfg.agents) {
    const agentNodeId = `agent-${agent.slug}`;
    nodes.push({
      id: agentNodeId,
      label: agent.name || agent.slug,
      kind: "agent",
      status: "ready",
      metadata: {
        slug: agent.slug,
        connectAgentId: agent.connectAgentId,
        readAreas: agent.read,
        writeAreas: agent.write,
      },
    });

    // Link agent to the primary tech area
    edges.push({
      id: `edge-${companyNodeId}-${agentNodeId}`,
      source: companyNodeId,
      target: agentNodeId,
      label: "agent",
    });
  }

  const topTopics = [...topicClusters]
    .sort((a, b) => b.docCount - a.docCount)
    .slice(0, 8)
    .map((t) => ({ name: t.name, count: t.docCount, score: t.score }));

  return {
    companyId,
    nodes,
    edges,
    lastUpdated: new Date().toISOString(),
    stats: {
      totalDocs: allFiles.length,
      totalWords: totalBrainWords,
      totalTopics: topicClusters.length,
      totalAreas: areaDepartments.length,
      activeAgentsCount: cfg.agents.length,
      lastUpdated: new Date().toISOString(),
      topTopics,
    },
    areas: areaDepartments,
    topics: topicClusters,
  };
}
