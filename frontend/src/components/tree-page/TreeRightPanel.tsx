import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { formatTreeDuration } from './treeTime';
import type { SolarPanelStatus, TreePanel } from './types';

const MultiAdBlock = dynamic(
  () => import('@/components/MultiAdBlock').then((m) => m.MultiAdBlock),
  { ssr: false }
);

type TreePanelUser = {
  entity?: {
    avatarUrl: string;
    createdAt: string;
    name: string;
  } | null;
};

export function TreeRightPanel({
  activePanel,
  isOpen,
  localePath,
  onAskEntity,
  onClose,
  onFindPartner,
  onOpenShare,
  onTakeCharge,
  shareCountToday,
  shareDailyLimit,
  solarStatus,
  solarTimeLeft,
  t,
  takingDuration,
  user,
}: {
  activePanel: TreePanel | null;
  isOpen: boolean;
  localePath: (path: string) => string;
  onAskEntity: () => void;
  onClose: () => void;
  onFindPartner: () => void;
  onOpenShare: () => void;
  onTakeCharge: () => void;
  shareCountToday: number | null;
  shareDailyLimit: number | null;
  solarStatus: SolarPanelStatus;
  solarTimeLeft: number;
  t: (key: string) => string;
  takingDuration: number;
  user?: TreePanelUser | null;
}) {
  if (!isOpen) return null;

  const isKnownPanel = activePanel === 'solar' || activePanel === 'entity' || activePanel === 'search';

  return (
    <>
      <div
        className="absolute inset-0 z-0 pointer-events-auto"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 w-full sm:w-[380px] bg-neutral-900 border-l border-white/10 pointer-events-auto shadow-2xl transition-transform transform translate-x-0 z-10">
        <div className={`${isKnownPanel ? 'p-0' : 'pt-4 px-4 pb-[10px] sm:pt-6 sm:px-6 sm:pb-[10px]'} h-full flex flex-col overflow-hidden`}>
          <div className={`relative flex items-center ${isKnownPanel ? 'px-[10px] pt-[15px] sm:pt-[10px] mb-0' : 'mb-4 sm:mb-8'}`}>
            <h2 className="w-full text-center text-secondary font-bold text-white uppercase tracking-widest">
              {activePanel === 'entity' && t('entity.title')}
              {activePanel === 'search' && t('chat.find_partner')}
              {activePanel === 'solar' && t('landing.energy')}
            </h2>
            <button onClick={onClose} className="absolute right-[10px] text-white/50 hover:text-white text-2xl">✕</button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto sm:overflow-hidden no-scrollbar">
            {activePanel === 'entity' && (
              <div className="flex flex-col h-full p-4 sm:p-[20px] gap-4 overflow-hidden">
                <div className="shrink-0 w-full flex items-center justify-center">
                  {!user?.entity ? (
                    <div className="w-full max-w-[220px] h-[180px] rounded-2xl overflow-hidden border-2 border-blue-500/30 bg-black/40 shadow-2xl flex items-center justify-center">
                      <span className="text-6xl opacity-20">👤</span>
                    </div>
                  ) : (
                    <div className="relative w-[320px] max-w-full aspect-square max-h-[28vh] overflow-hidden flex items-center justify-center">
                      <Image
                        src={user.entity.avatarUrl}
                        alt={user.entity.name}
                        fill
                        sizes="320px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                  )}
                </div>

                <div className="shrink-0">
                  {!user?.entity ? (
                    <div className="space-y-4">
                      <div className="text-center">
                        <h3 className="text-amber-200 font-bold uppercase tracking-widest text-tiny mb-2">{t('entity.no_soul_reflection')}</h3>
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
                          <p className="text-tiny text-red-400 font-bold uppercase tracking-tight">{t('entity.attention')}</p>
                          <p className="text-tiny text-neutral-400 leading-tight text-left">
                            {t('entity.soul_reflection_desc')}
                          </p>
                        </div>
                      </div>
                      <Link
                        href={localePath('/entity/create')}
                        className="block w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-white shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-[1.02] uppercase tracking-widest text-tiny text-center"
                      >
                        {t('entity.create_soul_reflection')}
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-h2 font-bold text-white uppercase tracking-[0.2em]">{user.entity.name}</div>
                        <div className="text-tiny text-neutral-500 uppercase tracking-widest">{t('entity.created')} {new Date(user.entity.createdAt).toLocaleDateString()}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Link
                          href={localePath('/entity/profile')}
                          className="py-2.5 bg-white/5 border border-white/10 rounded-xl text-tiny uppercase tracking-widest hover:bg-white/10 transition-all font-bold text-center"
                        >
                          👤 {t('landing.profile')}
                        </Link>
                        <button
                          type="button"
                          onClick={onAskEntity}
                          className="py-2.5 bg-white/5 border border-white/10 rounded-xl text-tiny uppercase tracking-widest hover:bg-white/10 transition-all font-bold"
                        >
                          🤔 {t('entity.ask')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-[50px] overflow-hidden flex flex-col">
                  <MultiAdBlock
                    page="entity"
                    placement="sidebar"
                    gap={30}
                  />
                </div>
              </div>
            )}

            {activePanel === 'search' && (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="px-4 sm:px-[20px] pt-4 pb-2 shrink-0 flex flex-col items-center gap-4 text-center">
                  <button
                    onClick={onFindPartner}
                    className="group relative w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg font-bold text-white text-tiny shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-[1.02] uppercase tracking-wider"
                  >
                    ✨ {t('chat.find_partner')} ✨
                  </button>
                </div>

                <div className="px-4 sm:px-[20px] py-2 overflow-y-auto sm:overflow-hidden custom-scrollbar">
                  <div className="text-left w-full space-y-4">
                    <div className="text-tiny font-bold text-neutral-400 uppercase tracking-widest border-b border-white/5 pb-2">{t('entity.rules_warnings')}</div>
                    <ul className="space-y-3 text-tiny text-neutral-500 leading-relaxed list-none">
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_spam_title')}:</strong> {t('tree.rule_spam_desc')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_rudeness_title')}:</strong> {t('tree.rule_rudeness_desc')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_chatter_title')}:</strong> {t('tree.rule_chatter_desc')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_flirt_title')}:</strong> {t('tree.rule_flirt_desc')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_provocation_title')}:</strong> {t('tree.rule_provocation_desc')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-blue-500">•</span>
                        <span><strong className="text-neutral-400">{t('tree.rule_forbidden_title')}:</strong> {t('tree.rule_forbidden_desc')}</span>
                      </li>
                    </ul>

                    <div className="pt-2">
                      <div className="text-tiny font-bold text-neutral-400 uppercase tracking-widest mb-2">{t('tree.conditions_title')}</div>
                      <ul className="space-y-2 text-tiny text-neutral-500 leading-relaxed list-none">
                        <li className="flex gap-2">
                          <span className="text-indigo-500">○</span>
                          <span>{t('tree.condition_no_review')}</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-indigo-500">○</span>
                          <span>{t('tree.condition_off_platform')}</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 mx-4 sm:mx-[20px] mb-4 sm:mb-[20px] mt-4 sm:mt-[20px] flex flex-col overflow-hidden">
                  <MultiAdBlock
                    page="chat"
                    placement="sidebar"
                    gap={30}
                  />
                </div>
              </div>
            )}

            {activePanel === 'solar' && (
              <div className="flex flex-col h-full p-4 sm:p-[20px] gap-4 overflow-hidden">
                <div className="m-4 sm:m-[20px] shrink-0 relative w-[260px] h-[260px] max-w-full rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl self-center">
                  <video
                    key={solarStatus}
                    src={
                      solarStatus === 'charging' ? '/charge.mp4' :
                        solarStatus === 'ready' ? '/ready.mp4' : '/take.mp4'
                    }
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="px-[10px] space-y-3 shrink-0">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-tiny uppercase tracking-widest text-neutral-400 px-1">
                      <span>
                        {solarStatus === 'charging' ? t('tree.charge_progress') :
                          solarStatus === 'ready' ? t('tree.charged') : t('tree.absorption_process')}
                      </span>
                      <span className="text-yellow-500 font-bold">
                        {solarStatus === 'charging' ? `${Math.round((1 - solarTimeLeft / 3600) * 100)}%` :
                          solarStatus === 'ready' ? '100%' : `${Math.round(((60 - solarTimeLeft) / 60) * 100)}%`}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-1000 ease-linear"
                        style={{
                          width: solarStatus === 'charging' ? `${Math.max(0, Math.min(100, (1 - solarTimeLeft / 3600) * 100))}%` :
                            solarStatus === 'ready' ? '100%' : `${Math.max(0, Math.min(100, (1 - solarTimeLeft / takingDuration) * 100))}%`
                        }}
                      />
                    </div>
                  </div>

                  <div className="py-1.5 px-4 rounded-xl bg-white/5 border border-white/10 shadow-inner text-center">
                    <div className="text-tiny uppercase tracking-widest text-neutral-500 mb-0.5">
                      {solarStatus === 'charging' ? t('tree.until_full_charge') :
                        solarStatus === 'ready' ? t('tree.energy_ready') : t('tree.remaining_absorb')}
                    </div>
                    <div className={`text-h3 font-mono font-bold tracking-widest ${solarStatus === 'ready' ? 'text-yellow-400' : 'text-white'}`}>
                      {formatTreeDuration(solarTimeLeft)}
                    </div>
                  </div>

                  <button
                    onClick={onTakeCharge}
                    disabled={solarStatus !== 'ready'}
                    className={`w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny ${solarStatus === 'ready'
                      ? 'bg-yellow-600 text-white border-yellow-400 hover:scale-[1.02] active:scale-[0.98]'
                      : 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'
                      }`}
                  >
                    {solarStatus === 'charging' ? t('tree.charging') :
                      solarStatus === 'ready' ? t('tree.absorb_energy') : t('tree.absorbing')}
                  </button>

                  <button
                    onClick={onOpenShare}
                    className="w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny bg-black/40 text-amber-200 border-amber-500/30 hover:bg-amber-500/10"
                  >
                    {t('tree.share')}
                  </button>

                  {(shareCountToday !== null || shareDailyLimit !== null) && (
                    <div className="text-caption text-center text-white/50">
                      {t('tree.share_limit')}: {shareCountToday ?? '—'} / {shareDailyLimit ?? '—'}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-h-[50px] overflow-hidden flex flex-col">
                  <MultiAdBlock
                    page="solar"
                    placement="sidebar"
                    gap={30}
                    minWidth={300}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
