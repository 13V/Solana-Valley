import { useEffect, useRef, useState } from 'react';
import { WalletProvider } from '../chain/WalletProvider';
import { createGame } from '../game/createGame';
import { Hud, type Panel } from './Hud';
import { Hotbar } from './Hotbar';
import { Shop } from './Shop';
import { SeedsPanel } from './SeedsPanel';
import { BagPanel } from './BagPanel';
import { AnimalsPanel } from './AnimalsPanel';
import { UpgradesPanel } from './UpgradesPanel';
import { SkillsPanel } from './SkillsPanel';
import { AlmanacPanel } from './AlmanacPanel';
import { HelpPanel } from './HelpPanel';
import { SettingsPanel } from './SettingsPanel';
import { GoalsHud } from './GoalsHud';
import { TutorialCoach } from './TutorialCoach';
import { Toasts } from './Toasts';
import './settings'; // self-applies saved accessibility/volume settings on load

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

  // Enable the Sprout Lands premium UI skin only if its assets are present
  // (they're git-ignored), so the UI degrades to the default theme otherwise.
  useEffect(() => {
    const img = new Image();
    img.onload = () => document.documentElement.classList.add('ui-skin');
    img.src = 'assets/sprout-ui/ui_panel.png';
  }, []);

  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p));
  const close = () => setPanel(null);
  const closeHelp = () => {
    localStorage.setItem(HELP_SEEN_KEY, '1');
    setPanel(null);
  };

  return (
    <WalletProvider>
      <div className="app">
        <div ref={containerRef} className="game-root" />
        <div className="overlay">
          <Hud panel={panel} onToggle={toggle} />
          {panel === 'shop' && <Shop onClose={close} />}
          {panel === 'seeds' && <SeedsPanel onClose={close} />}
          {panel === 'bag' && <BagPanel onClose={close} />}
          {panel === 'animals' && <AnimalsPanel onClose={close} />}
          {panel === 'upgrades' && <UpgradesPanel onClose={close} />}
          {panel === 'skills' && <SkillsPanel onClose={close} />}
          {panel === 'almanac' && <AlmanacPanel onClose={close} />}
          {panel === 'help' && <HelpPanel onClose={closeHelp} />}
          {panel === 'settings' && <SettingsPanel onClose={close} />}
          <GoalsHud />
          <Hotbar />
          <TutorialCoach />
          <Toasts />
        </div>
      </div>
    </WalletProvider>
  );
}
