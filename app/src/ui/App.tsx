import { useEffect, useRef, useState } from 'react';
import { WalletProvider } from '../chain/WalletProvider';
import { createGame } from '../game/createGame';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants';
import { Hud, type Panel } from './Hud';
import { Hotbar } from './Hotbar';
import { Shop } from './Shop';
import { SeedsPanel } from './SeedsPanel';
import { BagPanel } from './BagPanel';
import { Toasts } from './Toasts';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

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

  return (
    <WalletProvider>
      <div className="app" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div ref={containerRef} className="game-root" />
        <div className="overlay">
          <Hud panel={panel} onToggle={toggle} />
          {panel === 'shop' && <Shop onClose={close} />}
          {panel === 'seeds' && <SeedsPanel onClose={close} />}
          {panel === 'bag' && <BagPanel onClose={close} />}
          <Hotbar />
          <Toasts />
        </div>
      </div>
    </WalletProvider>
  );
}
