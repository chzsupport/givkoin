export function ReferralPageStyles() {
  return (
    <style jsx>{`
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .referral-bonus-button {
        animation: referralBonusBreath 3.2s ease-in-out infinite;
      }
      .referral-bonus-button::before {
        content: '';
        position: absolute;
        inset: 1px;
        border-radius: inherit;
        background: linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.16) 45%, rgba(250,204,21,0.14) 52%, transparent 62%);
        opacity: 0;
        transform: translateX(-130%);
        animation: referralBonusSoftSweep 3.2s ease-in-out infinite;
      }
      .referral-bonus-button::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1px solid rgba(250,204,21,0.12);
        box-shadow: inset 0 0 12px rgba(125,211,252,0.08);
      }
      @keyframes referralBonusBreath {
        0%, 100% {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.13), 0 12px 28px rgba(0,0,0,0.26), 0 0 16px rgba(125,211,252,0.10);
        }
        50% {
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 14px 30px rgba(0,0,0,0.28), 0 0 22px rgba(250,204,21,0.16);
        }
      }
      @keyframes referralBonusSoftSweep {
        0%, 58% {
          opacity: 0;
          transform: translateX(-130%);
        }
        68% {
          opacity: 0.65;
        }
        82%, 100% {
          opacity: 0;
          transform: translateX(130%);
        }
      }
    `}</style>
  );
}
