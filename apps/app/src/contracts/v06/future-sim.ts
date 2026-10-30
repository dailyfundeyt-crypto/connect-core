/** Contract v06 – Änderungen nur durch A00/Integrator */

export interface FutureSimRun {
  id: string;
  companyId: string;
  planFiles: string[];
  question: string;
  status: string;
  reportPath?: string;
}
