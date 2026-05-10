import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Image as ImageIcon } from 'lucide-react';

export default function RotateAlign() {
  const [isVerified, setIsVerified] = useState(false);
  const [rotation, setRotation] = useState(135); // initial random wrong rotation

  const handleChange = (e) => {
    setRotation(Number(e.target.value));
  };

  const checkRotation = () => {
    // If it's close to 0 or 360 degrees (upright)
    if ((rotation >= 0 && rotation <= 15) || (rotation >= 345 && rotation <= 360)) {
      setIsVerified(true);
      setRotation(0);
    } else {
      // Bounce back slightly if wrong? Just visual feedback
    }
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            Поверните картинку ровно вверх
          </p>
          
          <div style={{
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'var(--bg-card)',
            border: '2px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            overflow: 'hidden',
            boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
          }}>
            <motion.div style={{ rotate: rotation }}>
              <ImageIcon size={48} color="var(--primary)" />
            </motion.div>
          </div>

          <div style={{ width: '80%', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input 
              type="range" 
              min="0" 
              max="360" 
              value={rotation} 
              onChange={handleChange}
              onMouseUp={checkRotation}
              onTouchEnd={checkRotation}
              style={{
                flex: 1,
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
