// Reusable tooltip: wraps a trigger and shows a floating bubble with live
// numbers. Mouse -> hover; touch -> tap toggles (and a long-press also opens).
// The bubble renders in a portal on <body>, is positioned next to the trigger
// and clamped to the viewport, and is pointer-events:none so it never blocks
// the row's buttons underneath.
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { QUALITY, type Plant } from '../game/economy';
import type { Progress } from '../game/types';
import {
  formatDuration,
  formatPct,
  plantStats,
  stackStats,
  type StackStats,
} from './liveStats';
import './tooltip.css';

type Props = {
  /** The bubble's contents (the live stats). */
  content: ReactNode;
  /** The trigger element(s) the user hovers / taps. */
  children: ReactNode;
  /** Wrapper className. Defaults to `ui-tip-trigger` (a grow-to-fill flex row);
   *  pass `ui-tip-trigger col` for stacked/column cells like the Almanac. */
  className?: string;
};

const GAP = 8; // px gap between trigger and bubble
const MARGIN = 6; // min px from the viewport edge

export function Tooltip({ content, children, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const longPress = useRef<number | null>(null);
  const tipId = useId();

  const clearLongPress = () => {
    if (longPress.current !== null) {
      window.clearTimeout(longPress.current);
      longPress.current = null;
    }
  };

  // Measure the trigger's box. The default wrapper uses `display:contents`
  // (so it doesn't disturb the row's flex layout), and such elements have no
  // layout box of their own — getBoundingClientRect() returns zeros. So we
  // union the rects of its children to get the real on-screen area.
  const triggerRect = (): DOMRect | null => {
    const el = triggerRef.current;
    if (!el) return null;
    const own = el.getBoundingClientRect();
    if (own.width > 0 || own.height > 0) return own;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const child of Array.from(el.children)) {
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      left = Math.min(left, r.left);
      top = Math.min(top, r.top);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    if (!Number.isFinite(left)) return own; // nothing measurable -> fall back
    return new DOMRect(left, top, right - left, bottom - top);
  };

  // Position the bubble after it renders so we can measure its real size and
  // clamp it inside the viewport. Prefer below the trigger, flip above if it
  // would overflow the bottom.
  const reposition = useCallback(() => {
    const t = triggerRect();
    const b = bubbleRef.current?.getBoundingClientRect();
    if (!t) return;
    const bw = b?.width ?? 200;
    const bh = b?.height ?? 80;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontally center on the trigger, then clamp to the viewport.
    let left = t.left + t.width / 2 - bw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - bw - MARGIN));

    // Below by default; flip above when there's no room below but room above.
    let top = t.bottom + GAP;
    if (top + bh > vh - MARGIN && t.top - GAP - bh > MARGIN) {
      top = t.top - GAP - bh;
    }
    top = Math.max(MARGIN, Math.min(top, vh - bh - MARGIN));

    setPos({ left, top });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, content, reposition]);

  // While open, re-clamp on scroll/resize and close on Escape. On touch, an
  // outside tap dismisses.
  useEffect(() => {
    if (!open) return;
    const onScrollResize = () => reposition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDocPointer = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDocPointer, true);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDocPointer, true);
    };
  }, [open, reposition]);

  useEffect(() => clearLongPress, []);

  // Mouse hover only (touch is handled via the touch/click toggle below so a
  // synthesized mouseenter on tap doesn't fight the toggle).
  const onMouseEnter = (e: React.MouseEvent) => {
    if (e.nativeEvent instanceof PointerEvent && e.nativeEvent.pointerType === 'touch') return;
    setOpen(true);
  };
  const onMouseLeave = () => setOpen(false);

  const onTouchStart = () => {
    // Long-press opens (without requiring a tap-toggle), feels native.
    clearLongPress();
    longPress.current = window.setTimeout(() => setOpen(true), 350);
  };
  const onTouchEnd = () => clearLongPress();
  const onTouchMove = () => clearLongPress();

  // Tap toggles. We only act for touch pointers here; mouse uses hover.
  const onClickCapture = (e: React.MouseEvent) => {
    const ne = e.nativeEvent;
    if (ne instanceof PointerEvent && ne.pointerType === 'touch') {
      // Don't hijack taps on actual buttons/links inside the trigger.
      const target = e.target as HTMLElement;
      if (target.closest('button, a, input, [role="button"]')) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
  };

  return (
    <span
      ref={triggerRef}
      className={className ?? 'ui-tip-trigger'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onClickCapture={onClickCapture}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            role="tooltip"
            className="ui-tip"
            style={{ left: pos.left, top: pos.top }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

// ---- ready-made tooltip bodies --------------------------------------------

// Seed / plant / almanac body: rarity, buy/sell, grow time, mutation odds.
// `showBuy` is off for the Almanac (you don't buy from it).
export function PlantTipBody({
  plant,
  progress,
  showBuy = true,
}: {
  plant: Plant;
  progress?: Progress;
  showBuy?: boolean;
}) {
  const s = plantStats(plant, progress);
  return (
    <>
      <div className="ui-tip-title">
        <span className="ui-tip-name">{plant.name}</span>
        <span className="ui-tip-rar" style={{ color: s.rarityCss }}>
          {s.rarity}
        </span>
      </div>

      {showBuy && (
        <div className="ui-tip-line">
          <span className="k">Buy</span>
          <span className="v">{s.seedCost.toLocaleString()}c</span>
        </div>
      )}

      <div className="ui-tip-line">
        <span className="k">Sells for</span>
        <span className={`v ${s.saleBoosted ? 'boosted' : ''}`}>
          {s.effectiveValue.toLocaleString()}c
        </span>
      </div>

      <div className="ui-tip-line">
        <span className="k">Grows in</span>
        <span className={`v ${s.growthBoosted ? 'boosted' : ''}`}>
          {formatDuration(s.effectiveGrowthSeconds)}
        </span>
      </div>

      <div className="ui-tip-sub">
        <div className="ui-tip-sub-head">
          Mutation odds{s.fortuneBoosted ? ' (Fortune)' : ''} — rare variants:
        </div>
        {s.mutations.map((m) => (
          <div className="ui-tip-mut" key={m.id}>
            <span className="mname" style={{ color: m.css }}>
              {m.name} ×{m.mult}
            </span>
            <span className="modds">{formatPct(m.chance)}</span>
          </div>
        ))}
      </div>

      <div className="ui-tip-sub">
        <div className="ui-tip-sub-head">Quality stars — every harvest:</div>
        {(['silver', 'gold', 'iridium'] as const).map((q) => (
          <div className="ui-tip-mut" key={q}>
            <span className="mname" style={{ color: QUALITY[q].css }}>
              {'★'.repeat(QUALITY[q].stars)} {QUALITY[q].label}
            </span>
            <span className="modds">×{QUALITY[q].mult}</span>
          </div>
        ))}
        <div className="ui-tip-note">Better odds with Fertilizer &amp; Farming. Stacks with mutation.</div>
      </div>

      {typeof plant.regrow === 'number' && plant.regrow > 0 && (
        <div className="ui-tip-note">
          ♻ Multi-harvest — regrows every {formatDuration(plant.regrow)}.
        </div>
      )}

      {s.locked && (
        <div className="ui-tip-locked">🔒 Unlocks at Lv {s.unlockLevel}</div>
      )}

      {(s.saleBoosted || s.growthBoosted) && (
        <div className="ui-tip-note">Live values include your upgrades.</div>
      )}
    </>
  );
}

// Harvest (bag) body: realised unit value (mutation × wet × quality × wilt
// already baked into `baseUnit`), quantity, and total. Reflects the Market
// Stall sale boost.
export function StackTipBody({
  stats,
}: {
  stats: StackStats;
}) {
  const {
    plant,
    mutation,
    wet,
    quality,
    qualityMult,
    qualityStars,
    qualityCss,
    qualityLabel,
    withered,
    count,
    unitValue,
    total,
    saleBoosted,
  } = stats;
  return (
    <>
      <div className="ui-tip-title">
        <span className="ui-tip-name">{plant.name}</span>
        {mutation.id !== 'normal' && (
          <span className="ui-tip-rar" style={{ color: mutation.css }}>
            {mutation.name} ×{mutation.mult}
          </span>
        )}
      </div>

      {quality !== 'none' && (
        <div className="ui-tip-line">
          <span className="k">Quality</span>
          <span className="v" style={{ color: qualityCss }}>
            {'★'.repeat(qualityStars)} {qualityLabel} ×{qualityMult}
          </span>
        </div>
      )}

      {wet && (
        <div className="ui-tip-line">
          <span className="k">Wet bonus</span>
          <span className="v">×1.5</span>
        </div>
      )}

      {withered && (
        <div className="ui-tip-line">
          <span className="k">Wilted</span>
          <span className="v" style={{ color: '#a9743f' }}>×0.4</span>
        </div>
      )}

      <div className="ui-tip-line">
        <span className="k">Value each</span>
        <span className={`v ${saleBoosted ? 'boosted' : ''}`}>
          {unitValue.toLocaleString()}c
        </span>
      </div>

      <div className="ui-tip-line">
        <span className="k">Quantity</span>
        <span className="v">×{count.toLocaleString()}</span>
      </div>

      <div className="ui-tip-line">
        <span className="k">Total</span>
        <span className={`v ${saleBoosted ? 'boosted' : ''}`}>
          {total.toLocaleString()}c
        </span>
      </div>

      {saleBoosted && (
        <div className="ui-tip-note">Includes your Market Stall upgrade.</div>
      )}
    </>
  );
}

// Convenience: build StackTipBody stats from a parsed bag stack.
export function makeStackStats(
  plant: Plant,
  mutation: StackStats['mutation'],
  wet: boolean,
  count: number,
  baseUnitValue: number,
  progress?: Progress,
  quality: StackStats['quality'] = 'none',
  withered = false,
): StackStats {
  return stackStats(plant, mutation, wet, count, baseUnitValue, progress, quality, withered);
}
