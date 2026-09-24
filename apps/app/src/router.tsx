import { createRouter } from "@tanstack/react-router";
import type { RouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

function DefaultRouteError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  console.error("[Connect route error]", error);
  return (
    <div
      data-testid="route-error"
      style={{
        margin: 12,
        padding: 16,
        border: "1px solid #f87171",
        borderRadius: 8,
        background: "#fef2f2",
        color: "#7f1d1d",
        fontFamily: "ui-monospace, monospace",
        whiteSpace: "pre-wrap",
        maxWidth: 960,
      }}
    >
      <strong>Something went wrong</strong>
      {"\n"}
      {error?.message || String(error)}
      {"\n\n"}
      {error?.stack}
      {"\n\n"}
      <button
        onClick={() => reset()}
        style={{
          marginTop: 8,
          padding: "6px 10px",
          borderRadius: 6,
          border: "1px solid #7f1d1d",
          background: "white",
          cursor: "pointer",
        }}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}

export const router = createRouter({
  routeTree,
  context: {} as RouterContext,
  defaultErrorComponent: DefaultRouteError,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
