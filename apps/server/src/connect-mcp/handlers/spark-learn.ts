/**
 * Connect-MCP Handler: Spark-Learn Knowledge, Q&A, Search & Proposals (Lane 7).
 *
 * Exposes the 7 official Spark-Learn MCP tools to external clients and agents:
 * - spark_ask (and spark.ask): Fact-grounded Q&A with numbered citations [1], [2]
 * - spark_semantic_search (and spark.semantic_search): Vector & hybrid search
 * - spark_related (and spark.related): Semantic & graph related notes
 * - spark_quiz_next (and spark.quiz_next): Spaced repetition study cards
 * - spark_learn_status (and spark.learn_status): Vault, indexer, Ollama & LLM status
 * - spark_propose (and spark.propose): Self-improvement proposals queue
 * - spark_youtube_import (and spark.youtube_import): YouTube note and transcript ingestion
 */

import type { Database } from "../../db/client";
import type { McpToolDef } from "../router";
import type { McpGrant } from "../../contracts/api";
import { buildSparkLearnMcpTools } from "../../brain/learn/mcp-tools";

export type SparkLearnHandlerDeps = {
  database?: Database;
  grant?: McpGrant | null;
  configuredRoot?: string | null;
};

export function buildSparkLearnHandlerTools(deps: SparkLearnHandlerDeps = {}): McpToolDef[] {
  return buildSparkLearnMcpTools({
    database: deps.database,
    grant: deps.grant,
    configuredRoot: deps.configuredRoot,
  });
}

export default buildSparkLearnHandlerTools;
