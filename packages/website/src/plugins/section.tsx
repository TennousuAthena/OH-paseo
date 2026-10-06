import type { ReactNode } from "react";

/** A block of a plugins page: its header, then its content 32px below. */
export function PluginSection({
  id,
  labelledBy,
  className,
  header,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={className}>
      {header}
      <div className="mt-8">{children}</div>
    </section>
  );
}

/** A section's title with its trailing controls on one baseline. */
export function PluginSectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">{children}</div>
  );
}

export function PluginSectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-lg font-medium">
      {children}
    </h2>
  );
}
