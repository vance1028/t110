import { Game } from './game';

const container = document.getElementById('game');

if (container) {
  const game = new Game(container);
  (window as any).game = game;
}
