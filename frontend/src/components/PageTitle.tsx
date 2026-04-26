import type { ComponentType } from 'react';

type IconComponent = ComponentType<{ className?: string }>;

export function PageTitle({
  title,
  Icon,
  gradientClassName,
  iconClassName,
  size = 'h2',
  className,
}: {
  title: string;
  Icon?: IconComponent;
  gradientClassName: string;
  iconClassName?: string;
  size?: 'h2' | 'h3';
  className?: string;
}) {
  const sizeClassName = size === 'h3' ? 'text-h3' : 'text-h2';

  return (
    <h1
      className={`${sizeClassName} text-transparent bg-clip-text bg-gradient-to-r ${gradientClassName} tracking-tight flex items-center justify-center gap-2 text-center ${className || ''}`}
    >
      {Icon ? <Icon className={iconClassName || 'w-4 h-4 xl:w-5 xl:h-5'} /> : null}
      {title}
    </h1>
  );
}
