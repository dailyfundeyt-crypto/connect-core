import { useMemo } from "react";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import type { CompanyAppProps } from "../../types";
import { routeTree } from "./source/routeTree.gen";
import { ConnectAuthBridge } from "./source/lib/supabase/auth";
import { setFluxCompanyScope } from "./source/lib/connect-bridge";
import "./flux-app.css";

/** Mounts Flux's complete original route tree as a Connect Messages app module. */
export default function FluxCompanyApp({ company, identity }: CompanyAppProps) {
  setFluxCompanyScope(company.id);
  const router = useMemo(() => {
    const queryClient = new QueryClient();
    const history = createMemoryHistory({ initialEntries: ["/app/dashboard"] });
    return createRouter({ routeTree, history, context: { queryClient }, defaultPreloadStaleTime: 0 });
  }, []);

  return (
    <div className="flux-app dark h-full min-h-0 w-full overflow-hidden text-white" data-company={company.id}>
      <ConnectAuthBridge identity={identity}>
        <RouterProvider router={router} />
      </ConnectAuthBridge>
    </div>
  );
}
