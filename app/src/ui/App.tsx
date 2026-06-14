import { useEffect, useRef, useState } from 'react';
import { WalletProvider } from '../chain/WalletProvider';
import { createGame } from '../game/createGame';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants';
import { Hud, type Panel } from './Hud';
import { Hotbar } from './Hotbar';
import { Shop } from './Shop';
import { SeedsPanel } from './SeedsPanel';
import { BagPanel } from './BagPanel';
import { UpgradesPanel } from './UpgradesPanel';
import { AlmanacPanel } from './AlmanacPanel';
import { HelpPanel } from './HelpPanel';
import { Toasts } from './Toasts';

const HELP_SEEN_KEY = 'solana-valley:seen-help';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  // Show the how-to-play panel automatically on a player's first visit.
  const [panel, setPanel] = useState<Panel>(() =>
    localStorage.getItem(HELP_SEEN_KEY) ? null : 'help',
  );

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = createGame(containerRef.current);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const close = () => setPanel(null);
  const closeHelp = () => {
    localStorage.setItem(HELP_SEEN_KEY, '1');
    setPanel(null);
  };

  return (
    <WalletProvider>
      <div className="app" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div ref={containerRef} className="game-root" />
        <div className="overlay">
          <Hud panel={panel} onToggle={toggle} />
          {panel === 'shop' && <Shop onClose={close} />}
          {panel === 'seeds' && <SeedsPanel onClose={close} />}
          {panel === 'bag' && <BagPanel onClose={close} />}
          {panel === 'upgrades' && <UpgradesPanel onClose={close} />}
          {panel === 'almanac' && <AlmanacPanel onClose={close} />}
          {panel === 'help' && <HelpPanel onClose={closeHelp} />}
          <Hotbar />
          <Toasts />
        </div>
      </div>
    </WalletProvider>
  );
}
