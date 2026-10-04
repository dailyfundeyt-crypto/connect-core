export default function AppPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream-50 px-6 text-center dark:bg-ink-900">
      <h1 className="hand-text mb-4 text-4xl font-extrabold tracking-tight text-ink-900 dark:text-cream-50 sm:text-5xl">
        Connect
      </h1>
      <p className="mb-8 max-w-sm text-lg text-ink-400 dark:text-cream-100/50">
        Dein KI-Coworking-Arbeitsbereich.
      </p>
      <a
        href="/"
        className="rounded-full bg-ink-900 px-7 py-3.5 text-sm font-semibold text-cream-50 shadow-sm transition hover:bg-ink-700 dark:bg-sky-500 dark:text-ink-900 dark:hover:bg-sky-400"
      >
        ← Zurück zur Landing Page
      </a>
    </div>
  );
}
