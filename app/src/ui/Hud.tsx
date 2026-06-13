import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useSolBalance } from '../chain/useSolBalance';
import { useGameState } from './useGameState';
import { bus } from '../game/EventBus';

export function Hud({
  shopOpen,
  onToggleShop,
}: {
  shopOpen: boolean;
  onToggleShop: () => void;
}) {
  const { publicKey } = useWallet();
  const sol = useSolBalance();
  const { coins, day } = useGameState();

  const addr = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;

  return (
    <div className="hud">
      <div className="hud-left">
        <span className="badge">Day {day}</span>
        <span className="badge coins">🪙 {coins}</span>
        <button className="btn" onClick={() => bus.emit('ui:endDay', undefined)}>
          Sleep ▸ Next Day
        </button>
        <button className={`btn ${shopOpen ? 'active' : ''}`} onClick={onToggleShop}>
          Shop
        </button>
      </div>
      <div className="hud-right">
        {addr && (
          <span className="badge">
            {addr}
            {sol !== null ? ` · ${sol.toFixed(2)} SOL` : ''}
          </span>
        )}
        <WalletMultiButton />
      </div>
    </div>
  );
}
