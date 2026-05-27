export function emitReferralRewardOffer(offer: unknown) {
  if (typeof window === 'undefined') return;
  if (!offer || typeof offer !== 'object' || !('id' in offer)) return;
  window.dispatchEvent(new CustomEvent('givkoin:ad-boost-offer', { detail: offer }));
}
