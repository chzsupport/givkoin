import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Sun, Moon, Star, Cloud } from 'lucide-react';

const icons = [
  { id: 'sun', Icon: Sun, color: '#f59e0b' },
  { id: 'moon', Icon: Moon, color: '#a8a29e' },
  { id: 'star', Icon: Star, color: '#3b82f6' },
  { id: 'cloud', Icon: Cloud, color: '#9ca3af' }
];

export default function OrderSequence() {
  const [isVerified, setIsVerified] = useState(false);
  const [sequence, setSequence] = useState([]);
  const [error, setError] = useState(false);

  // Hardcoded correct sequence for demo
  const targetSequence = ['sun', 'star', 'moon'];

  const handleClick = (id) => {
    if (isVerified) return;
    
    const newSeq = [...sequence, id];
    setSequence(newSeq);
    setError(false);

    if (newSeq.length === targetSequence.length) {
      const isCorrect = newSeq.every((val, index) => val === targetSequence[index]);
      if (isCorrect) {
        setIsVerified(true);
      } else {
        setError(true);
        setTimeout(() => {
          setSequence([]);
          setError(false);
        }, 800);
      }
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem', textAlign: 'center' }}>
            Нажмите по порядку: <br/>
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>Солнце</span>, <span style={{ color: '#3b82f6', fontWeight: 600 }}>Звезда</span>, <span style={{ color: '#a8a29e', fontWeight: 600 }}>Луна</span>
          </p>
          
          <motion.div 
            animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
          >
            {icons.map(({ id, Icon, color }) => {
              const index = sequence.indexOf(id);
              const isSelected = index !== -1;
              return (
                <motion.button
                  key={id}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleClick(id)}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '12px',
                    background: isSelected ? 'var(--border)' : 'var(--bg-card)',
                    border: `2px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <Icon size={28} color={color} />
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-6px',
                      background: 'var(--primary)',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
