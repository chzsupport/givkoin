export function GalaxyInfoCards({
  isLandscape,
  t,
}: {
  isLandscape: boolean;
  t: (key: string) => string;
}) {
  const cards = [
    { title: t('galaxy.cards.intent_title'), desc: t('galaxy.cards.intent_desc'), icon: '🪐' },
    { title: t('galaxy.cards.pay_title'), desc: t('galaxy.cards.pay_desc'), icon: '⚡' },
    { title: t('galaxy.cards.support_title'), desc: t('galaxy.cards.support_desc'), icon: '🤝' },
  ];

  return (
    <div className={`grid gap-2 mb-2 flex-shrink-0 ${isLandscape ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
      {cards.map((item, idx) => (
        <div key={item.title} className="relative overflow-hidden rounded-lg lg:rounded-xl border border-white/10 bg-white/5 backdrop-blur-lg p-2.5 lg:p-3 shadow-lg shadow-black/10">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-white/0 opacity-60" />
          <div className="relative flex items-start gap-1.5">
            <div className="text-base lg:text-lg">{item.icon}</div>
            <div className="space-y-0.5 min-w-0">
              <p className="text-tiny font-bold uppercase tracking-[0.12em] text-white/90">{item.title}</p>
              <p className="text-tiny text-neutral-400 leading-relaxed">{item.desc}</p>
            </div>
          </div>
          <div className="absolute -right-6 -bottom-6 w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500/10 via-purple-500/10 to-transparent blur-2xl" />
          <div className="absolute top-1 right-2 text-caption font-mono text-neutral-500">0{idx + 1}</div>
        </div>
      ))}
    </div>
  );
}
