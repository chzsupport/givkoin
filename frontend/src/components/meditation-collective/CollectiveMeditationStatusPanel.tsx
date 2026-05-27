'use client';

import { CollectiveCountdownTimer } from './CollectiveCountdownTimer';

type CollectiveParticipant = {
  id: string;
  name: string;
};

type CollectiveMeditationStatusPanelProps = {
  localizedWeText: string;
  isActive: boolean;
  collectiveStartAt: number;
  serverTimeBaseMs: number | null;
  serverPerfBaseMs: number | null;
  selfQueued: boolean;
  isOverlayOpen: boolean;
  selfJoined: boolean;
  participants: CollectiveParticipant[];
  selfId: string;
  onOptIn: () => void;
  onOptOut: () => void;
  onJoin: () => void;
  t: (key: string) => string;
};

export function CollectiveMeditationStatusPanel({
  localizedWeText,
  isActive,
  collectiveStartAt,
  serverTimeBaseMs,
  serverPerfBaseMs,
  selfQueued,
  isOverlayOpen,
  selfJoined,
  participants,
  selfId,
  onOptIn,
  onOptOut,
  onJoin,
  t,
}: CollectiveMeditationStatusPanelProps) {
  return (
    <div className="w-full max-w-3xl mx-auto">
      {Boolean(localizedWeText) && (
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 sm:p-7">
          <div className="text-center text-secondary leading-relaxed text-white/80 whitespace-pre-wrap">
            {localizedWeText}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 sm:p-7">
        <div className="flex flex-col items-center gap-3">
          <CollectiveCountdownTimer
            isActive={isActive}
            collectiveStartAt={collectiveStartAt}
            serverTimeBaseMs={serverTimeBaseMs}
            serverPerfBaseMs={serverPerfBaseMs}
          />

          {!isActive ? (
            <div className="flex flex-col items-center gap-3">
              {selfQueued ? (
                <button
                  type="button"
                  onClick={onOptOut}
                  className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border border-rose-400/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/20 active:scale-95 transition-all backdrop-blur-md"
                >
                  {t('meditation_collective.opt_out')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onOptIn}
                  className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border transition-all backdrop-blur-md bg-emerald-500/15 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/20 active:scale-95"
                >
                  {t('meditation_collective.opt_in')}
                </button>
              )}

              <div className="w-full">
                <div className="text-center text-white/70 text-secondary">
                  {t('meditation_collective.participants_signed_up')}: <span className="text-white/90 font-semibold">{participants.length}</span>
                </div>
                {participants.length > 0 && (
                  <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="grid gap-1.5">
                      {participants.map((participant) => (
                        <div key={participant.id} className="text-white/75 text-secondary">
                          {participant.name}{participant.id === selfId ? t('meditation_collective.you_marker') : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {!isOverlayOpen && (
                <button
                  type="button"
                  onClick={onJoin}
                  className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20 active:scale-95 transition-all backdrop-blur-md"
                >
                  {selfJoined ? t('meditation_collective.return_to_meditation') : t('meditation_collective.join')}
                </button>
              )}
              <div className="text-center text-white/70 text-secondary">
                {selfQueued
                  ? t('meditation_collective.queued_can_enter')
                  : t('meditation_collective.session_open_join_anytime')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
