import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './constants';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';

// Creates the Phaser game and mounts it into the given DOM element.
export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    backgroundColor: '#3b7a3a',
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [BootScene, FarmScene],
  });
}
