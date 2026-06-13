import type { RacerState, GameState, KartEntry, DifficultyLevel } from '../types';
import { formatTime, formatLapTime } from '../race/raceManager';

export interface HUDData {
  speed: number;
  currentLap: number;
  totalLaps: number;
  lapTime: number;
  totalTime: number;
  bestLap: number | null;
  position: number;
  totalRacers: number;
  gameState: GameState;
  countdown: number;
  racers: RacerState[];
  kartEntries: KartEntry[];
  miniMapData: MiniMapData;
}

export interface MiniMapData {
  trackPoints: { x: number; y: number }[];
  kartPositions: { x: number; y: number; color: number; isPlayer: boolean }[];
  width: number;
  height: number;
}

export class HUD {
  private container: HTMLElement;
  private speedGauge: HTMLElement;
  private speedText: HTMLElement;
  private lapInfo: HTMLElement;
  private lapTime: HTMLElement;
  private totalTime: HTMLElement;
  private bestLap: HTMLElement;
  private positionDisplay: HTMLElement;
  private standingsPanel: HTMLElement;
  private countdown: HTMLElement;
  private miniMap: HTMLCanvasElement;
  private miniMapCtx: CanvasRenderingContext2D;
  private pauseScreen: HTMLElement;
  private resultsScreen: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'hud';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      font-family: 'Segoe UI', sans-serif;
      color: #fff;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
    `;

    this.speedGauge = document.createElement('div');
    this.speedGauge.style.cssText = `
      position: absolute;
      right: 24px;
      bottom: 24px;
      width: 160px;
      height: 160px;
    `;

    this.speedText = document.createElement('div');
    this.speedText.style.cssText = `
      position: absolute;
      right: 24px;
      bottom: 40px;
      width: 160px;
      text-align: center;
      font-size: 48px;
      font-weight: bold;
    `;
    this.speedText.textContent = '0';

    const speedUnit = document.createElement('div');
    speedUnit.style.cssText = `
      position: absolute;
      right: 24px;
      bottom: 20px;
      width: 160px;
      text-align: center;
      font-size: 14px;
      opacity: 0.7;
    `;
    speedUnit.textContent = 'KM/H';

    this.lapInfo = document.createElement('div');
    this.lapInfo.style.cssText = `
      position: absolute;
      left: 24px;
      top: 24px;
      font-size: 24px;
      font-weight: bold;
    `;

    this.lapTime = document.createElement('div');
    this.lapTime.style.cssText = `
      position: absolute;
      left: 24px;
      top: 60px;
      font-size: 20px;
      font-family: monospace;
    `;

    this.totalTime = document.createElement('div');
    this.totalTime.style.cssText = `
      position: absolute;
      left: 24px;
      top: 90px;
      font-size: 16px;
      font-family: monospace;
      opacity: 0.8;
    `;

    this.bestLap = document.createElement('div');
    this.bestLap.style.cssText = `
      position: absolute;
      left: 24px;
      top: 115px;
      font-size: 14px;
      font-family: monospace;
      color: #ffdd00;
    `;

    this.positionDisplay = document.createElement('div');
    this.positionDisplay.style.cssText = `
      position: absolute;
      right: 24px;
      top: 24px;
      font-size: 48px;
      font-weight: bold;
    `;

    this.standingsPanel = document.createElement('div');
    this.standingsPanel.style.cssText = `
      position: absolute;
      right: 24px;
      top: 80px;
      width: 180px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
    `;

    this.countdown = document.createElement('div');
    this.countdown.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 120px;
      font-weight: bold;
      text-shadow: 4px 4px 8px rgba(0,0,0,0.9);
      display: none;
    `;

    this.miniMap = document.createElement('canvas');
    this.miniMap.width = 200;
    this.miniMap.height = 200;
    this.miniMap.style.cssText = `
      position: absolute;
      right: 24px;
      bottom: 200px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 8px;
      border: 2px solid rgba(255,255,255,0.3);
    `;
    this.miniMapCtx = this.miniMap.getContext('2d')!;

