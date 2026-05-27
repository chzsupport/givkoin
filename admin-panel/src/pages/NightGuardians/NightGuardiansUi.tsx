import type { InputHTMLAttributes, ReactNode } from 'react';

export const Card = ({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border border-white/10 bg-white/5 p-6 ${className}`}>
    {(title || subtitle) && (
      <div className="mb-6">
        {title ? <div className="flex items-center gap-2 text-xl font-semibold text-white">{title}</div> : null}
        {subtitle ? <div className="mt-2 text-sm text-slate-400">{subtitle}</div> : null}
      </div>
    )}
    {children}
  </div>
);

export const Button = ({
  children,
  onClick,
  className = '',
  variant = 'primary',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const palette =
    variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : variant === 'success'
        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
        : variant === 'secondary'
          ? 'bg-white/10 hover:bg-white/20 text-white'
          : 'bg-blue-600 hover:bg-blue-500 text-white';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all ${palette} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

export const Input = ({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 focus:outline-none ${className}`}
  />
);

export function StatTile({
  label,
  value,
  hint,
  accent = 'text-white',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
