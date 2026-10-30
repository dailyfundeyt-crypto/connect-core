/** Contract v06 – Änderungen nur durch A00/Integrator */

export type MultiLoginAppId = "codex" | "antigravity" | "manus" | "grokbot" | "cue";

export interface MultiLoginAppDef {
  id: MultiLoginAppId;
  name: string;
  iconUrl: string;
  launch: {
    kind: "web" | "desktop" | "cli";
    target: string;
  };
  supportsLivePreview: boolean;
}
