import { useState, useEffect, useRef } from 'react';

export function useInvestigationTimer(
  startedAt: string | null | undefined,
  durationLimitMinutes: number = 60,
  isPaused: boolean = false
) {
  const [seconds, setSeconds] = useState(0);
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }

    const startMs = new Date(startedAt).getTime();
    if (isNaN(startMs)) {
      setSeconds(0);
      return;
    }

    const calculateElapsed = () => {
      if (isPaused) {
        return;
      }
      const nowMs = Date.now();
      const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setSeconds(elapsedSec);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt, isPaused]);

  const formatTime = () => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (num: number) => String(num).padStart(2, '0');

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const durationLimitSeconds = durationLimitMinutes * 60;
  const isTimeLimitExceeded = seconds > durationLimitSeconds;
  const remainingSeconds = Math.max(0, durationLimitSeconds - seconds);

  const formatRemaining = () => {
    const mins = Math.floor(remainingSeconds / 60);
    const secs = remainingSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return {
    seconds,
    formattedTime: formatTime(),
    isTimeLimitExceeded,
    remainingSeconds,
    formattedRemaining: formatRemaining(),
    isWarning: remainingSeconds <= 10 * 60,
    isCritical: remainingSeconds <= 60,
    offsetRef,
  };
}
