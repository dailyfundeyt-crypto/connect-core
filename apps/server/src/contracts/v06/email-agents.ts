/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface EmailAgent {
  id: string;
  address: string;
  name: string;
  description: string;
  capabilities: string[];
  companyIds: string[];
}

export type OutboundEmailStatus =
  | "pending_approval"
  | "approved"
  | "sent"
  | "rejected";

export interface OutboundEmail {
  id: string;
  requestedByAgentId: string;
  to: string;
  subject: string;
  body: string;
  status: OutboundEmailStatus;
  createdAt: string;
}
