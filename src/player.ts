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
  private generation = 0;
  private readonly listeners: Array<[keyof HTMLMediaElementEventMap, EventListener]> = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly onState: PlayerStateHandler,
  ) {
    this.bind('loadstart', () => this.onState('loading'));
    this.bind('playing', () => this.onState('playing'));
    this.bind('waiting', () => this.onState('stalled', '正在等待数据'));
    this.bind('stalled', () => this.onState('stalled', '数据暂时中断'));
    this.bind('error', () => this.onState('error', this.mediaErrorText()));
  }

  load(url: string): void {
    if (!url) {
      this.unload();
      this.onState('idle');
      return;
    }
    if (url === this.currentUrl && !this.video.error) return;

    const generation = ++this.generation;
    this.destroyEngine();
    this.currentUrl = url;
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
    this.generation += 1;
    this.destroyEngine();
    this.currentUrl = '';
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

    this.hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 30,
      liveSyncDurationCount: 2,
    });
    this.hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal && this.isCurrent(url, generation)) {
        this.onState('error', data.details || 'HLS 播放失败');
      }
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
      { enableWorker: true, enableStashBuffer: false, liveBufferLatencyChasing: true },
    );
    this.flv.on(mpegts.Events.ERROR, (_type, detail) => {
      if (this.isCurrent(url, generation)) {
        this.onState('error', String(detail || 'FLV 播放失败'));
      }
    });
    this.flv.attachMediaElement(this.video);
    this.flv.load();
    void Promise.resolve(this.flv.play()).catch(() => undefined);
  }

  private isCurrent(url: string, generation: number): boolean {
    return this.currentUrl === url && this.generation === generation;
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
