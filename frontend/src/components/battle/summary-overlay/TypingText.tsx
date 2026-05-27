import { useEffect, useState } from 'react';

export function TypingText({
  text,
  delayMs,
  step,
  instant = false,
  showCaret = false,
  className = '',
}: {
  text: string;
  delayMs: number;
  step: number;
  instant?: boolean;
  showCaret?: boolean;
  className?: string;
}) {
  const [visibleChars, setVisibleChars] = useState(instant ? text.length : 0);

  useEffect(() => {
    if (instant) {
      setVisibleChars(text.length);
      return;
    }

    setVisibleChars(0);
    let cancelled = false;
    let timer = 0;

    const tick = (nextValue: number) => {
      if (cancelled) return;
      const bounded = Math.min(text.length, nextValue);
      setVisibleChars(bounded);
      if (bounded >= text.length) {
        return;
      }
      timer = window.setTimeout(() => tick(bounded + step), delayMs);
    };

    tick(step);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [delayMs, instant, step, text]);

  const displayText = text.slice(0, visibleChars);
  const showBlinkingCaret = showCaret && visibleChars < text.length;

  return (
    <span className={className}>
      {displayText}
      {showBlinkingCaret ? <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-[#c79d4a] align-[-0.16em]" /> : null}
    </span>
  );
}
