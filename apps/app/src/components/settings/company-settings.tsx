import { useEffect, useRef, useState } from "react";
import {
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { fileToAvatarDataUrl } from "@/lib/agents/connect-avatars";
import type { ConnectCompany } from "@/lib/companies/catalog";
import {
  listCompanies,
  subscribeCompanies,
  updateCompany,
} from "@/lib/companies/store";

/**
 * Edit company name, description, and profile image from Settings.
 */
export function CompanySettingsPanel() {
  const [companies, setCompanies] = useState(() => listCompanies());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    return subscribeCompanies(() => setCompanies(listCompanies()));
  }, []);

  const editing = companies.find((c) => c.id === editingId) ?? null;

  return (
    <div id="companies">
      <PageSection title="Companies">
        <PageRows>
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Company profiles</ItemTitle>
              <ItemDescription>
                Change name, description, and the profile logo (used on L2 and across levels).
              </ItemDescription>
            </ItemContent>
          </Item>
          <ul className="divide-y divide-border rounded-xl border border-border">
            {companies.map((company) => (
              <li
                className="flex items-center gap-3 px-4 py-3"
                key={company.id}
              >
                <CompanyMark company={company} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{company.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {company.description}
                  </p>
                </div>
                <Button
                  onClick={() => setEditingId(company.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Edit
                </Button>
              </li>
            ))}
          </ul>
          {editing ? (
            <CompanyEditForm
              company={editing}
              key={editing.id}
              onCancel={() => setEditingId(null)}
              onSaved={() => {
                setCompanies(listCompanies());
                setEditingId(null);
              }}
            />
          ) : null}
        </PageRows>
      </PageSection>
    </div>
  );
}

function CompanyMark({ company }: { company: ConnectCompany }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-xs font-bold text-white"
      style={{ background: company.accent }}
    >
      {company.logo ? (
        <img alt="" className="size-full object-cover" src={company.logo} />
      ) : (
        company.name.slice(0, 2).toUpperCase()
      )}
    </div>
  );
}

function CompanyEditForm({
  company,
  onCancel,
  onSaved,
}: {
  company: ConnectCompany;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [description, setDescription] = useState(company.description);
  const [logo, setLogo] = useState(company.logo ?? "");
  const [banner, setBanner] = useState(company.banner ?? "");
  const [category, setCategory] = useState(company.category ?? "");
  const [location, setLocation] = useState(company.location ?? "");
  const [website, setWebsite] = useState(company.website ?? "");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(company.name);
    setDescription(company.description);
    setLogo(company.logo ?? "");
    setBanner(company.banner ?? "");
    setCategory(company.category ?? "");
    setLocation(company.location ?? "");
    setWebsite(company.website ?? "");
    setError(null);
  }, [
    company.id,
    company.name,
    company.description,
    company.logo,
    company.banner,
    company.category,
    company.location,
    company.website,
  ]);

  return (
    <form
      className="space-y-3 rounded-xl border border-border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        try {
          updateCompany(company.id, {
            name,
            description,
            logo: logo || null,
            banner: banner || null,
            category: category || null,
            location: location || null,
            website: website || null,
          });
          onSaved();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not save");
        }
      }}
    >
      <p className="text-sm font-semibold">Edit {company.name}</p>
      <div className="overflow-hidden rounded-xl border border-border">
        <button
          className="relative block h-24 w-full bg-muted"
          onClick={() => bannerRef.current?.click()}
          type="button"
        >
          {banner ? (
            <img alt="" className="size-full object-cover" src={banner} />
          ) : (
            <span className="text-xs text-muted-foreground">Add banner</span>
          )}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          className={
            logo
              ? "size-16 overflow-hidden rounded-2xl bg-transparent outline-none ring-0"
              : "size-16 overflow-hidden rounded-2xl bg-muted outline-none ring-0"
          }
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          {logo ? (
            <img
              alt=""
              className="size-full rounded-2xl object-cover"
              src={logo}
            />
          ) : (
            <span className="flex size-full items-center justify-center text-sm font-bold text-muted-foreground">
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
        </button>
        <Button
          onClick={() => fileRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          Change logo
        </Button>
        <Button
          onClick={() => bannerRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          Change banner
        </Button>
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void fileToAvatarDataUrl(file)
              .then((dataUrl) => {
                setLogo(dataUrl);
                setError(null);
              })
              .catch((caught) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not read that image.",
                );
              });
          }}
          ref={fileRef}
          type="file"
        />
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void fileToAvatarDataUrl(file)
              .then((dataUrl) => {
                setBanner(dataUrl);
                setError(null);
              })
              .catch((caught) => {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not read that image.",
                );
              });
          }}
          ref={bannerRef}
          type="file"
        />
      </div>
      <label className="block text-xs font-semibold text-muted-foreground">
        Name
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          onChange={(e) => setName(e.target.value)}
          value={name}
        />
      </label>
      <label className="block text-xs font-semibold text-muted-foreground">
        Description
        <textarea
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          value={description}
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-muted-foreground">
          Category
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            onChange={(e) => setCategory(e.target.value)}
            value={category}
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Location
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            onChange={(e) => setLocation(e.target.value)}
            value={location}
          />
        </label>
        <label className="block text-xs font-semibold text-muted-foreground">
          Website
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            onChange={(e) => setWebsite(e.target.value)}
            value={website}
          />
        </label>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Save
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}
