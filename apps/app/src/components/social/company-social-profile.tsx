/**
 * Unternehmensprofil auf der Firmenseite (Handy + PC, Swarm-v2 Lane 5):
 * Bindet das vollständige CompanyProfilePage ein (Header, Über uns, Bots der Firma,
 * Lane-6 Projekte-Slot, Posts, Angebote/Marktplatz).
 */
import React from "react";
import type { ReactNode } from "react";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { CompanyProfilePage } from "./company-profile-page";
import { cn } from "@/lib/utils";

export function CompanySocialProfile({
  company,
  fallback,
  onEdit,
  className,
  stickyTabs = false,
}: {
  company: ConnectCompany;
  fallback?: ReactNode;
  onEdit?: () => void;
  className?: string;
  stickyTabs?: boolean;
}) {
  return (
    <div className={cn("dark text-white", className)} data-testid="company-social-profile">
      <CompanyProfilePage companyId={company.id} />
    </div>
  );
}

/** PC-Firmenseite Switch */
export function CompanyProfileSocialSwitch({
  company,
  editor,
}: {
  company: ConnectCompany;
  editor: ReactNode;
}) {
  return (
    <div className="min-h-full">
      <CompanyProfilePage companyId={company.id} />
    </div>
  );
}
