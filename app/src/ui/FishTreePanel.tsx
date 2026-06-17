import { Fragment } from 'react';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';
import {
  FISH_TREE,
  FISH_BRANCHES,
  FISH_NODE_BY_ID,
  spentPoints,
  availablePoints,
  prereqMet,
  type FishNode,
} from '../game/fishingTree';

// The Angler's Tree: three branches (Fortune / Bounty / Technique) converging on
// a capstone. You earn fishing points by catching fish and spend them here. Each
// card shows its state — unlocked, ready to buy, too pricey, or prereq-locked.
function NodeCard({ node, unlocked, available }: { node: FishNode; unlocked: Set<string>; available: number }) {
  const owned = unlocked.has(node.id);
  const pre = prereqMet(node, unlocked);
  const affordable = available >= node.cost;
  const branch = FISH_BRANCHES.find((b) => b.id === node.branch);
  const accent = node.branch === 'capstone' ? '#ffd21a' : branch?.color ?? '#7bd66a';

  const border = owned ? accent : pre ? (affordable ? accent : '#6b5b43') : '#3a3328';
  const bg = owned ? 'rgba(123,214,106,0.12)' : pre && affordable ? 'rgba(255,226,122,0.08)' : 'rgba(0,0,0,0.18)';

  return (
    <div
      style={{
        border: `2px solid ${border}`, borderRadius: 10, background: bg,
        padding: '8px 10px', opacity: owned || pre ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
        <b style={{ color: owned ? '#bff58a' : '#fff3d8' }}>{node.name}</b>
        <span style={{ fontSize: 11, color: accent, whiteSpace: 'nowrap' }}>{node.cost} 🎣</span>
      </div>
      <div className="row-sub muted" style={{ marginTop: 2, whiteSpace: 'normal' }}>{node.desc}</div>
      <div style={{ marginTop: 6 }}>
        {owned ? (
          <span className="row-sub" style={{ color: '#bff58a' }}>✓ Unlocked</span>
        ) : !pre ? (
          <span className="row-sub muted">🔒 needs {node.requires.map((r) => FISH_NODE_BY_ID[r]?.name).join(' + ')}</span>
        ) : (
          <button
            className="btn sm"
            disabled={!affordable}
            onClick={() => bus.emit('ui:unlockFishNode', node.id)}
            style={{ width: '100%', opacity: affordable ? 1 : 0.6, cursor: affordable ? 'pointer' : 'not-allowed' }}
          >
            {affordable ? `Unlock · ${node.cost} 🎣` : `Need ${node.cost} pts`}
          </button>
        )}
      </div>
    </div>
  );
}

export function FishTreePanel({ onClose }: { onClose: () => void }) {
  const { fishTree } = useGameState();
  const unlocked = new Set(fishTree?.unlocked ?? []);
  const earned = fishTree?.pts ?? 0;
  const avail = availablePoints(earned, unlocked);
  const capstone = FISH_TREE.find((n) => n.branch === 'capstone');

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>🎣 Angler's Tree</h3>
        <span className="muted">spend fishing points · earn them by catching fish</span>
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '2px 2px 10px', flexWrap: 'wrap' }}>
        <span className="badge" style={{ fontSize: 14 }}>
          <b style={{ color: '#7bd0ff' }}>{avail}</b>&nbsp;point{avail === 1 ? '' : 's'} to spend
        </span>
        <span className="muted" style={{ fontSize: 11 }}>{spentPoints(unlocked)} spent · {earned} earned</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, alignItems: 'start' }}>
        {FISH_BRANCHES.map((b) => (
          <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ textAlign: 'center', marginBottom: 2 }}>
              <div style={{ color: b.color, fontWeight: 700 }}>{b.name}</div>
              <div className="row-sub muted" style={{ fontSize: 10 }}>{b.blurb}</div>
            </div>
            {FISH_TREE.filter((n) => n.branch === b.id)
              .sort((a, c) => a.tier - c.tier)
              .map((n, i) => (
                <Fragment key={n.id}>
                  {i > 0 && <div style={{ alignSelf: 'center', color: '#6b5b43', height: 8, lineHeight: '8px' }}>┃</div>}
                  <NodeCard node={n} unlocked={unlocked} available={avail} />
                </Fragment>
              ))}
          </div>
        ))}
      </div>

      {capstone && (
        <>
          <div style={{ textAlign: 'center', color: '#6b5b43', margin: '4px 0' }}>┃</div>
          <NodeCard node={capstone} unlocked={unlocked} available={avail} />
        </>
      )}
    </div>
  );
}
