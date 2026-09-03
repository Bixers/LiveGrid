export type PlayerState = 'idle' | 'loading' | 'playing' | 'stalled' | 'error';
type PlayerStateHandler = (state: PlayerState, detail?: string) => void;

interface HlsEngine {
  attachMedia(video: HTMLMediaElement): void;
  destroy(): void;
  loadSource(url: string): void;
  on(event: string, callback: (_event: string, data: { details?: string; fatal?: boolean }) => void): void;
}

interface FlvEngine {
  attachMediaElement(video: HTMLMediaElement): void;
  destroy(): void;
  detachMediaElement(): void;
  load(): void;
  on(event: string, callback: (type: string, detail: string) => void): void;
  play(): Promise<void> | void;
  unload(): void;
}

export class StreamPlayer {
  private hls: HlsEngine | null = null;
  private flv: FlvEngine | null = null;
  private currentUrl = '';
  private pendingUrl = '';
  private forceNextChange = false;
  private generation = 0;
  private stallTimer: number | null = null;
  private lastTime = 0;
  private stalledTicks = 0;
  private readonly listeners: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onState: PlayerStateHandler,
  ) {
    this.bind('loadstart', () => this.onState('loading'));
    this.bind('playing', () => {
      this.stalledTicks = 0;
      this.onState('playing');
    });
    this.bind('waiting', () => this.onState('stalled', '正在等待数据'));
    this.bind('stalled', () => this.onState('stalled', '数据暂时中断'));
    this.bind('error', () => this.handlePlaybackFailure(this.mediaErrorText()));
    this.bind('ended', () => this.handlePlaybackFailure('直播流已结束'));
  }

  load(url: string): void {
    if (!url) {
      this.unload();
      this.onState('idle');
      return;
    }
    if (url === this.currentUrl && !this.video.error) return;

    if (this.forceNextChange && url !== this.currentUrl) {
      this.forceNextChange = false;
      this.switchTo(url);
      return;
    }

    if (this.currentUrl && this.isHealthy()) {
      this.pendingUrl = url;
      this.startStallWatch();
      return;
    }

    this.switchTo(url);
  }

  expectNextUrl(): void {
    this.forceNextChange = true;
  }

  private switchTo(url: string): void {
    this.stopStallWatch();

    const generation = ++this.generation;
    this.destroyEngine();
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.currentUrl = url;
    this.pendingUrl = '';
    this.onState('loading');

    if (/\.m3u8(?:$|\?)/i.test(url)) {
      if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
        this.video.src = url;
        void this.video.play().catch(() => undefined);
        return;
      }
      void this.loadHls(url, generation);
      return;
    }

    if (/\.flv(?:$|\?)/i.test(url)) {
      void this.loadFlv(url, generation);
      return;
    }

    this.video.src = url;
    void this.video.play().catch(() => undefined);
  }

  setMuted(muted: boolean): void {
    this.video.muted = muted;
  }

  unload(): void {
    if (!this.currentUrl && !this.pendingUrl && !this.hls && !this.flv && !this.video.getAttribute('src')) {
      this.onState('idle');
      return;
    }
    this.generation += 1;
    this.stopStallWatch();
    this.destroyEngine();
    this.currentUrl = '';
    this.pendingUrl = '';
    this.forceNextChange = false;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  destroy(): void {
    this.unload();
    this.listeners.forEach(([event, listener]) => this.video.removeEventListener(event, listener));
    this.listeners.length = 0;
  }

  private bind(event: keyof HTMLMediaElementEventMap, handler: EventListener): void {
    this.video.addEventListener(event, handler);
    this.listeners.push([event, handler]);
  }

  private async loadHls(url: string, generation: number): Promise<void> {
    const { default: Hls } = await import('hls.js');
    if (!this.isCurrent(url, generation)) return;
    if (!Hls.isSupported()) {
      this.onState('error', '当前环境不支持 HLS 播放');
      return;
    }

    this.hls = new Hls();
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && this.isCurrent(url, generation)) {
        this.handlePlaybackFailure(data.details || 'HLS 播放失败');
      }
    });
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (this.isCurrent(url, generation)) void this.video.play().catch(() => undefined);
    });
    this.hls.loadSource(url);
    this.hls.attachMedia(this.video);
  }

  private async loadFlv(url: string, generation: number): Promise<void> {
    const { default: mpegts } = await import('mpegts.js');
    if (!this.isCurrent(url, generation)) return;
    if (!mpegts.isSupported()) {
      this.onState('error', '当前环境不支持 FLV 播放');
      return;
    }

    this.flv = mpegts.createPlayer(
      { type: 'flv', url, isLive: true },
    );
    this.flv.on(mpegts.Events.ERROR, (_type, detail) => {
      if (this.isCurrent(url, generation)) {
        this.handlePlaybackFailure(String(detail || 'FLV 播放失败'));
      }
    });
    this.flv.attachMediaElement(this.video);
    this.flv.load();
    void Promise.resolve(this.flv.play()).catch(() => undefined);
  }

  private isCurrent(url: string, generation: number): boolean {
    return this.currentUrl === url && this.generation === generation;
  }

  private isHealthy(): boolean {
    return Boolean(
      this.currentUrl
      && !this.video.error
      && !this.video.ended
      && !this.video.paused
      && this.video.currentTime > 0
      && this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
    );
  }

  private handlePlaybackFailure(detail: string): void {
    if (!this.currentUrl) return;
    if (this.pendingUrl && this.pendingUrl !== this.currentUrl) {
      this.switchTo(this.pendingUrl);
      return;
    }
    this.onState('error', detail);
  }

  private startStallWatch(): void {
    if (this.stallTimer !== null || !this.pendingUrl) return;
    this.lastTime = this.video.currentTime;
    this.stalledTicks = 0;
    this.stallTimer = window.setInterval(() => {
      if (!this.pendingUrl) {
        this.stopStallWatch();
        return;
      }
      if (document.hidden) {
        this.lastTime = this.video.currentTime;
        this.stalledTicks = 0;
        return;
      }
      if (this.video.error || this.video.ended) {
        this.switchTo(this.pendingUrl);
        return;
      }
      if (this.video.paused || this.video.seeking) {
        this.lastTime = this.video.currentTime;
        this.stalledTicks = 0;
        return;
      }
      if (this.video.currentTime === this.lastTime) this.stalledTicks += 1;
      else this.stalledTicks = 0;
      this.lastTime = this.video.currentTime;
      if (this.stalledTicks >= 6) this.switchTo(this.pendingUrl);
    }, 2000);
  }

  private stopStallWatch(): void {
    if (this.stallTimer !== null) window.clearInterval(this.stallTimer);
    this.stallTimer = null;
    this.stalledTicks = 0;
  }

  private destroyEngine(): void {
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.flv) {
      try {
        this.flv.unload();
        this.flv.detachMediaElement();
        this.flv.destroy();
      } catch {
        // The engine may already be detached after a media error.
      }
      this.flv = null;
    }
  }

  private mediaErrorText(): string {
    switch (this.video.error?.code) {
      case 1:
        return '播放已中止';
      case 2:
        return '直播流网络错误';
      case 3:
        return '直播流解码失败';
      case 4:
        return '直播流格式不受支持';
      default:
        return '播放器发生错误';
    }
  }
}
