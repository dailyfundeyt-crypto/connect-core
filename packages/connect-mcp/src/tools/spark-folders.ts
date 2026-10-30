/**
 * packages/connect-mcp/src/tools/spark-folders.ts
 *
 * Standalone Spark-MCP Browser-Ordner, Links & Notizen Tool-Definitionen.
 */

export const SPARK_FOLDER_TOOL_NAMES = [
  "spark.folder_create",
  "spark.folder_list",
  "spark.folder_update",
  "spark.folder_delete",
  "spark.folder_move",
  "spark.folder_set_kind",
  "spark.link_add",
  "spark.link_move",
  "spark.note_create",
  "spark.note_read",
  "spark.note_attach",
  "spark.note_detach",
  "spark.folder_context",
] as const;

export type SparkFolderToolName = (typeof SPARK_FOLDER_TOOL_NAMES)[number];

export const SPARK_FOLDERS_SCOPE = "spark:folders:write" as const;
