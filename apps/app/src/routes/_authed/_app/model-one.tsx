import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
// Nicht gelöscht, nur umgeleitet:
import { ModelOneChat } from "@/components/model-one/model-one-chat";

/** Model One Route umgeleitet auf /agents (normale Agenten-Ansicht). */
export const Route = createFileRoute("/_authed/_app/model-one")({
  component: ModelOneRoute,
});

function ModelOneRoute() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/agents" });
  }, [navigate]);
  return null;
}
