import {
  RARITY,
  QUALITY,
  cropValue,
  PLANT_BY_ID,
  MUTATION_BY_ID,
  isTokenTradeable,
  claimUsdFor,
  type Quality,
} from '../game/economy';
import { FISH_BY_ID, fishCss } from '../game/fishing';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';
import { CropIcon } from './CropIcon';
import { Tooltip, StackTipBody, makeStackStats } from './Tooltip';
import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getWalletAuth } from '../chain/walletAuth';
import { redeemPlant } from '../chain/redeem';
import { formatAmount } from '../chain/rewards';

// Quality stars rendered next to a crop's name (e.g. ★★ for gold). The glyph is
// repeated `stars` times and tinted with the quality's colour. `none` shows
// nothing. Sized to sit alongside the rarity/mutation text in the row.
function QualityStars({ quality }: { quality: Quality }) {
  if (quality === 'none') return null;
  const q = QUALITY[quality];
  return (
    <span className="qstars" style={{ color: q.css }} title={`${q.label} quality`}>
      {'★'.repeat(q.stars)}
    </span>
  );
}

// One bag row, discriminated on `kind`: a harvested crop (full tooltip/quality)
// or a caught fish (`fish|<id>` key — sold by species value, no crop fields).
type CropRow = {
  kind: 'crop';
  k: string;
  plant: NonNullable<ReturnType<typeof plantOf>>;
  mutation: ReturnType<typeof mutationOf>;
  wet: boolean;
  quality: Quality;
  withered: boolean;
  count: number;
  unit: number;
};
type FishRow = {
  kind: 'fish';
  k: string;
  name: string;
  css: string;
  count: number;
  unit: number;
};
const plantOf = (id: string) => PLANT_BY_ID[id];
const mutationOf = (id: string) => MUTATION_BY_ID[id];

