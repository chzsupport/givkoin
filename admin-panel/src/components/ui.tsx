import type { ReactNode } from 'react';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

export function Badge({
  children,
  variant = 'default',
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-caption font-bold uppercase tracking-wider ${badgeVariants[variant]}`}>
      {children}
    </span>
  );
}

export function Card({
  children,
  title,
  subtitle,
  className = '',
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`card-premium ${className}`}>
      {(title || subtitle) && (
        <div className="mb-6">
          {title && <h3 className="text-lg font-semibold text-white">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
