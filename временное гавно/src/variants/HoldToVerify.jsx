import { useState, useRef, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { CheckCircle2, ShieldAlert } from 'lucide-react';

export default function HoldToVerify() {
  const [isHolding, setIsHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const timerRef = useRef(null);

  const startHold = () => {
    if (isVerified) return;
    setIsHolding(true);
    let currentProgress = 0;
    
    timerRef.current = setInterval(() => {
      currentProgress += 2; // 50 * 2 = 100 over 2.5 seconds
      setProgress(currentProgress);
      if (currentProgress >= 100) {
        clearInterval(timerRef.current);
        setIsVerified(true);
        setIsHolding(false);
      }
    }, 50);
  };

  const endHold = () => {
    if (isVerified) return;
    clearInterval(timerRef.current);
    setIsHolding(false);
    setProgress(0);
  };

  return (
    <div className="captcha-container">
      {isVerified ? (
        <div className="success-overlay">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <CheckCircle2 size={48} />
          </motion.div>
          <p style={{ marginTop: '0.5rem', fontWeight: 600 }}>Проверка пройдена</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
            Удерживайте кнопку для подтверждения,<br /> что вы человек
          </p>
          <motion.button
            onMouseDown={startHold}
            onMouseUp={endHold}
            onMouseLeave={endHold}
            onTouchStart={startHold}
            onTouchEnd={endHold}
            animate={{
              scale: isHolding ? 0.95 : 1,
              boxShadow: isHolding ? '0 0 20px var(--primary-glow)' : '0 0 0px transparent'
            }}
            style={{
              position: 'relative',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              border: 'none',
              background: 'var(--bg-card)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
            }}
          >
            {/* Progress fill */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                width: '100%',
                height: `${progress}%`,
                background: 'linear-gradient(to top, var(--primary), #8b5cf6)',
                transition: 'height 0.05s linear',
                opacity: 0.8
              }}
            />
            {/* Inner circle mask */}
            <div style={{
              position: 'relative',
              zIndex: 2,
              background: 'var(--bg)',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
               <ShieldAlert size={28} color={isHolding ? 'var(--primary)' : 'var(--text-muted)'} />
            </div>
          </motion.button>
        </div>
      )}
    </div>
  );
}
