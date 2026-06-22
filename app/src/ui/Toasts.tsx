import { useEffect, useState } from 'react';
import { bus } from '../game/EventBus';

type Toast = { id: number; msg: string };

// Cap how many toasts show at once so a burst of messages can't cover the screen;
// older ones drop off the top as new ones arrive at the bottom.
const MAX_TOASTS = 5;

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    let nextId = 0;
    return bus.on('toast', (msg) => {
      const toast = { id: nextId++, msg };
      // Append at the bottom; keep only the latest MAX_TOASTS (slice from the end
      // drops the oldest off the top).
      setToasts((cur) => [...cur, toast].slice(-MAX_TOASTS));
      setTimeout(() => {
        setToasts((cur) => cur.filter((t) => t.id !== toast.id));
      }, 2500);
    });
  }, []);

  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.msg}
        </div>
      ))}
    </div>
  );
}