    this.pauseScreen = document.createElement('div');
    this.pauseScreen.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      pointer-events: auto;
    `;

    const pauseTitle = document.createElement('div');
    pauseTitle.textContent = '暂停';
    pauseTitle.style.cssText = 'font-size: 48px; font-weight: bold; margin-bottom: 24px;';

    const pauseHint = document.createElement('div');
    pauseHint.textContent = '按 P 或 ESC 继续';
    pauseHint.style.cssText = 'font-size: 18px; opacity: 0.8;';

    this.pauseScreen.appendChild(pauseTitle);
    this.pauseScreen.appendChild(pauseHint);

    this.resultsScreen = document.createElement('div');
    this.resultsScreen.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: none;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      pointer-events: auto;
    `;

    this.container.appendChild(this.speedGauge);
    this.container.appendChild(this.speedText);
    this.container.appendChild(speedUnit);
    this.container.appendChild(this.lapInfo);
    this.container.appendChild(this.lapTime);
    this.container.appendChild(this.totalTime);
    this.container.appendChild(this.bestLap);
    this.container.appendChild(this.positionDisplay);
    this.container.appendChild(this.standingsPanel);
    this.container.appendChild(this.countdown);
    this.container.appendChild(this.miniMap);
    this.container.appendChild(this.pauseScreen);
    this.container.appendChild(this.resultsScreen);
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(data: HUDData): void {
    const speedKmh = Math.abs(data.speed) * 3.6;
    this.speedText.textContent = Math.round(speedKmh).toString();
    this.drawSpeedGauge(speedKmh);

    this.lapInfo.textContent = `第 ${Math.min(data.currentLap)} / ${data.totalLaps} 圈`;
    this.lapTime.textContent = `本圈: ${formatTime(data.lapTime)}`;
    this.totalTime.textContent = `总时间: ${formatTime(data.totalTime)}`;
    this.bestLap.textContent = data.bestLap !== null ? `最快: ${formatLapTime(data.bestLap)}` : '';

    this.positionDisplay.textContent = `${data.position} / ${data.totalRacers}`;

    this.updateStandings(data.racers, data.kartEntries);

    if (data.gameState === 'countdown') {
      this.countdown.style.display = 'block';
      const count = Math.ceil(data.countdown);
      this.countdown.textContent = count > 0 ? count.toString() : 'GO!';
      this.countdown.style.color = count <= 0 ? '#00ff00' : '#fff';
    } else {
      this.countdown.style.display = 'none';
    }

    this.pauseScreen.style.display = data.gameState === 'paused' ? 'flex' : 'none';

    this.drawMiniMap(data.miniMapData);
  }

  private drawSpeedGauge(speedKmh: number): void {
    const maxSpeed = 200;
    const percent = Math.min(speedKmh / maxSpeed, 1);
    const startAngle = -Math.PI * 0.75;
    const endAngle = startAngle + percent * Math.PI * 1.5;
    const cx = 80;
    const cy = 120;
    const r = 50;

    const startX = cx + r * Math.cos(startAngle);
    const startY = cy + r * Math.sin(startAngle);
    const endX = cx + r * Math.cos(endAngle);
    const endY = cy + r * Math.sin(endAngle);

    const largeArc = percent > 0.5 ? 1 : 0;

    let color = '#00ff00';
    if (percent > 0.7) color = '#ff6600';
    if (percent > 0.9) color = '#ff0000';

    this.speedGauge.innerHTML = `
      <svg width="160" height="160" viewBox="0 0 160 160">
        <path d="M ${startX},${startY} A ${r},${r} 0 1,1 ${cx + r * Math.cos(Math.PI * 0.75)},${cy + r * Math.sin(Math.PI * 0.75)}" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="8" stroke-linecap="round"/>
        <path d="M ${startX},${startY} A ${r},${r} 0 ${largeArc},1 ${endX},${endY}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round"/>
      </svg>
    `;
  }

