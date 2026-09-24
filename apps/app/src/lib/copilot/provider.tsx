import { CopilotKitProvider } from "@copilotkit/react-core/v2";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect } from "react";
import { deploymentCapabilitiesQueryOptions } from "@/lib/deployment/queries";
import { a2uiProviderOptions } from "./a2ui";
import "./a2ui.css";
import { ActiveBotProvider } from "./active-bot";
import { BotTools } from "./bot-tools";
import { ComputerTools } from "./computer-tools";
import { EscalationTool } from "./escalation-tool";
import { GalleryTools } from "./gallery-tools";
import { GENERATIVE_UI_DESIGN_SKILL } from "./generative-ui";
import { HandoffTool } from "./handoff-tool";
import { HermesPlanTools } from "./hermes-tools";
import { SandboxedTools } from "./sandboxed-tools";
import { SkillTools } from "./skill-tools";

/** Offset CSS already hides CopilotKit license chrome — do not remove DOM nodes under React. */
function useStripCopilotKitLicenseChrome() {
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--copilotkit-license-banner-offset",
      "0px",
    );
  }, []);
}

/**
 * Local-first Connect chat client. Inspector and license chrome are disabled.
 */
export function CopilotProvider({ children }: { children: ReactNode }) {
  const { data: capabilities } = useQuery(deploymentCapabilitiesQueryOptions());
  useStripCopilotKitLicenseChrome();

  return (
    <CopilotKitProvider
      runtimeUrl="/api/copilotkit"
      credentials="include"
      enableInspector={false}
      {...a2uiProviderOptions(capabilities?.generativeUi)}
      {...(capabilities?.generativeUi
        ? { openGenerativeUI: { designSkill: GENERATIVE_UI_DESIGN_SKILL } }
        : {})}
    >
      <ActiveBotProvider>
        <ComputerTools />
        <HermesPlanTools />
        <HandoffTool />
        <EscalationTool />
        <GalleryTools />
        <SandboxedTools />
        <SkillTools />
        <BotTools />
        {children}
      </ActiveBotProvider>
    </CopilotKitProvider>
  );
}