export function BagPanel({ onClose }: { onClose: () => void }) {
  const { harvest, progress } = useGameState();
  const { publicKey, signMessage, connected } = useWallet();
  // Guards against a double-click firing two /api/redeem calls for the same
  // stack (which would double-credit). Holds the in-flight stack key, or null.
  const [redeemingKey, setRedeemingKey] = useState<string | null>(null);

  // Trade a bag stack of a top-tier crop for real $LANDS (credited to claimable,
  // withdrawn via the reward widget). The server pays a flat USD value per tier
  // from the `plantId`; `key` is the stack we remove locally AFTER the credit
  // lands. `count` is the whole stack.
  const redeem = useCallback(
    async (key: string, plantId: string, mutationId: string, count: number, name: string) => {
      if (redeemingKey) return;
      if (!connected || !publicKey || !signMessage) {
        bus.emit('toast', 'Connect your wallet to trade for $LANDS');
        return;
      }
      if (
        !window.confirm(
          `Trade ${count}× ${name} for $LANDS?\n\nThe crop is converted to $LANDS and added to your claimable balance — withdraw it from the reward widget.`,
        )
      ) {
        return;
      }
      setRedeemingKey(key);
      try {
        const session = await getWalletAuth(publicKey, signMessage);
        if (!session) {
          bus.emit('toast', 'Wallet signature needed to trade');
          return;
        }
        bus.emit('toast', '🌱 Trading…');
        const result = await redeemPlant(session, plantId, mutationId, count);
        if (!result) {
          bus.emit('toast', 'Trade failed — try again');
          return;
        }
        if (!result.credited || result.credited === '0') {
          bus.emit('toast', "Can't trade right now (daily limit reached or not enabled yet)");
          return;
        }
        bus.emit('ui:redeemStack', { key, count });
        bus.emit(
          'toast',
          `✓ Traded for ${formatAmount(result.credited, result.decimals)} ${result.symbol} — claim it from the reward widget`,
        );
      } finally {
        setRedeemingKey(null);
      }
    },
    [connected, publicKey, signMessage, redeemingKey],
  );

  let total = 0;
  const rows: Array<CropRow | FishRow> = [];
  for (const k of Object.keys(harvest)) {
    const count = harvest[k];
    // Caught fish ride in the harvest inventory as `fish|<id>` stacks. They're
    // NOT crops, so branch BEFORE the crop parse (PLANT_BY_ID has no fish ids).
    if (k.startsWith('fish|')) {
      const fish = FISH_BY_ID[k.slice(5)];
      if (!fish) continue; // unknown id: skip rather than crash
      total += fish.value * count;
      rows.push({ kind: 'fish', k, name: fish.name, css: fishCss(fish), count, unit: fish.value });
      continue;
    }
    // Tolerant parse: legacy keys have 3-4 parts; new keys carry quality +
    // withered as the 4th/5th segment.
    const [plantId, mutId, wet, q = 'none', wth = '0'] = k.split('|');
    const plant = PLANT_BY_ID[plantId];
    const mutation = MUTATION_BY_ID[mutId];
    const isWet = wet === '1';
    const quality = q as Quality;
    const withered = wth === '1';
    const unit = cropValue(plant, mutation, isWet, quality, withered);
    // Divine+ crops aren't coin-sellable, so they don't count toward "Sell all".
    if (!isTokenTradeable(plant)) total += unit * count;
    rows.push({ kind: 'crop', k, plant, mutation, wet: isWet, quality, withered, count, unit });
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>🎒 Harvest</h3>
        {rows.length > 0 && (
          <button className="btn sm gold" onClick={() => bus.emit('ui:sellAll', undefined)}>
            Sell all (+{total.toLocaleString()}🪙)
          </button>
        )}
        <button className="x" onClick={onClose}><img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" /></button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">Nothing harvested yet. Plant a seed, water it, and wait for it to grow!</p>
      ) : (
        <div className="rows">
          {rows.map((row) => {
            if (row.kind === 'fish') {
              return (
                <div className="row" key={row.k} style={{ borderLeftColor: row.css }}>
                  <span className="dot" style={{ background: row.css, color: row.css }} />
                  <span className="fish-ico" role="img" aria-label="🐟" style={{ fontSize: 18, width: 24, textAlign: 'center' }}>🐟</span>
                  <span className="row-name">
                    {row.name}
                    <span className="rarity-line">
                      <span className="mut" style={{ color: row.css }}>Fish</span>
                    </span>
                  </span>
                  <span className="row-meta">{row.unit.toLocaleString()}🪙 ea</span>
                  <span className="stock">×{row.count}</span>
                  <button className="btn sm" onClick={() => bus.emit('ui:sellStack', row.k)}>Sell</button>
                </div>
              );
            }
            const { k, plant, mutation, wet, quality, withered, count, unit } = row;
            const r = RARITY[plant.rarity];
            return (
              <div className="row" key={k} style={{ borderLeftColor: r.css }}>
                <span className="dot" style={{ background: r.css, color: r.css }} />
                <Tooltip
                  content={
                    <StackTipBody
                      stats={makeStackStats(plant, mutation, wet, count, unit, progress, quality, withered)}
                    />
                  }
                >
                  <CropIcon id={plant.id} />
                  <span className="row-name">
                    {plant.name}
                    <QualityStars quality={quality} />
                    <span className="rarity-line">
                      {mutation.id !== 'normal' && (
                        <span className="mut" style={{ color: mutation.css }}>{mutation.name}</span>
                      )}
                      {wet && <span className="mut wet">Wet</span>}
                      {withered && <span className="mut wilted">Wilted</span>}
                    </span>
                  </span>
                  <span className="row-meta">{unit.toLocaleString()}🪙 ea</span>
                </Tooltip>
                <span className="stock">×{count}</span>
                {/* Divine+ crops are $LANDS-only — no coin "Sell" button for them. */}
                {!isTokenTradeable(plant) && (
                  <button className="btn sm" onClick={() => bus.emit('ui:sellStack', k)}>Sell</button>
                )}
                {isTokenTradeable(plant) && (
                  <button
                    className="btn sm gold"
                    disabled={redeemingKey !== null}
                    title={`Trade this ${mutation.id !== 'normal' ? `${mutation.name} ` : ''}${plant.rarity} crop for ~$${+(claimUsdFor(plant, mutation.id) ?? 0).toFixed(2)} of $LANDS (can't be sold for coins)`}
                    onClick={() => redeem(k, plant.id, mutation.id, count, plant.name)}
                  >
                    🌱 ~${+(claimUsdFor(plant, mutation.id) ?? 0).toFixed(2)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