  private updateStandings(racers: RacerState[], kartEntries: KartEntry[]): void {
    const sorted = [...racers].sort((a, b) => a.position - b.position);

    let html = '<div style="font-weight:bold;margin-bottom:8px;font-size:16px;">排名</div>';

    for (const racer of sorted) {
      const entry = kartEntries.find(k => k.id === racer.kartId);
      const name = entry?.name || `车手 ${racer.kartId}`;
      const color = entry ? `#${entry.color.toString(16).padStart(6, '0')}` : '#fff';
      const isPlayer = entry?.isPlayer;

      html += `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;${isPlayer ? 'color:#ffdd00;font-weight:bold;' : ''}">
          <span style="width:20px;">${racer.position}.</span>
          <span style="width:10px;height:10px;background:${color};border-radius:50%;"></span>
          <span style="flex:1;">${name}</span>
        </div>
      `;
    }

    this.standingsPanel.innerHTML = html;
  }

  private drawMiniMap(data: MiniMapData): void {
    const ctx = this.miniMapCtx;
    const w = this.miniMap.width;
    const h = this.miniMap.height;

    ctx.clearRect(0, 0, w, h);

    if (data.trackPoints.length < 2) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const p of data.trackPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const padding = 10;
    const scale = Math.min((w - padding * 2) / (maxX - minX), (h - padding * 2) / (maxY - minY));
    const offsetX = padding + (w - padding * 2 - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = padding + (h - padding * 2 - (maxY - minY) * scale) / 2 - minY * scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();

    for (let i = 0; i < data.trackPoints.length; i++) {
      const p = data.trackPoints[i];
      const x = p.x * scale + offsetX;
      const y = p.y * scale + offsetY;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    for (const kart of data.kartPositions) {
      const x = kart.x * scale + offsetX;
      const y = kart.y * scale + offsetY;

      ctx.beginPath();
      ctx.arc(x, y, kart.isPlayer ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = `#${kart.color.toString(16).padStart(6, '0')}`;
      ctx.fill();

      if (kart.isPlayer) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }

  public showResults(racers: RacerState[], kartEntries: KartEntry[], bestLap: number | null): void {
    const sorted = [...racers].sort((a, b) => a.position - b.position);

    let html = '<h1 style="font-size:48px;margin-bottom:24px;">比赛结束</h1>';

    if (bestLap !== null) {
      html += `<div style="margin-bottom:24px;font-size:20px;color:#ffdd00;">最快圈速: ${formatLapTime(bestLap)}</div>`;
    }

    html += '<div style="background:rgba(255,255,255,0.1);border-radius:8px;padding:20px;min-width:300px;">';

    for (const racer of sorted) {
      const entry = kartEntries.find(k => k.id === racer.kartId);
      const name = entry?.name || `车手 ${racer.kartId}`;
      const color = entry ? `#${entry.color.toString(16).padStart(6, '0')}` : '#fff';
      const isPlayer = entry?.isPlayer;

      html += `
        <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.1);${isPlayer ? 'color:#ffdd00;font-weight:bold;' : ''}">
        <span style="font-size:24px;width:40px;">${racer.position}</span>
        <span style="width:12px;height:12px;background:${color};border-radius:50%;"></span>
        <span style="flex:1;">${name}</span>
        <span style="font-family:monospace;">${racer.finishTime !== null ? formatTime(racer.finishTime) : '--'}</span>
      </div>
      `;
    }

    html += '</div>';
    html += '<div style="margin-top:24px;font-size:16px;opacity:0.7;">按 R 重新开始</div>';

    this.resultsScreen.innerHTML = html;
    this.resultsScreen.style.display = 'flex';
  }

  public hideResults(): void {
    this.resultsScreen.style.display = 'none';
  }
}
