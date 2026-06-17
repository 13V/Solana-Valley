import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { getUsername, setUsername, sanitizeUsername } from '../chain/username';
import './username.css';

// Short, human-friendly label for a wallet (first 4 + last 4 base58 chars).
// Mirrors shortWallet() in app/api/join.ts so the prefilled default matches the
// fallback name the server would otherwise assign.
function shortWallet(wallet: string): string {
  if (wallet.length <= 9) return wallet;
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

// One-time, per-wallet "choose your name" modal. Shown when a wallet is
// connected AND it has no stored username yet; renders nothing otherwise. The
// chosen (or skipped-default) name binds to the wallet via setUsername, so it
// never re-prompts for that wallet, and MultiplayerSync picks it up reactively
// (useUsername) to set the player's multiplayer avatar label. Best-effort: it
// never blocks wallet connect or gameplay.
export function UsernamePrompt() {
  const { publicKey, connected } = useWallet();
  const wallet = connected && publicKey ? publicKey.toBase58() : null;
  const short = wallet ? shortWallet(wallet) : '';

  // Whether THIS wallet still needs to choose. Re-checked whenever the wallet
  // changes; a choice (confirm/skip) flips it false so the modal closes.
  const [needsName, setNeedsName] = useState(false);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!wallet) {
      setNeedsName(false);
      return;
    }
    const has = getUsername(wallet) !== null;
    setNeedsName(!has);
    if (!has) setValue(short); // prefill with the short-wallet default
  }, [wallet, short]);

  if (!wallet || !needsName) return null;

  const confirm = () => {
    // Fall back to the short label if the input sanitizes to nothing.
    setUsername(wallet, sanitizeUsername(value) || short);
    setNeedsName(false);
  };
  const skip = () => {
    // Storing the default counts as a choice, so we won't re-prompt this wallet.
    setUsername(wallet, short);
    setNeedsName(false);
  };

  return (
    <div className="username-backdrop">
      <div className="panel username-panel">
        <div className="panel-head">
          <h3>🌱 Choose your name</h3>
        </div>
        <div className="username-body">
          <p className="muted">
            This is the name other farmers see above your character. You can keep
            your wallet's short name or pick your own.
          </p>
          <input
            className="username-input"
            type="text"
            value={value}
            maxLength={16}
            autoFocus
            placeholder={short}
            aria-label="Your name"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirm();
            }}
          />
          <div className="username-actions">
            <button className="btn" onClick={skip}>
              Skip
            </button>
            <button className="btn gold" onClick={confirm}>
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
