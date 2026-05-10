import { useState, useRef, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { CheckCircle2, ArrowRight } from 'lucide-react';

export default function SliderPuzzle() {
  const [isVerified, setIsVerified] = useState(false);
  const sliderWidth = 260;
  const thumbWidth = 50;
  const targetX = sliderWidth - thumbWidth - 10; 
  
  const x = useMotionValue(0);
  
  const handleDragEnd = () => {
    if (x.get() > targetX - 15 && x.get() < targetX + 15) {
      setIsVerified(true);
      x.set(targetX);
    } else {
      x.set(0); // bounce back
    }
  };

  const fillWidth = useTransform(x, [0, targetX], [thumbWidth, sliderWidth]);

  return (
    <div className="captcha-container" style={{ position: 'relative' }}>
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
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Проведите ползунок до конца
          </p>
          
          <div style={{
            position: 'relative',
            width: sliderWidth,
            height: '50px',
            background: 'var(--bg-card)',
            borderRadius: '25px',
            border: '1px solid var(--border)',
            overflow: 'hidden'
          }}>
            <motion.div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: fillWidth,
              background: 'rgba(59, 130, 246, 0.2)',
              borderRight: '1px solid var(--primary)',
            }} />
            
            <p style={{
              position: 'absolute',
              width: '100%',
              textAlign: 'center',
              lineHeight: '50px',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              pointerEvents: 'none',
              zIndex: 1
            }}>
              Потяните вправо
            </p>

            <motion.div
              drag="x"
              dragConstraints={{ left: 0, right: targetX }}
              dragElastic={0}
              dragMomentum={false}
              onDragEnd={handleDragEnd}
              style={{ x }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div style={{
                position: 'absolute',
                top: 2,
                left: 2,
                width: thumbWidth - 4,
                height: 46,
                background: 'var(--primary)',
                borderRadius: '23px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'grab',
                zIndex: 2,
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}>
                <ArrowRight size={20} color="#fff" />
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}
