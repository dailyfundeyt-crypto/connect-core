import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { SidebarToggleBar } from "@/components/layout/sidebar-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fileToAvatarDataUrl } from "@/lib/agents/connect-avatars";
import { createCompany } from "@/lib/companies/store";

export const Route = createFileRoute("/_authed/_app/company/new")({
  component: NewCompanyPage,
});

/**
 * Create a company: name, description, square logo, optional banner background.
 * The wide strip is the banner behind the logo — not the logo itself.
 */
function NewCompanyPage() {
  const navigate = useNavigate();
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onUpload = async (
    file: File | undefined,
    kind: "logo" | "banner",
  ) => {
    if (!file) return;
    setError(null);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      if (kind === "logo") setLogo(dataUrl);
      else setBanner(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const company = createCompany({
        name,
        description,
        ...(logo ? { logo } : {}),
        ...(banner ? { banner } : {}),
      });
      await navigate({
        to: "/company/$companyId",
        params: { companyId: company.id },
        search: { level: 2 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create company.");
      setBusy(false);
    }
  };

  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <>
      <SidebarToggleBar />
      <div className="flex flex-1 items-start justify-center p-6 md:p-10">
        <form
          className="flex w-full max-w-md flex-col gap-5"
          onSubmit={onSubmit}
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              New company
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Square logo for the avatar, optional wide background behind it.
              Your CTO opens first and helps you manage the other coworkers.
            </p>
          </div>

          {/* Preview: banner background + overlapping logo — matches company profile. */}
          <div className="space-y-2">
            <div className="overflow-hidden rounded-2xl border border-border">
              <button
                className="relative flex h-28 w-full items-center justify-center bg-muted/40 transition hover:bg-muted/55"
                onClick={() => bannerRef.current?.click()}
                type="button"
              >
                {banner ? (
                  <img
                    alt=""
                    className="absolute inset-0 size-full object-cover object-center [image-rendering:auto]"
                    decoding="async"
                    src={banner}
                  />
                ) : (
                  <span className="z-10 text-xs text-muted-foreground">
                    Click to set background
                  </span>
                )}
              </button>
              <div className="relative bg-background px-4 pb-4 pt-0">
                <button
                  className="-mt-10 flex size-[88px] items-center justify-center overflow-hidden rounded-2xl border-4 border-background bg-muted shadow-sm ring-1 ring-border transition hover:ring-foreground/30"
                  onClick={() => logoRef.current?.click()}
                  type="button"
                >
                  {logo ? (
                    <img
                      alt=""
                      className="size-full object-cover [image-rendering:auto]"
                      decoding="async"
                      src={logo}
                    />
                  ) : (
                    <span className="px-2 text-center text-[11px] font-medium leading-tight text-muted-foreground">
                      {initials || "Logo"}
                    </span>
                  )}
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => logoRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {logo ? "Change logo" : "Upload logo"}
                  </Button>
                  <Button
                    onClick={() => bannerRef.current?.click()}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {banner ? "Change background" : "Add background"}
                  </Button>
                  {logo ? (
                    <Button
                      onClick={() => setLogo(null)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove logo
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Logo is the square profile mark. Background is the wide banner
              behind it. High-res images up to 32 MB are kept sharp (up to 4K).
            </p>
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onUpload(e.target.files?.[0], "logo");
                e.target.value = "";
              }}
              ref={logoRef}
              type="file"
            />
            <input
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onUpload(e.target.files?.[0], "banner");
                e.target.value = "";
              }}
              ref={bannerRef}
              type="file"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="company-name">
              Name
            </label>
            <Input
              autoFocus
              id="company-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme GmbH"
              required
              value={name}
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="company-desc">
              Description
            </label>
            <Textarea
              id="company-desc"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this company workspace is for…"
              required
              rows={3}
              value={description}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              Create company
            </Button>
            <Button
              disabled={busy}
              onClick={() => void navigate({ to: "/" })}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
