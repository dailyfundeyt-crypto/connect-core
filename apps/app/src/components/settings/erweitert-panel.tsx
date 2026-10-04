import { useState } from "react";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getLabPrefs,
  setLabKeepLoggedIn,
  subscribeLabPrefs,
} from "@/lib/ui/lab-prefs";

/**
 * Advanced settings hidden behind a disclosure toggle.
 * Collapsed by default — not shown unless the user clicks "Erweitert".
 */
export function ErweitertPanel() {
  const [open, setOpen] = useState(false);
  const [labKeepLogin, setLabKeepLogin] = useState(() => getLabPrefs().keepLoggedIn);

  // Subscribe to live changes
  useState(() => {
    return subscribeLabPrefs(() => setLabKeepLogin(getLabPrefs().keepLoggedIn));
  });

  return (
    <div className="mt-8 border-t border-white/[0.06] pt-6">
      <SettingsSectionHeader
        description="Experimentelle Funktionen und Browser-Verhalten, die noch in Entwicklung sind."
        title="Erweitert"
      />
      <button
        className="flex w-full cursor-pointer items-center gap-2 text-sm text-[#888] transition-colors hover:text-white"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        {open ? (
          <IconChevronDown className="size-4" />
        ) : (
          <IconChevronRight className="size-4" />
        )}
        Erweitert
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-template-rows: 1fr" : "grid-template-rows: 0fr",
        )}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
        }}
      >
        <div className="overflow-hidden">
          <div className="mt-6 flex flex-col gap-0">
            {/* Lab angemeldet lassen */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-0 py-3">
              <div>
                <p className="text-sm font-medium text-white">Lab angemeldet lassen</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Connect-Chrome-Profil behält Logins und Extensions
                </p>
              </div>
              <Switch
                aria-label="Lab dauerhaft angemeldet"
                checked={labKeepLogin}
                onCheckedChange={(checked) => {
                  setLabKeepLoggedIn(checked);
                  setLabKeepLogin(checked);
                }}
              />
            </div>

            {/* Usage panel */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-0 py-3">
              <div>
                <p className="text-sm font-medium text-white">Usage anzeigen</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Codex-Nutzung und Voice-Zeichen (ElevenLabs)
                </p>
              </div>
              <Button
                render={(props) => (
                  <a href="#usage" {...props}>
                    Öffnen
                  </a>
                )}
                size="sm"
                type="button"
                variant="ghost"
              />
            </div>

            {/* Focus Timer */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-0 py-3">
              <div>
                <p className="text-sm font-medium text-white">Focus-Timer</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Kurzer Countdown für Fokus
                </p>
              </div>
              <Button
                render={(props) => (
                  <a href="#timer" {...props}>
                    Öffnen
                  </a>
                )}
                size="sm"
                type="button"
                variant="ghost"
              />
            </div>

            {/* Spenden */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-0 py-3">
              <div>
                <p className="text-sm font-medium text-white">Spenden</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Connect unterstützen
                </p>
              </div>
              <Button
                render={(props) => (
                  <a href="#donate" {...props}>
                    Öffnen
                  </a>
                )}
                size="sm"
                type="button"
                variant="ghost"
              />
            </div>

            {/* Standing Instructions */}
            <div className="flex items-center justify-between px-0 py-3">
              <div>
                <p className="text-sm font-medium text-white">Standing Instructions</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Globale Anweisungen für alle Agents
                </p>
              </div>
              <Button
                render={(props) => (
                  <a href="#standing-instructions" {...props}>
                    Öffnen
                  </a>
                )}
                size="sm"
                type="button"
                variant="ghost"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
