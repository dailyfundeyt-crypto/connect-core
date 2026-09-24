import { useState } from "react";
import type { ConnectCompany } from "@/lib/companies/catalog";

export function CompanyCard({ company }: { company: ConnectCompany }) {
  const [logoBroken, setLogoBroken] = useState(false);
  const showLogo = Boolean(company.logo) && !logoBroken;
  const initials = company.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div
      className="relative h-[180px] w-[144px] overflow-hidden rounded-2xl"
      style={{ background: company.accent }}
    >
      {showLogo ? (
        <img
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setLogoBroken(true)}
          src={company.logo}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-4xl font-semibold tracking-tight text-white/90">
            {initials}
          </span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-3">
        <span className="line-clamp-1 text-sm font-medium text-white">
          {company.name}
        </span>
        <span className="line-clamp-3 text-xs text-white/85">
          {company.description}
        </span>
      </div>
    </div>
  );
}
