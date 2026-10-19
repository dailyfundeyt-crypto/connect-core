import { createFileRoute } from "@tanstack/react-router";
import { ModelOneChat } from "@/components/model-one/model-one-chat";

/** Model One: zentrale Chat-Seite mit rechts ausklappbarem Usage-Panel. */
export const Route = createFileRoute("/_authed/_app/model-one")({
  component: ModelOneRoute,
});

function ModelOneRoute() {
  return <ModelOneChat />;
}
