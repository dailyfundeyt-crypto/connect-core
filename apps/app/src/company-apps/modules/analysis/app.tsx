import { useState } from "react";
import type { CompanyAppProps } from "../../types";
import { SocialApp, type SocialView } from "@/components/social/social-app";

/** Reuses Connect's existing Analysis page inside the Messages workspace. */
export default function AnalysisCompanyApp(_props: CompanyAppProps) {
  const [view, setView] = useState<SocialView>({ tab: "home" });

  return (
    <div className="dark flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#07080c] text-white">
      <SocialApp
        onExit={() => setView({ tab: "home" })}
        onNavigate={setView}
        view={view}
        variant="page"
      />
    </div>
  );
}
