import { useCallback, useEffect, useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiGet } from '@/utils/api';
import type { EntityMoodDiagnostics, EntityProfileData } from './types';

type AuthState = ReturnType<typeof useAuth>;

export function useEntityProfileData({
  user,
  updateUser,
}: {
  user: AuthState['user'];
  updateUser: AuthState['updateUser'];
}) {
  const [entityData, setEntityData] = useState<EntityProfileData | null>(null);
  const [entityLoading, setEntityLoading] = useState(true);

  const loadEntity = useCallback(() => {
    setEntityLoading(true);
    apiGet<{ entity: EntityProfileData | null }>('/entity/me')
      .then((response) => {
        if (response?.entity) {
          setEntityData(response.entity);
          const currentEntity = user?.entity;
          const shouldSyncUserEntity = Boolean(user) && (
            !currentEntity
            || currentEntity._id !== response.entity._id
            || currentEntity.name !== response.entity.name
            || currentEntity.mood !== response.entity.mood
            || currentEntity.avatarUrl !== response.entity.avatarUrl
            || currentEntity.satietyUntil !== response.entity.satietyUntil
            || currentEntity.createdAt !== response.entity.createdAt
          );
          if (user && shouldSyncUserEntity) {
            updateUser({ ...user, entity: response.entity } as typeof user);
          }
        }
      })
      .catch(() => {})
      .finally(() => setEntityLoading(false));
  }, [updateUser, user]);

  useEffect(() => {
    loadEntity();
  }, [loadEntity]);

  return {
    entityData,
    entityLoading,
    loadEntity,
  };
}

export function useEntityMoodDiagnostics(entityId?: string) {
  const [moodDiag, setMoodDiag] = useState<EntityMoodDiagnostics | null>(null);

  useEffect(() => {
    if (!entityId) return;
    apiGet<{ diagnostics: EntityMoodDiagnostics }>('/entity/mood-diagnostics')
      .then((response) => setMoodDiag(response?.diagnostics || null))
      .catch(() => setMoodDiag(null));
  }, [entityId]);

  return moodDiag;
}
