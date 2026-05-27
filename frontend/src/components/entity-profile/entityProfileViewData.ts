import type { EntityMoodDiagnostics, EntityProfileData } from './types';

const CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

type EntityProfileViewDataParams = {
  entity: EntityProfileData;
  moodDiag: EntityMoodDiagnostics | null;
  t: (key: string) => string;
};

const formatRemaining = (ms: number, t: (key: string) => string) => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}${t('entity_profile.minutes_short')}`;
  return `${hours}${t('entity_profile.hours_short')} ${minutes}${t('entity_profile.minutes_short')}`;
};

const formatMood = (mood: string | undefined, t: (key: string) => string) => {
  if (!mood) return t('entity_profile.mood_neutral');
  const map: Record<string, string> = {
    happy: t('entity_profile.mood_happy'),
    neutral: t('entity_profile.mood_neutral'),
    sad: t('entity_profile.mood_sad'),
  };
  return map[mood] || mood;
};

export function getEntityProfileViewData({
  entity,
  moodDiag,
  t,
}: EntityProfileViewDataParams) {
  const createdAt = entity.createdAt ? new Date(entity.createdAt) : null;
  const changeAvailableAt = createdAt ? new Date(createdAt.getTime() + CHANGE_COOLDOWN_MS) : null;
  const msUntilChange = changeAvailableAt ? changeAvailableAt.getTime() - Date.now() : 0;
  const daysUntilChange = msUntilChange > 0 ? Math.ceil(msUntilChange / (24 * 60 * 60 * 1000)) : 0;
  const canChangeEntity = !changeAvailableAt || msUntilChange <= 0;

  const satietyUntil = entity.satietyUntil ? new Date(entity.satietyUntil) : null;
  const isSated = Boolean(satietyUntil && satietyUntil.getTime() > Date.now());
  const shownMood = moodDiag?.mood || (entity.mood === 'happy' && !isSated ? 'neutral' : entity.mood);
  const moodLabel = formatMood(shownMood, t);
  const moodEffectText =
    shownMood === 'happy'
      ? t('entity_profile.mood_effect_happy')
      : shownMood === 'sad'
        ? t('entity_profile.mood_effect_sad')
        : t('entity_profile.mood_effect_neutral');
  const satietyRemainingText = isSated && satietyUntil
    ? formatRemaining(satietyUntil.getTime() - Date.now(), t)
    : t('entity_profile.feed_prompt');

  return {
    canChangeEntity,
    daysUntilChange,
    isSated,
    moodEffectText,
    moodLabel,
    satietyRemainingText,
  };
}
