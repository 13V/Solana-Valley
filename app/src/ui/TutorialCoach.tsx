import { useEffect, useRef, useState, type ReactNode } from 'react';
import { bus } from '../game/EventBus';
import { useGameState } from './useGameState';
import type { UiState } from '../game/types';
import './tutorial.css';

// localStorage keys (namespaced like the rest of the app).
const DONE_KEY = 'solana-valley:tutorial-done';
const STEP_KEY = 'solana-valley:tutorial-step';

// The five gameplay verbs the game emits over bus.on('action', ...).
type Action = 'till' | 'plant' | 'water' | 'harvest' | 'sell';

// Where the nudge arrow points: the hotbar (tools/seeds, below the card) or
// the top HUD buttons (shop/harvest, above the card). 'none' hides it.
type Arrow = 'down' | 'up' | 'none';

type Step = {
  title: string;
  body: ReactNode;
  arrow: Arrow;
  // Fires when the player performs the matching action verb (steps 2/4/5/6/7).
  action?: Action;
  // True once this step's goal is reflected in game state (steps 3/6/7). Also
  // lets us fast-forward a returning player past steps they've already done.
  doneFromState?: (s: UiState) => boolean;
  // Step 1 has no movement event, so it offers a manual "Got it" button and
  // auto-advances after a timeout instead.
  manual?: boolean;
  autoAdvanceMs?: number;
};

// Small inline helper for highlighting a key / button glyph in the copy.
function Key({ children }: { children: ReactNode }) {
  return <span className="tut-key">{children}</span>;
}

const STEPS: Step[] = [
  {
    title: 'Move around',
    body: (
      <>
        Walk with <Key>WASD</Key> or the <Key>arrow keys</Key>.
      </>
    ),
    arrow: 'none',
    manual: true,
    autoAdvanceMs: 6000,
  },
  {
    title: 'Till the soil',
    body: (
      <>
        Select the Hoe (<Key>1</Key>) and click a tile to till it.
      </>
    ),
    arrow: 'down',
    action: 'till',
  },
  {
    title: 'Buy seeds',
    body: (
      <>
        Open the Shop (<Key>🛒</Key>) and buy Carrot seeds.
      </>
    ),
    arrow: 'up',
    doneFromState: (s) => Object.keys(s.seeds).length > 0,
  },
  {
    title: 'Plant a seed',
    body: <>Pick your seed in the hotbar, then click tilled soil to plant.</>,
    arrow: 'down',
    action: 'plant',
  },
  {
    title: 'Water your crop',
    body: (
      <>
        Select the Watering Can (<Key>2</Key>) and water your crop.
      </>
    ),
    arrow: 'down',
    action: 'water',
  },
  {
    title: 'Harvest it',
    body: <>Let it grow, then click it to harvest.</>,
    arrow: 'none',
    action: 'harvest',
    doneFromState: (s) => s.progress.harvested > 0,
  },
  {
    title: 'Sell for coins',
    body: (
      <>
        Open your Harvest bag (<Key>🎒</Key>) and sell for coins.
      </>
    ),
    arrow: 'up',
    action: 'sell',
    doneFromState: (s) => s.progress.earned > 0,
  },
];

// step === DONE_STEP means every step is cleared → show the final card.
const DONE_STEP = STEPS.length;

// Reads the persisted starting step, clamped to a valid range (0..DONE_STEP).
// Returning players resume where they left off; new players start at 0.
function initialStep(): number {
  const raw = localStorage.getItem(STEP_KEY);
  const n = raw == null ? 0 : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, DONE_STEP);
}

// Module-level restart hook so a Help/Settings panel can offer "Replay
// tutorial" without TutorialCoach having to be lifted into shared state.
// (Wire this to a button elsewhere; the coach picks it up on next mount.)
export function restartTutorial(): void {
  localStorage.removeItem(DONE_KEY);
  localStorage.setItem(STEP_KEY, '0');
  // Reload so the coach remounts cleanly into its first-run flow.
  window.location.reload();
}

