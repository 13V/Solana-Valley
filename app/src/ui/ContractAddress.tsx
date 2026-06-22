import { useState } from 'react';

// The reward token's contract address, shown bottom-right so players can copy it.
// Env-driven so swapping to a new token is config-only (set VITE_TOKEN_CA at
// build time); falls back to the original $SPROUT mint if unset. If set to an
// empty string the pill hides itself (e.g. before the new token launches).
const CA = import.meta.env.VITE_TOKEN_CA ?? '3sPxGyKxwCrAebxZsFb56GsNd7mjK7jZAng5uJtPpump';

export function ContractAddress() {
  const [copied, setCopied] = useState(false);
  if (!CA) return null;

  const copy = () => {
    try {
      const p = navigator.clipboard?.writeText(CA);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // clipboard unavailable — still flash feedback
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const short = `${CA.slice(0, 4)}…${CA.slice(-4)}`;

  return (
    <button className="ca-pill" onClick={copy} title={`Copy contract address\n${CA}`}>
      {copied ? '✓ Copied!' : (
        <>
          <span className="ca-label">CA</span>
          <span className="ca-addr">{short}</span>
          <span className="ca-copy" aria-hidden="true">⧉</span>
        </>
      )}
    </button>
  );
}
