import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export default function CatchOrb() {
  const [isVerified, setIsVerified] = useState(false);
  const [position, setPosition] = useState({ x: 50, y: 50 }); // percentage

  // Move orb every 800ms
  useEffect(() => {
    if (isVerified) return;
    const interval = setInterval(() => {
      setPosition({
        x: Math.random() * 80 + 10, // 10% to 90%
        y: Math.random() * 80 + 10
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isVerified]);

  const handleCatch = () => {
    setIsVerified(true);
  };

  return (
    <div className="captcha-container" style={{ position: 'relative', height: '200px' }}>
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
        <div style={{ width: '100%', height: '100%' }}>
          <p style={{ 
            color: 'var(--text-muted)', 
            fontSize: '0.9rem', 
            textAlign: 'center', 
            position: 'absolute', 
            width: '100%', 
            top: '10px' 
          }}>
            Поймайте светящийся шар
          </p>
          
          <motion.button
            onClick={handleCatch}
            animate={{
              left: `${position.x}%`,
              top: `${position.y}%`,
            }}
            transition={{
              type: "spring",
              damping: 12,
              stiffness: 100
            }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              position: 'absolute',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(59, 130, 246, 0.8)',
              transform: 'translate(-50%, -50%)',
              zIndex: 5
            }}
          />
        </div>
      )}
    </div>
  );
}
