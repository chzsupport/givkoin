import Link from 'next/link';

function TreeNavButton({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
    >
      <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
        <span className="text-2xl sm:text-3xl">{icon}</span>
        <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{label}</span>
      </div>
    </Link>
  );
}

export function TreeNavigationLinks({
  localePath,
  t,
}: {
  localePath: (path: string) => string;
  t: (key: string) => string;
}) {
  const topLinks = [
    { href: localePath('/galaxy'), icon: '🌌', label: t('galaxy.title') },
    { href: localePath('/bridges'), icon: '🌉', label: t('bridges.title') },
    { href: localePath('/fortune'), icon: '🎰', label: t('fortune.title') },
    { href: localePath('/shop'), icon: '🛒', label: t('shop.title') },
  ];

  const bottomLinks = [
    { href: localePath('/evil-root'), icon: '👁️', label: t('landing.root') },
    { href: localePath('/news'), icon: '📰', label: t('landing.news_nav') },
    { href: localePath('/chronicle'), icon: '📜', label: t('chronicle.title') },
    { href: localePath('/practice'), icon: '🧘', label: t('landing.practice_nav') },
  ];

  return (
    <>
      <div className="absolute left-1/2 -translate-x-1/2 top-4 sm:top-6 lg:top-8 2xl:top-10 pointer-events-auto flex gap-1 sm:gap-2 lg:gap-2 2xl:gap-4">
        {topLinks.map((item) => (
          <TreeNavButton
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 lg:bottom-8 2xl:bottom-10 pointer-events-auto flex gap-1 sm:gap-2 lg:gap-2 2xl:gap-4">
        {bottomLinks.map((item) => (
          <TreeNavButton
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </div>
    </>
  );
}
