/**
 * T3-Bridge — Öffentliche Fassade für das Connect-Frontend (Lane A21).
 *
 * Zentraler Einstiegspunkt für alle Frontend-Pakete (A22–A36).
 *
 * Exportiert:
 *  - Sämtliche Typen und Konstanten aus `contracts.ts` (A01)
 *  - Fetch-Funktionen für alle Endpunkte (Status, Providers, Threads, Control, Approvals, Usage, Machines, Avatare)
 *  - SSE Stream Handler (`subscribeT3Stream`, `parseSseBlock`)
 *  - Mock-Adapter (`setT3MockMode`, `isT3MockMode`, `resetT3MockStore`, Mock-Daten)
 *  - React-Hooks (`useT3Providers`, `useT3Chat`, `useT3Control`, `useUsage`, `useMachines`, `useCompanyPublicUsage`, `useSchedulerStatus`, `useAgentAvatar`)
 */

// 1. Verträge & Typen (A01)
export * from "./contracts";

// 2. Client- und Fetch-Funktionen
export {
  T3ClientError,
  fetchT3Status,
  fetchT3Providers,
  fetchT3ThreadSnapshot,
  fetchT3Messages,
  sendT3Message,
  sendT3Control,
  interruptT3Turn,
  steerT3Turn,
  fetchT3Capabilities,
  respondT3Approval,
  fetchT3PendingApprovals,
  fetchT3Usage,
  fetchCompanyPublicUsage,
  fetchMachines,
  fetchMachine,
  controlMachine,
  fetchAgentAvatar,
  updateAgentAvatar,
  fetchFleetStatus,
  fetchSchedulerStatus,
  type T3ClientOptions,
} from "./client";

// 3. SSE Stream Handler
export {
  subscribeT3Stream,
  parseSseBlock,
  type SubscribeT3StreamOptions,
  type ParsedSseMessage,
  type StreamEnvelopeInfo,
} from "./stream";

// 4. Mock-Adapter & Daten
export {
  setT3MockMode,
  isT3MockMode,
  resetT3MockStore,
  mockFetchT3Status,
  mockFetchT3Providers,
  mockFetchT3ThreadSnapshot,
  mockFetchT3Messages,
  mockSendT3Message,
  mockSendT3Control,
  mockInterruptT3Turn,
  mockSteerT3Turn,
  mockFetchT3Capabilities,
  mockRespondT3Approval,
  mockFetchT3PendingApprovals,
  mockFetchT3Usage,
  mockFetchCompanyPublicUsage,
  mockFetchMachines,
  mockFetchMachine,
  mockControlMachine,
  mockFetchAgentAvatar,
  mockUpdateAgentAvatar,
  mockFetchFleetStatus,
  mockFetchSchedulerStatus,
  mockSubscribeT3Stream,
  type MockStreamOptions,
} from "./mock-client";

export {
  MOCK_T3_PROVIDERS,
  MOCK_T3_PROVIDER_LIST_RESPONSE,
  MOCK_T3_CAPABILITIES,
  MOCK_CHAT_ITEMS,
  MOCK_T3_THREAD_SNAPSHOT,
  MOCK_T3_USAGE_RESPONSE,
  MOCK_COMPANY_PUBLIC_USAGE,
  MOCK_MACHINES,
  MOCK_MACHINE_LIST_RESPONSE,
  MOCK_AGENT_AVATAR,
  MOCK_SCHEDULER_LIMITS,
  MOCK_FLEET_AGENTS,
  MOCK_T3_STATUS,
} from "./mock-data";

// 5. React Hooks & Pure Helpers
export {
  applyConnectChatEvent,
  useT3Providers,
  useT3Chat,
  useT3Control,
  useUsage,
  useMachines,
  useCompanyPublicUsage,
  useSchedulerStatus,
  useAgentAvatar,
  type UseT3ProvidersOptions,
  type UseT3ProvidersResult,
  type UseT3ChatOptions,
  type UseT3ChatResult,
  type UseT3ControlOptions,
  type UseT3ControlResult,
  type UseUsageOptions,
  type UseUsageResult,
  type UseMachinesOptions,
  type UseMachinesResult,
  type UseCompanyPublicUsageOptions,
  type UseCompanyPublicUsageResult,
  type UseSchedulerStatusOptions,
  type UseSchedulerStatusResult,
  type UseAgentAvatarOptions,
  type UseAgentAvatarResult,
} from "./hooks";
