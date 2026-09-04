import type {
  Quality,
  RoomTrendResponse,
  ServiceStatus,
  StatsResponse,
  StreamResponse,
  StreamRoom,
} from './types';

let lastLatency = 0;

class TaskQueue {
  private active = 0;
  private readonly pending: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        this.active += 1;
        void task().then(resolve, reject).finally(() => {
          this.active -= 1;
          this.pending.shift()?.();
        });
      };
      if (this.active < this.concurrency) start();
      else this.pending.push(start);
    });
  }
}

// Adding, refreshing, and changing quality all make the backend resolve a stream URL.
const streamResolveQueue = new TaskQueue(2);

function withCacheBust(path: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}t=${Date.now()}`;
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const startedAt = performance.now();
  const response = await fetch(withCacheBust(path), {
    cache: 'no-store',
    signal,
  });
  lastLatency = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    throw new Error(`本地服务返回 ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestWithoutBody(path: string): Promise<void> {
  const startedAt = performance.now();
  const response = await fetch(withCacheBust(path), { cache: 'no-store' });
  lastLatency = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    throw new Error(`本地服务返回 ${response.status}`);
  }
}

function normalizeQuality(value: string | undefined): Quality {
  return value === 'UHD' || value === 'HD' || value === 'SD' ? value : 'OD';
}

export async function getStreams(signal?: AbortSignal): Promise<StreamRoom[]> {
  const payload = await request<StreamResponse>('/streams.json', signal);
  return (payload.rooms ?? []).map((item) => ({
    room: String(item.room ?? ''),
    name: item.name?.trim() ?? '',
    ok: Boolean(item.ok),
    loop: Boolean(item.loop),
    url: item.url ?? '',
    showTime: Number(item.show_time ?? 0),
    quality: normalizeQuality(item.quality),
    error: item.err?.trim() ?? '',
  })).filter((item) => item.room.length > 0);
}

export function getServiceStatus(signal?: AbortSignal): Promise<ServiceStatus> {
  return request<ServiceStatus>('/status', signal);
}

export function getStats(signal?: AbortSignal): Promise<StatsResponse> {
  return request<StatsResponse>('/api/stats', signal);
}

export function getRoomTrend(room: string, signal?: AbortSignal): Promise<RoomTrendResponse> {
  return request<RoomTrendResponse>(`/api/room/${encodeURIComponent(room)}/trend`, signal);
}

export async function addRoom(room: string): Promise<void> {
  await streamResolveQueue.run(() => requestWithoutBody(`/add?room=${encodeURIComponent(room)}`));
}

export async function removeRoom(room: string): Promise<void> {
  await requestWithoutBody(`/remove?room=${encodeURIComponent(room)}`);
}

export async function refreshStreams(): Promise<void> {
  await streamResolveQueue.run(() => requestWithoutBody('/refresh'));
}

export async function setRoomQuality(room: string, quality: Quality): Promise<void> {
  const result = await streamResolveQueue.run(() => request<{ ok?: boolean }>(
    `/quality?room=${encodeURIComponent(room)}&q=${encodeURIComponent(quality)}`,
  ));
  if (result.ok === false) {
    throw new Error('本地服务未接受清晰度设置');
  }
}

export function getLastLatency(): number {
  return lastLatency;
}
