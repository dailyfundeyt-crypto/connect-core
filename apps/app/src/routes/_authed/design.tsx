import { createFileRoute } from "@tanstack/react-router";
import { DesignPreviewPage } from "@/v06/design";

export const Route = createFileRoute("/_authed/design")({
  component: DesignPreviewPage,
});
