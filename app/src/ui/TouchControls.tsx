import { useEffect, useRef, useState } from 'react';
import { virtualMove } from '../game/input';
import './touch.css';

// On-screen thumb joystick for touch devices. Drives the shared `virtualMove`
// vector (-1..1 on each axis, clamped to the unit circle) that the game's input
// module reads each frame. Pinned bottom-LEFT so it never covers the
// bottom-centre hotbar, and only shown on coarse-pointer (touch) devices.
//
// Lives directly in `.overlay` (which is pointer-events:none); the base opts
// back into pointer events so a finger can grab it, while the rest of the farm
// stays tappable for planting/harvesting.

const KNOB_RANGE = 38; // px the knob can travel from centre (== base radius - knob radius)

export function TouchControls() {
  // Render only on touch / coarse-pointer hardware. Checked once on mount so a
  // desktop with a mouse never sees (or interacts with) the joystick. The CSS
  // @media query is the primary guard; this also skips the DOM entirely.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(pointer: coarse)');
    const apply = () => setIsTouch(mql.matches);
    apply();
    // Hybrid devices can switch primary pointer; keep in sync defensively.
    mql.addEventListener?.('change', apply);
    return () => mql.removeEventListener?.('change', apply);
  }, []);

  const baseRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 }); // visual knob offset in px

  // Always reset the shared vector when this control unmounts so the player
  // never gets stuck "walking" if the joystick disappears mid-drag.
  useEffect(() => {
    return () => {
      virtualMove.x = 0;
      virtualMove.y = 0;
    };
  }, []);

  if (!isTouch) return null;

  const updateFromPointer = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    // Clamp the travel to the unit circle (base radius), so diagonal input is
    // never faster than cardinal and the knob stays inside the ring.
    const dist = Math.hypot(dx, dy);
    if (dist > KNOB_RANGE && dist > 0) {
      dx = (dx / dist) * KNOB_RANGE;
      dy = (dy / dist) * KNOB_RANGE;
    }
    setKnob({ x: dx, y: dy });
    // Normalise to -1..1. Y is inverted: screen-down is +y, but "up" movement
    // should be negative y to match the game's coordinate convention.
    virtualMove.x = dx / KNOB_RANGE;
    virtualMove.y = dy / KNOB_RANGE;
  };

  const release = () => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    virtualMove.x = 0;
    virtualMove.y = 0;
  };

  return (
    <div className="touch-joy" aria-hidden="true">
      <div
        ref={baseRef}
        className="touch-joy-base"
        onPointerDown={(e) => {
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (pointerId.current !== e.pointerId) return;
          updateFromPointer(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (pointerId.current !== e.pointerId) return;
          release();
        }}
        onPointerCancel={(e) => {
          if (pointerId.current !== e.pointerId) return;
          release();
        }}
      >
        <div
          className="touch-joy-knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>
    </div>
  );
}
