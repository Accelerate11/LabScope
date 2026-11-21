import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/** Panel chrome shared by every workspace card (Foxglove-style docked panel). */
export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: PanelProps): React.JSX.Element {
  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface ${className}`}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[12px] font-semibold tracking-wide text-ink">{title}</h2>
          {subtitle === undefined ? null : (
            <span className="truncate text-[11px] text-faint">{subtitle}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
