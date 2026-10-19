import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { FocusChain } from "@/components/focus/focus-chain";
import "@/components/mobile/mobile.css";

export const Route = createFileRoute("/_authed/focus")({
  component: FocusRoute,
});

/** Vollbild-Fokus (helium-focuschain2): /focus – auch Startbildschirm-Kürzel der PWA. */
function FocusRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.style.backgroundColor;
    html.style.backgroundColor = "#07080c";
    return () => {
      html.style.backgroundColor = prev;
    };
  }, []);
  return (
    <div className="dark min-h-[100dvh] overflow-y-auto bg-[radial-gradient(120%_70%_at_50%_0%,#1a1630_0%,#07080c_55%)] pb-[env(safe-area-inset-bottom)] text-white">
      <FocusChain onClose={() => void navigate({ to: "/" })} variant="fullscreen" />
    </div>
  );
}
