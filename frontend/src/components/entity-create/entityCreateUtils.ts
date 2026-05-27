import { ENTITY_NAME_MAX_LENGTH } from './constants';
import type { EntityResponse } from './types';

export function getEntityNameLength(value: string) {
    return [...value.trim()].length;
}

export function limitEntityName(value: string) {
    return [...value].slice(0, ENTITY_NAME_MAX_LENGTH).join('');
}

export function buildUserEntity(entity: NonNullable<EntityResponse['entity']>) {
    return {
        ...entity,
        _id: String(entity._id || entity.id || ''),
        satietyUntil: entity.satietyUntil || undefined,
    };
}
