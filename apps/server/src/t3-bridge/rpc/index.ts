/**
 * T3-WS-RPC — Modul-Fassade.
 *
 * Lane: A03 (Welle W1).
 *
 * Andere Lanes importieren ausschließlich von hier:
 *
 * ```ts
 * import { T3RpcClient } from "../t3-bridge/rpc";
 * ```
 *
 * So bleibt die interne Struktur (Protokoll/Transport/Guards) frei änderbar.
 */

export {
  decodeT3Messages,
  encodeT3Message,
  isT3ServerMessage,
  readT3ExitFailure,
  readT3ExitValue,
  t3Request,
  type T3ClientMessage,
  type T3Exit,
  type T3ExitCauseEntry,
  type T3ServerMessage,
} from "./protocol";

export {
  T3_RPC_DEFAULTS,
  T3RpcTransport,
  buildT3SocketUrl,
  defaultRequestWsTicket,
  type T3RpcConnectionState,
  type T3RpcTransportOptions,
  type T3RpcTransportStatus,
  type T3StreamEndListener,
  type T3StreamListener,
  type T3StreamSubscription,
  type T3WebSocketFactory,
  type T3WebSocketLike,
} from "./transport";

export {
  isT3RpcError,
  readRemoteTag,
  type T3RpcAbortError,
  type T3RpcAuthError,
  type T3RpcClosedError,
  type T3RpcClientError,
  type T3RpcContractMismatchError,
  type T3RpcDefectError,
  type T3RpcError,
  type T3RpcNotConnectedError,
  type T3RpcRemoteError,
  type T3RpcTimeoutError,
  type T3RpcTransportError,
} from "./errors";

export {
  isT3ServerConfig,
  isT3ServerProviderList,
  isT3ThreadProjection,
  isT3UsageLimitSources,
  isT3UsageSummary,
  normalizeProvider,
  normalizeProviderList,
  readProviderAuthState,
} from "./guards";

export {
  T3RpcClient,
  normalizeProviders,
  type T3ContractStatus,
  type T3RpcClientOptions,
} from "./client";

export {
  T3_ORCHESTRATION_PROTOCOL_PARAM,
  T3_ORCHESTRATION_PROTOCOL_VERSION,
  T3_USAGE_CONTRACT_VERSION,
  T3_USAGE_CONTRACT_VERSION_MIN,
  T3_WS_METHODS,
  T3_WS_PATH,
  T3_WS_TICKET_PARAM,
  T3_WS_TICKET_PATH,
  type T3EnvironmentDescriptor,
  type T3GetThreadProjectionInput,
  type T3OrchestrationCommand,
  type T3ProviderSnapshot,
  type T3RefreshProvidersInput,
  type T3ServerCapabilities,
  type T3ServerConfig,
  type T3ServerConfigEvent,
  type T3ServerProvider,
  type T3SubscribeServerConfigInput,
  type T3SubscribeShellInput,
  type T3SubscribeThreadInput,
  type T3ThreadProjection,
  type T3ThreadStreamItem,
  type T3UsageBucket,
  type T3UsageLimitSources,
  type T3UsageSource,
  type T3UsageSummary,
  type T3UsageSummaryInput,
} from "./types";
