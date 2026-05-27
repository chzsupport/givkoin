import type { Wish } from './types';

export function parseSupportAmount(value: string, userK: number) {
  const amount = parseInt(value);
  if (Number.isNaN(amount) || amount <= 0 || amount > userK) return null;
  return amount;
}

export function replaceWishInList(wishes: Wish[], updatedWish: Wish) {
  return wishes.map((wish) => (wish.id === updatedWish.id ? updatedWish : wish));
}
