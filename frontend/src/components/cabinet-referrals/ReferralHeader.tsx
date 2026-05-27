import { Check, Copy, Users } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import type { ReferralText } from './types';

type ReferralHeaderProps = {
  copied: boolean;
  hasNickname: boolean;
  onCopy: () => void;
  onOpenBoost: () => void;
  referralLink: string;
  t: ReferralText;
};

export function ReferralHeader({
  copied,
  hasNickname,
  onCopy,
  onOpenBoost,
  referralLink,
  t,
}: ReferralHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <PageTitle
          title={t('referrals.title')}
          Icon={Users}
          gradientClassName="from-white via-slate-200 to-emerald-200"
          iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
          size="h3"
        />
      </div>

      <button
        type="button"
        onClick={onOpenBoost}
        className="referral-bonus-button group relative flex h-12 min-w-[104px] items-center justify-center overflow-hidden rounded-2xl border border-sky-300/32 bg-[radial-gradient(circle_at_20%_0%,rgba(59,130,246,0.42),transparent_34%),radial-gradient(circle_at_85%_100%,rgba(239,68,68,0.28),transparent_34%),linear-gradient(135deg,#071226,#150812_55%,#1f1604)] px-5 text-center text-sm font-black uppercase tracking-[0.22em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.13),0_12px_28px_rgba(0,0,0,0.26)] backdrop-blur-md transition hover:border-yellow-200/40"
      >
        <span className="relative z-10 drop-shadow-[0_0_10px_rgba(255,255,255,0.22)]">{t('referrals.manual_boost_button')}</span>
      </button>

      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-900/20 to-black/40 p-2 pl-4 backdrop-blur-md">
        <span className="text-tiny font-bold text-white/50 uppercase tracking-wider whitespace-nowrap">{t('referrals.your_link')}</span>
        <div className="max-w-[200px] sm:max-w-xs md:max-w-[250px] lg:max-w-md rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-tiny text-white/80 font-mono overflow-hidden text-ellipsis whitespace-nowrap">
          {referralLink}
        </div>
        <button
          onClick={onCopy}
          className="flex-shrink-0 rounded-xl bg-white/10 p-2 text-white hover:bg-white/20 transition-all"
          disabled={!hasNickname}
          title={copied ? t('referrals.copied') : t('referrals.copy')}
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-500" strokeWidth={3} />
          ) : (
            <Copy className="h-4 w-4" strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
