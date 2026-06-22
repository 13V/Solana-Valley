// A small, non-blocking festival banner pinned top-center. Shows the festival
// active for the current in-game day (rotates daily). Pure flavor/hype.
import { useClock } from './useGameState';
import { eventForDay } from '../game/events';

export function EventBanner() {
  const clock = useClock();
  const ev = eventForDay(clock.day ?? 1);
  return (
    <div
      style={{
        position: 'fixed',
        top: 6,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: '92vw',
        padding: '3px 12px',
        borderRadius: 999,
        background: 'rgba(20,24,30,0.55)',
        color: '#fff',
        fontSize: 12,
        lineHeight: 1.2,
        pointerEvents: 'none',
        zIndex: 4,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      title={`${ev.name} — ${ev.blurb}`}
    >
      <span style={{ fontSize: 14 }}>{ev.emoji}</span>
      <strong>{ev.name}</strong>
      {ev.effect.label && (
        <span
          style={{
            background: 'rgba(123,214,106,0.22)',
            color: '#bff0b0',
            borderRadius: 6,
            padding: '1px 6px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {ev.effect.label}
        </span>
      )}
      <span style={{ opacity: 0.82, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.blurb}</span>
    </div>
  );
}
