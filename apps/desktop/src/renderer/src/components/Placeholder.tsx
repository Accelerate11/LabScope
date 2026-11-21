interface PlaceholderProps {
  milestone: string;
  title: string;
  description: string;
  items: string[];
  note?: string;
}

/**
 * Honest placeholder for milestones that are not built yet. The product brief
 * requires the UI to distinguish "已实现 / 未完成" instead of showing dead
 * controls, so every not-yet-implemented page says so explicitly.
 */
export function Placeholder({ milestone, title, description, items, note }: PlaceholderProps): React.JSX.Element {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-warn">
          {milestone} 未实现
        </span>
      </div>
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">{description}</p>

      <div className="mt-6 rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-faint">
          计划交付内容
        </p>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2 text-[12px] text-ink/85">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-border-strong" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {note === undefined ? null : (
        <p className="mt-4 text-[11px] leading-relaxed text-faint">{note}</p>
      )}
    </div>
  );
}