export function TutorialCoach() {
  // If the player already finished/skipped, never mount the coach at all.
  const [active, setActive] = useState(() => !localStorage.getItem(DONE_KEY));
  const [step, setStep] = useState(initialStep);
  const state = useGameState();

  // Keep the latest step in a ref so the (mount-only) action listener and the
  // auto-advance timer can advance without resubscribing every step.
  const stepRef = useRef(step);
  stepRef.current = step;

  // Advance strictly forward to `next` (never regress) and persist. Clamps to
  // DONE_STEP (the final card). Used by every completion path.
  function advanceTo(next: number) {
    setStep((cur) => {
      if (next <= cur) return cur;
      const clamped = Math.min(next, DONE_STEP);
      localStorage.setItem(STEP_KEY, String(clamped));
      return clamped;
    });
  }

  // Persist completion and unmount the coach.
  function finish() {
    localStorage.setItem(DONE_KEY, '1');
    setActive(false);
  }

  // On mount (and whenever state changes), fast-forward past any step whose
  // state-derived condition is ALREADY satisfied — so a returning player who
  // already bought seeds / harvested / sold doesn't get stuck re-doing them,
  // and event-derived steps that happen to also be state-visible advance too.
  // We only ever move forward to the first not-yet-satisfied state step.
  useEffect(() => {
    if (!active) return;
    let target = stepRef.current;
    while (target < STEPS.length) {
      const s = STEPS[target];
      if (s.doneFromState && s.doneFromState(state)) target += 1;
      else break;
    }
    advanceTo(target); // no-op if target === current
  }, [active, state]);

  // Subscribe once to the gameplay action stream; advance when the verb
  // matches the CURRENT step's `action`.
  useEffect(() => {
    if (!active) return;
    return bus.on('action', (a: Action) => {
      const cur = STEPS[stepRef.current];
      if (cur && cur.action === a) advanceTo(stepRef.current + 1);
    });
  }, [active]);

  // Step 1 (Move) auto-advances after its timeout since there's no move event.
  useEffect(() => {
    if (!active) return;
    const cur = STEPS[step];
    if (!cur?.autoAdvanceMs) return;
    const id = window.setTimeout(() => advanceTo(step + 1), cur.autoAdvanceMs);
    return () => window.clearTimeout(id);
  }, [active, step]);

  if (!active) return null;

  // All steps cleared → final celebration card.
  if (step >= DONE_STEP) {
    return (
      <div className="tut-coach" role="dialog" aria-live="polite" aria-label="Tutorial complete">
        <div className="tut-card">
          <div className="tut-inner">
            <img className="tut-done-mark" src="assets/sprout-ui/tut_check.png" alt="✓" />
            <div className="tut-head">
              <span className="tut-title">You're all set! 🌱</span>
            </div>
            <p className="tut-body">Happy farming — chase rare crops &amp; lucky mutations!</p>
            <div className="tut-foot">
              <button type="button" className="btn tut-btn" onClick={finish}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cur = STEPS[step];

  return (
    <div className="tut-coach" role="dialog" aria-live="polite" aria-label="Tutorial">
      <div className="tut-card">
        <div className="tut-inner">
          <div className="tut-head">
            <span className="tut-step">
              Step {step + 1}/{STEPS.length}
            </span>
            <span className="tut-title">{cur.title}</span>
          </div>
          <p className="tut-body">{cur.body}</p>
          <div className="tut-foot">
            {cur.manual && (
              <button type="button" className="btn tut-btn" onClick={() => advanceTo(step + 1)}>
                Got it
              </button>
            )}
            <button type="button" className="tut-skip" onClick={finish}>
              Skip tutorial
            </button>
          </div>
        </div>
        {cur.arrow !== 'none' && (
          <span className={`tut-arrow tut-arrow--${cur.arrow}`} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
