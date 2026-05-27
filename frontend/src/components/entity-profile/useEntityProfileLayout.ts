import { useEffect, useState } from 'react';

export function useEntityProfileLayout() {
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return {
    isDesktop: windowWidth > 1024,
  };
}
