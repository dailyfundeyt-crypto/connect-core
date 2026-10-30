/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface RemoveBotFromCompanyReq {
  botId: string;
  companyId: string;
}

export interface HardDeleteBotReq {
  botId: string;
  confirmName: string;
}

export interface HardDeleteBotRes {
  botId: string;
  exportPath: string;
  deletedAt: string;
}
