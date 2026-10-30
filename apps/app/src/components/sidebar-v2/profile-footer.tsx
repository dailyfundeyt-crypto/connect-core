import {
  IconChartBar,
  IconClock,
  IconDeviceMobile,
  IconLogout,
  IconMoon,
  IconSettings,
  IconSun,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarFooter, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import {
  getLocalProfile,
  subscribeLocalProfile,
  type LocalProfile,
} from "@/lib/auth/local-profile";
import { goToSignInAfterSignOut, signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  formatFocusTimer,
  getFocusTimer,
  resetFocusTimer,
  subscribeFocusTimer,
  toggleFocusTimer,
} from "@/lib/focus-timer";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

const userMenuItemClassName = "gap-2.5 px-2.5 py-2 text-xs rounded-lg cursor-pointer";

export function ProfileFooter() {
  const { data } = useQuery(currentUserQueryOptions());
  const currentUser = data as any;
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  const { dark, setDark } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const isDesignV2 = getFlag("designV2");

  const [timerPanelOpen, setTimerPanelOpen] = useState(false);
  const [timer, setTimer] = useState(() => getFocusTimer());

  useEffect(() => {
    return subscribeLocalProfile(() => setProfile(getLocalProfile()));
  }, []);

  useEffect(() => {
    return subscribeFocusTimer(() => setTimer(getFocusTimer()));
  }, []);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setTimer(getFocusTimer()), 250);
    return () => window.clearInterval(id);
  }, [timer.running]);

  const timerLabel = formatFocusTimer(timer.seconds);

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    goToSignInAfterSignOut();
  };

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "Stefan Kunc";

  const showEmailHint =
    Boolean(currentUser?.email) &&
    displayName !== currentUser?.email &&
    profile.name.trim() &&
    profile.name !== "Connect User";

  return (
    <SidebarFooter
      className={cn(
        "p-2 group-data-[collapsible=icon]:p-1",
        isDesignV2
          ? "border-t border-[var(--p-border-subtle)] bg-[var(--p-bg)]"
          : "border-t border-sidebar-border/50",
      )}
    >
      <SidebarMenu className="gap-1">
        {timer.running ? (
          <SidebarMenuItem>
            <button
              type="button"
              aria-live="polite"
              onClick={() => toggleFocusTimer()}
              title="Klicken zum Pausieren des Fokus-Timers"
              className={cn(
                "mb-1 flex h-7 w-full items-center justify-center px-2 cursor-pointer transition-colors",
                isDesignV2
                  ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-success)] hover:bg-[var(--p-surface-3)] shadow-[var(--p-shadow-sm)]"
                  : "rounded-lg bg-emerald-500/15 border border-emerald-500/20 hover:bg-emerald-500/25",
              )}
            >
              <span
                className={cn(
                  "font-mono text-xs font-semibold tabular-nums tracking-tight",
                  isDesignV2 ? "text-[var(--p-success)]" : "text-emerald-400",
                )}
              >
                Focus: {timerLabel}
              </span>
            </button>
          </SidebarMenuItem>
        ) : null}

        <SidebarMenuItem>
          <DropdownMenu
            onOpenChange={(next) => {
              if (!next) setTimerPanelOpen(false);
            }}
          >
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  className={cn(
                    "h-10 px-2 gap-2.5 transition-colors",
                    isDesignV2
                      ? "rounded-[var(--p-radius-md)] hover:bg-[var(--p-surface-1)] border border-transparent hover:border-[var(--p-border-subtle)] text-[var(--p-text-1)]"
                      : "rounded-xl hover:bg-sidebar-accent",
                  )}
                />
              }
            >
              <UserAvatar
                fallbackEmail={currentUser?.email}
                fallbackImage={currentUser?.image}
                profile={profile}
              />
              <div className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
                <p
                  className={cn(
                    "truncate text-xs font-semibold leading-tight",
                    isDesignV2 ? "text-[var(--p-text-1)]" : "text-sidebar-foreground",
                  )}
                >
                  {displayName}
                </p>
                <p
                  className={cn(
                    "truncate text-[10px]",
                    isDesignV2 ? "text-[var(--p-text-3)]" : "text-sidebar-foreground/50",
                  )}
                >
                  {currentUser?.email || "stefan@nordwind-capital.de"}
                </p>
              </div>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="start"
              className={cn(
                "min-w-64 p-1.5 shadow-2xl",
                isDesignV2
                  ? "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] backdrop-blur-md shadow-[var(--p-shadow-lg)]"
                  : "rounded-xl",
              )}
              side="top"
              sideOffset={8}
            >
              <div
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2",
                  isDesignV2 && "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] my-0.5",
                )}
              >
                <UserAvatar
                  fallbackEmail={currentUser?.email}
                  fallbackImage={currentUser?.image}
                  profile={profile}
                />
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-xs font-semibold",
                      isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                    )}
                  >
                    {displayName}
                  </p>
                  {showEmailHint || currentUser?.email ? (
                    <p
                      className={cn(
                        "truncate text-[11px]",
                        isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
                      )}
                    >
                      {currentUser?.email}
                    </p>
                  ) : null}
                </div>
              </div>

              <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

              <DropdownMenuGroup>
                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2 && "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors",
                  )}
                  onClick={() => void navigate({ to: "/settings" as any })}
                >
                  <IconSettings className={cn("size-4", isDesignV2 ? "text-[var(--p-text-3)]" : "")} />
                  Einstellungen
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2 && "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors",
                  )}
                  onClick={() =>
                    void navigate({ to: "/settings" as any, hash: "usage" })
                  }
                >
                  <IconChartBar className={cn("size-4", isDesignV2 ? "text-[var(--p-text-3)]" : "")} />
                  Nutzung & Limits
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2 && "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors",
                  )}
                  onClick={() =>
                    void navigate({
                      to: "/settings" as any,
                      hash: "handy-verbinden",
                    })
                  }
                >
                  <IconDeviceMobile className={cn("size-4", isDesignV2 ? "text-[var(--p-text-3)]" : "")} />
                  Handy verbinden
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2 && "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors",
                  )}
                  onClick={() => setDark(!dark)}
                >
                  {dark ? (
                    <IconSun className="size-4 text-amber-400" />
                  ) : (
                    <IconMoon className="size-4 text-sky-400" />
                  )}
                  {dark ? "Light Mode" : "Dark Mode"}
                </DropdownMenuItem>

                {timerPanelOpen ? (
                  <div
                    className={cn(
                      "mx-0 flex h-8 items-center gap-1.5 px-2 my-1",
                      isDesignV2
                        ? "rounded-[var(--p-radius-md)] bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)]"
                        : "rounded-lg bg-sidebar-accent/50",
                    )}
                    onClick={(e) => e.preventDefault()}
                    onKeyDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    <span
                      className={cn(
                        "min-w-[3rem] font-mono text-xs tabular-nums",
                        isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                      )}
                    >
                      {timerLabel}
                    </span>
                    <Button
                      className={cn(
                        "h-5 px-1.5 text-[10px]",
                        isDesignV2
                          ? "rounded-[var(--p-radius-xs)] bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                          : "rounded",
                      )}
                      onClick={() => toggleFocusTimer()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {timer.running ? "Pause" : "Start"}
                    </Button>
                    <Button
                      className={cn(
                        "h-5 px-1.5 text-[10px]",
                        isDesignV2
                          ? "rounded-[var(--p-radius-xs)] text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-2)]"
                          : "rounded",
                      )}
                      onClick={() => resetFocusTimer()}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Reset
                    </Button>
                  </div>
                ) : null}

                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2 && "rounded-[var(--p-radius-md)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)] transition-colors",
                  )}
                  closeOnClick={false}
                  onClick={(e) => {
                    e.preventDefault();
                    setTimerPanelOpen((o) => !o);
                  }}
                >
                  <IconClock className={cn("size-4", isDesignV2 ? "text-[var(--p-text-3)]" : "")} />
                  Focus-Timer
                </DropdownMenuItem>
              </DropdownMenuGroup>

              <DropdownMenuSeparator className={cn(isDesignV2 && "bg-[var(--p-border-subtle)] my-1")} />

              <DropdownMenuGroup>
                <DropdownMenuItem
                  className={cn(
                    userMenuItemClassName,
                    isDesignV2
                      ? "rounded-[var(--p-radius-md)] text-[var(--p-danger)] hover:bg-[var(--p-danger-subtle)] hover:text-[var(--p-danger-hover)] transition-colors"
                      : "text-destructive focus:bg-destructive/10",
                  )}
                  disabled={signOut.isPending}
                  onClick={handleSignOut}
                >
                  <IconLogout className="size-4" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}

export default ProfileFooter;
