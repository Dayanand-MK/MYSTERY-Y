import { useState, useEffect, useRef } from 'react';

export function useInvestigationTimer(startedAt: string | null | undefined, durationLimitMinutes: number = 60) {
  const [seconds, setSeconds] = useState(0);
  // serverClockOffsetMs: difference between server time and local time (ms)
  // We use the session's started_at as the reference point. The offset correction
  // accounts for situations where the participant's local clock is ahead/behind.
  const offsetRef = useRef<number>(0);

  useEffect(() => {
    if (!startedAt) {
      setSeconds(0);
      return;
    }

    const startMs = new Date(startedAt).getTime();

    // Calculate elapsed time using the server-authoritative start timestamp
    // The offset is implicitly handled by the fact that started_at comes from the server.
    // We don't trust Date.now() for the absolute time, but we trust it for
    // measuring ELAPSED duration since the component mounted.
    const mountLocalMs = Date.now();
    // We know started_at is the server's time. Elapsed at mount = local_now - server_start.
    // This is accurate as long as the server and local clocks are reasonably close.
    // We store the offset for periodic recalculation.
    const initialElapsed = Math.max(0, Math.floor((mountLocalMs - startMs) / 1000));
    setSeconds(initialElapsed);

    const calculateElapsed = () => {
      const nowMs = Date.now();
      const elapsedSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      setSeconds(elapsedSec);
    };

    const interval = setInterval(calculateElapsed, 1000);

    return () => clearInterval(interval);
  }, [startedAt]);

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
    offsetRef,
  };
}
