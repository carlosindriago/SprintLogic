import { useEffect, useRef } from 'react';

export function useDoubleShift(onActivate: () => void, threshold = 400) {
  const lastShift = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        const now = Date.now();
        if (now - lastShift.current < threshold) {
          e.preventDefault();
          onActivate();
          lastShift.current = 0;
        } else {
          lastShift.current = now;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onActivate, threshold]);
}
