import type { BadgeVariant } from '../../components/ui';
import type { Appeal, AppealParty } from './appealTypes';

export function getAppealComplainant(appeal: Appeal) {
  return appeal?.complainant || appeal?.userId || null;
}

export function getAppealStatusMeta(status: string | undefined): { label: string; variant: BadgeVariant } {
  if (status === 'pending') return { label: 'В ожидании', variant: 'warning' };
  if (status === 'resolved') return { label: 'Подтвержден', variant: 'error' };
  if (status === 'rejected') return { label: 'Отменен', variant: 'success' };
  return { label: status || 'Неизвестно', variant: 'default' };
}

export function getPartyId(party: AppealParty | null | undefined) {
  return typeof party === 'string' ? party : party?._id || '';
}

export function getPartyNickname(party: AppealParty | null | undefined) {
  if (!party) return '';
  return typeof party === 'string' ? '' : party.nickname || '';
}

export function getPartyDisplayName(party: AppealParty | null | undefined) {
  if (!party) return 'Неизвестный';
  if (typeof party === 'string') return party.slice(-6) || 'Неизвестный';
  return party.nickname || party._id?.slice(-6) || 'Неизвестный';
}
