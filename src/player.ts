export type PlayerState = 'idle' | 'loading' | 'playing' | 'stalled' | 'error';
type PlayerStateHandler = (state: PlayerState, detail?: string) => void;

export interface NativePlayerEvent {
  event?: string;
  roomId?: string;
  state?: string;
  detail?: string;
  type?: string;
  text?: string;
  sender?: string;
  color?: string;
  giftId?: string;
  giftCount?: string | number;
  time?: number;
  endpoint?: number;
}

interface NativePlayerBridge {
  command(value: Record<string, unknown>): void;
  onEvent(callback: (value: NativePlayerEvent) => void): () => void;
}

declare global {
  interface Window {
    liveGridNativePlayer?: NativePlayerBridge;
  }
}

const bridge = window.liveGridNativePlayer;
const eventListeners = new Set<(event: NativePlayerEvent) => void>();
const roomPlayers = new Map<string, StreamPlayer>();

function streamIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url.split('?', 1)[0] ?? url;
  }
}

bridge?.onEvent((event) => {
  const roomId = String(event.roomId ?? '');
  if (event.event === 'player-state' && roomId) {
    roomPlayers.get(roomId)?.receiveState(event);
  } else if (event.event === 'host-error') {
    roomPlayers.forEach((player) => player.receiveHostError(event.detail ?? 'libmpv 播放组件不可用'));
  }
  eventListeners.forEach((listener) => listener(event));
});

export function subscribeNativePlayerEvents(listener: (event: NativePlayerEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

function send(value: Record<string, unknown>): void {
  bridge?.command(value);
}

export class StreamPlayer {
  private currentUrl = '';
  private forceNextChange = false;
  private paused = false;
  private muted = true;
  private volume = 1;
  private surfaceVisible = false;
  private destroyed = false;
  private nativeState: PlayerState = 'idle';
  private boundsFrame: number | null = null;
  private lastBounds = '';
  private readonly resizeObserver: ResizeObserver;
  private readonly syncBoundListener = () => this.scheduleBounds();

  constructor(
    private readonly roomId: string,
    private readonly surface: HTMLElement,
    private readonly onState: PlayerStateHandler,
  ) {
    roomPlayers.set(roomId, this);
    surface.dataset.playerEngine = 'libmpv';
    this.resizeObserver = new ResizeObserver(() => this.scheduleBounds());
    this.resizeObserver.observe(surface);
    window.addEventListener('resize', this.syncBoundListener);
    window.addEventListener('scroll', this.syncBoundListener, true);
    send({ op: 'create', roomId });
    this.scheduleBounds();
  }

  load(url: string): void {
    if (this.destroyed) return;
    if (!url) {
      this.unload();
      this.onState('idle');
      return;
    }
    const sameStream = this.currentUrl && streamIdentity(url) === streamIdentity(this.currentUrl);
    const recoveringWithFreshUrl = (this.nativeState === 'stalled' || this.nativeState === 'error')
      && url !== this.currentUrl;
    if (sameStream && !recoveringWithFreshUrl && !this.forceNextChange) return;
    this.currentUrl = url;
    this.forceNextChange = false;
    this.paused = false;
    this.onState('loading');
    send({ op: 'load', roomId: this.roomId, url });
  }

  expectNextUrl(): void {
    this.forceNextChange = true;
  }

  setPaused(paused: boolean): void {
    if (this.destroyed || !this.currentUrl) return;
    this.paused = paused;
    send({ op: 'pause', roomId: this.roomId, value: paused });
  }

  isPaused(): boolean {
    return this.paused;
  }

  setMuted(muted: boolean): void {
    if (this.destroyed) return;
    this.muted = muted;
    send({ op: 'mute', roomId: this.roomId, value: muted });
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(volume: number): void {
    if (this.destroyed) return;
    this.volume = Math.min(1, Math.max(0, volume));
    send({ op: 'volume', roomId: this.roomId, value: Math.round(this.volume * 100) });
  }

  setSurfaceVisible(visible: boolean): void {
    if (this.surfaceVisible === visible) return;
    this.surfaceVisible = visible;
    this.scheduleBounds();
  }

  setDanmakuVisible(visible: boolean): void {
    if (!this.destroyed) send({ op: 'danmaku-visible', roomId: this.roomId, value: visible });
  }

  setDanmakuSettings(opacity: number, fontSize: number, area: string): void {
    if (!this.destroyed) {
      send({ op: 'danmaku-settings', roomId: this.roomId, opacity, fontSize, area });
    }
  }

  bringToFront(): void {
    if (!this.destroyed) send({ op: 'front', roomId: this.roomId });
  }

  unload(): void {
    if (this.destroyed || (!this.currentUrl && !this.forceNextChange)) return;
    this.currentUrl = '';
    this.nativeState = 'idle';
    this.forceNextChange = false;
    this.paused = false;
    this.surfaceVisible = false;
    send({ op: 'unload', roomId: this.roomId });
    this.scheduleBounds();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.currentUrl = '';
    this.surfaceVisible = false;
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.syncBoundListener);
    window.removeEventListener('scroll', this.syncBoundListener, true);
    if (this.boundsFrame !== null) cancelAnimationFrame(this.boundsFrame);
    this.boundsFrame = null;
    roomPlayers.delete(this.roomId);
    send({ op: 'destroy', roomId: this.roomId });
  }

  receiveState(event: NativePlayerEvent): void {
    if (this.destroyed) return;
    const state = event.state;
    if (state !== 'idle' && state !== 'loading' && state !== 'playing'
      && state !== 'stalled' && state !== 'error') return;
    this.nativeState = state;
    if (state === 'playing') this.paused = false;
    this.onState(state, event.detail ?? '');
  }

  receiveHostError(detail: string): void {
    if (!this.destroyed && this.currentUrl) this.onState('error', detail);
  }

  private scheduleBounds(): void {
    if (this.destroyed || this.boundsFrame !== null) return;
    this.boundsFrame = requestAnimationFrame(() => {
      this.boundsFrame = null;
      this.syncBounds();
    });
  }

  private syncBounds(): void {
    if (this.destroyed) return;
    const rect = this.surface.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const visible = this.surfaceVisible
      && this.surface.isConnected
      && rect.width > 1
      && rect.height > 1
      && rect.right > 0
      && rect.bottom > 0
      && rect.left < window.innerWidth
      && rect.top < window.innerHeight;
    const bounds = {
      op: 'bounds',
      roomId: this.roomId,
      x: Math.round(rect.left * scale),
      y: Math.round(rect.top * scale),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
      visible,
    };
    const serialized = JSON.stringify(bounds);
    if (serialized === this.lastBounds) return;
    this.lastBounds = serialized;
    send(bounds);
  }
}
