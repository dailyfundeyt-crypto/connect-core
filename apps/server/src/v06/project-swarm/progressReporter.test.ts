import { describe, it, expect, beforeEach } from "bun:test";
import { ProgressReporter } from "./progressReporter";
import type { ResearchProject, ProjectTask, SocialPost } from "../../contracts/v06/social";

describe("ProgressReporter", () => {
  let reporter: ProgressReporter;

  const mockProject: ResearchProject = {
    id: "proj-cancer-1",
    title: "Krebsforschung: Dezentrales KRAS G12D Screening",
    goal: "Virtuelles Screening und Inhibitoren-Validierung",
    accountCompanyId: "comp-research",
    isNonProfit: true,
    status: "running",
  };

  const mockTasks: ProjectTask[] = [
    {
      id: "t1",
      projectId: "proj-cancer-1",
      title: "PDB-Recherche",
      acceptance: "20 Strukturen extrahiert",
      status: "done",
    },
    {
      id: "t2",
      projectId: "proj-cancer-1",
      title: "Docking-Hypothesen",
      acceptance: "Bindungsenergien berechnet",
      status: "done",
    },
    {
      id: "t3",
      projectId: "proj-cancer-1",
      title: "ADMET-Toxizität",
      acceptance: "Filter angewendet",
      status: "todo",
    },
  ];

  beforeEach(() => {
    reporter = new ProgressReporter();
  });

  it("attaches mandatory medical disclaimer to oncology / health projects", () => {
    const report = reporter.createReport({
      project: mockProject,
      allTasks: mockTasks,
      activeBots: ["bot-1", "bot-2"],
      tokensUsed: 12500,
    });

    expect(report.medicalDisclaimer).toBeDefined();
    expect(report.medicalDisclaimer).toContain("HINWEIS FORSCHUNGSDATEN");
    expect(report.summaryText).toContain("67% abgeschlossen");
  });

  it("does not attach medical disclaimer to general projects", () => {
    const generalProject: ResearchProject = {
      id: "proj-gen-1",
      title: "Compiler-Optimierung für WebAssembly",
      goal: "Code-Generierung beschleunigen",
      accountCompanyId: "comp-tech",
      isNonProfit: false,
      status: "running",
    };

    const report = reporter.createReport({
      project: generalProject,
      allTasks: mockTasks,
      activeBots: ["bot-1"],
    });

    expect(report.medicalDisclaimer).toBeUndefined();
  });

  it("publishes report as SocialPost via post service", async () => {
    const report = reporter.createReport({
      project: mockProject,
      allTasks: mockTasks,
      activeBots: ["bot-1"],
    });

    let publishedInput: any = null;
    const mockPostService = async (input: any): Promise<SocialPost> => {
      publishedInput = input;
      return {
        id: "post-123",
        authorCompanyId: input.authorCompanyId,
        authorBotId: input.authorBotId,
        kind: input.kind,
        text: input.text,
        mediaUrls: [],
        createdAt: new Date().toISOString(),
      };
    };

    const post = await reporter.publishReportAsPost(
      report,
      mockProject.accountCompanyId,
      "bot-reporter",
      mockPostService,
    );

    expect(post.id).toBe("post-123");
    expect(publishedInput.kind).toBe("project_update");
    expect(publishedInput.text).toContain(ProgressReporter.MEDICAL_DISCLAIMER);
  });
});
