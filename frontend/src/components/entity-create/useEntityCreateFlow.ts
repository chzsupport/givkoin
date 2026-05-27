import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { apiPost } from '@/utils/api';
import { ENTITY_CHANGE_COOLDOWN_MS, ENTITY_NAME_MAX_LENGTH } from './constants';
import { fetchEntityAvatars } from './entityAvatarApi';
import { buildUserEntity, getEntityNameLength } from './entityCreateUtils';
import type { CreateEntityStep, EntityResponse } from './types';

export function useEntityCreateFlow() {
  const [step, setStep] = useState<CreateEntityStep>('gallery');
  const [avatars, setAvatars] = useState<string[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [focusedAvatar, setFocusedAvatar] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshUser, updateUser, user, isAuthLoading } = useAuth();
  const router = useRouter();
  const { t, localePath } = useI18n();
  const searchParams = useSearchParams();
  const changeMode = Boolean(searchParams?.get('change') === '1' && user?.entity);
  const now = Date.now();
  const changeAvailableAt = useMemo(() => {
    if (!changeMode || !user?.entity?.createdAt) return null;
    return new Date(new Date(user.entity.createdAt).getTime() + ENTITY_CHANGE_COOLDOWN_MS);
  }, [changeMode, user?.entity?.createdAt]);
  const msLeft = changeAvailableAt ? changeAvailableAt.getTime() - now : 0;
  const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (24 * 60 * 60 * 1000)) : 0;
  const canChange = !changeMode || msLeft <= 0;

  useEffect(() => {
    if (isAuthLoading) return;
    if (user?.entity && !changeMode) {
      router.replace(localePath('/entity/profile'));
    }
  }, [changeMode, isAuthLoading, localePath, router, user?.entity]);

  useEffect(() => {
    let cancelled = false;

    const loadAvatars = async () => {
      setAvatarsLoading(true);
      try {
        const items = await fetchEntityAvatars();

        if (!cancelled) {
          setAvatars(items);
          setFocusedAvatar((prev) => prev && items.includes(prev) ? prev : null);
          setSelectedAvatar((prev) => prev && items.includes(prev) ? prev : null);
        }
      } catch (e) {
        console.error('Failed to load entity avatars:', e);
        if (!cancelled) {
          setAvatars([]);
        }
      } finally {
        if (!cancelled) {
          setAvatarsLoading(false);
        }
      }
    };

    loadAvatars();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAvatarChoose = (avatar: string) => {
    setSelectedAvatar(avatar);
    setFocusedAvatar(avatar);
  };

  const handleSaveName = async () => {
    const safeName = name.trim();
    if (!selectedAvatar || !safeName) return;
    if (getEntityNameLength(safeName) > ENTITY_NAME_MAX_LENGTH) {
      setError(t('entity_create.name_too_long'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await apiPost<EntityResponse>(changeMode ? '/entity/change' : '/entity', {
        name: safeName,
        avatarUrl: selectedAvatar,
        confirmReset: changeMode ? agreed : undefined,
      });

      if (user && result?.entity) {
        updateUser({ ...user, entity: buildUserEntity(result.entity) });
      }

      void refreshUser().catch((e) => {
        console.error('Failed to refresh user after entity save:', e);
      });

      router.push(localePath('/tree'));
    } catch (err: unknown) {
      console.error('Create entity error:', err);
      const message = err instanceof Error ? err.message : '';
      setError(message || t('entity_create.create_error'));
      setIsSubmitting(false);
    }
  };

  return {
    agreed,
    avatars,
    avatarsLoading,
    canChange,
    changeMode,
    daysLeft,
    error,
    focusedAvatar,
    handleAvatarChoose,
    handleSaveName,
    isSubmitting,
    name,
    previewAvatar,
    selectedAvatar,
    setAgreed,
    setFocusedAvatar,
    setName,
    setPreviewAvatar,
    setStep,
    step,
    t,
  };
}
