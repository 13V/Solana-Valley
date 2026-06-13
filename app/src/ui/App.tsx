import { useEffect, useRef, useState } from 'react';
import { WalletProvider } from '../chain/WalletProvider';
import { createGame } from '../game/createGame';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants';
import { Hud } from './Hud';
import { Hotbar } from './Hotbar';
import { Shop } from './Shop';
import { Toasts } from './Toasts';

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;
    gameRef.current = createGame(containerRef.current);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <WalletProvider>
      <div className="app" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
        <div ref={containerRef} className="game-root" />
        <div className="overlay">
          <Hud shopOpen={shopOpen} onToggleShop={() => setShopOpen((o) => !o)} />
          <Shop open={shopOpen} onClose={() => setShopOpen(false)} />
          <Hotbar />
          <Toasts />
        </div>
      </div>
    </WalletProvider>
  );
}
