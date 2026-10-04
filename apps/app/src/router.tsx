import { createRouter } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import type { RouterContext } from "./router-context";
import { routeTree } from "./routeTree.gen";

// TanStack types the error as `unknown` here, not `Error`. Narrowing it keeps the
// .message/.stack access below honest instead of asserting a type the router never promised.
function DefaultRouteError({ error, reset }: ErrorComponentProps) {
  console.error("[Connect route error]", error);
  const err = error instanceof Error ? error : new Error(String(error));
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
      {err.message}
      {"\n\n"}
      {err.stack}
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
