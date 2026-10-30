/**
 * Connect-MCP Handler: Spark Browser Folders, Links & Notes (Lane 3).
 *
 * Re-exports the spark folder tools so they can be registered in the connect-mcp tool registry.
 */

import type { Database } from "../../db/client";
import type { McpToolDef } from "../router";
import type { McpGrant } from "../../contracts/api";
import { buildSparkFolderTools } from "../../brain/browser-folders/mcp-tools";
import { getSparkFoldersStore } from "../../brain/browser-folders/store";

export type SparkFolderToolDeps = {
  database?: Database;
  grant?: McpGrant | null;
};

export function buildSparkFolderMcpTools(deps: SparkFolderToolDeps = {}): McpToolDef[] {
  const store = getSparkFoldersStore(deps.database);
  return buildSparkFolderTools({
    database: deps.database,
    store,
    grant: deps.grant,
  });
}

export default buildSparkFolderMcpTools;
