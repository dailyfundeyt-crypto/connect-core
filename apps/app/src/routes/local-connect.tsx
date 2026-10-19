import { IconDeviceLaptop, IconDeviceMobile, IconDownload } from "@tabler/icons-react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/local-connect")({
  component: LocalConnectPage,
});

function LocalConnectPage() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[#08090d] px-6 py-16 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(39,125,255,0.18),transparent_55%)]" />
      <section className="relative w-full max-w-xl text-center">
        <img
          alt=""
          className="mx-auto size-16 rounded-2xl border border-white/10 shadow-2xl"
          src="/brand/connect-logo.png"
        />
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-sky-300">Connect lokal</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Dein Workspace bleibt bei dir.</h1>
        <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-white/60 sm:text-base">
          Anmeldung und Onboarding sind abgeschlossen. Der Connect-Workspace läuft lokal auf deinem PC.
          Öffne dort Connect, um mit deinen Agenten und Daten weiterzuarbeiten.
        </p>
        <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <IconDeviceLaptop className="size-5 text-sky-300" />
            <h2 className="mt-4 text-sm font-semibold">Am PC</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">Starte die Connect-App auf dem Computer, auf dem dein Workspace gespeichert ist.</p>
          </article>
          <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
            <IconDeviceMobile className="size-5 text-sky-300" />
            <h2 className="mt-4 text-sm font-semibold">Auf dem Handy</h2>
            <p className="mt-2 text-sm leading-6 text-white/50">Scanne den QR-Code im lokalen Connect, um den Handy-Tunnel zu öffnen.</p>
          </article>
        </div>
        <p className="mt-8 text-xs text-white/35">
          Du möchtest die öffentliche Seite erneut ansehen? <Link className="text-sky-300 hover:text-sky-200" to="/sign">Zur Landingpage</Link>
        </p>
        <button
          className="mx-auto mt-8 inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/45"
          disabled
          type="button"
        >
          <IconDownload className="size-4" /> Connect-App herunterladen · folgt
        </button>
      </section>
    </main>
  );
}
