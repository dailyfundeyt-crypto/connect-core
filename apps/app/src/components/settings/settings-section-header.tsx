/**
 * Shared header block for every settings panel.
 *
 * Usage: <SettingsSectionHeader title="API-Keys" description="..." />
 *
 * Keeps all 20+ panels consistent without duplicating markup.
 */
export function SettingsSectionHeader({
  title,
  description,
  learnMoreId,
}: {
  title: string;
  description: string;
  /** Optional anchor id — adds a "Was ist das?" scroll link at the bottom of the panel. */
  learnMoreId?: string;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {learnMoreId && (
        <a
          href={`#${learnMoreId}`}
          className="mt-2 inline-block text-xs text-[#555] underline-offset-2 transition-colors hover:text-[#888] hover:underline"
        >
          Was ist das?
        </a>
      )}
      <div className="mt-5 border-t border-white/[0.06]" />
    </div>
  );
}
