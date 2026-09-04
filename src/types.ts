export type Quality = 'OD' | 'UHD' | 'HD' | 'SD';
export type LayoutMode = 'free' | 'auto' | '1' | '2' | '3' | '4' | 'focus';
export type DanmakuArea = 'top-quarter' | 'top-third' | 'top-half' | 'full' | 'bottom-half' | 'bottom-quarter';
export type GiftRevenueRange = 'today' | '7d' | 'session';
export type RoomFilter = 'all' | 'live' | 'offline';
export type AppView = 'monitor' | 'analytics';

export interface StreamRoom {
  room: string;
  name: string;
  ok: boolean;
  loop: boolean;
  url: string;
  showTime: number;
  quality: Quality;
  error: string;
}

export interface StreamResponse {
  updated?: string;
  rooms?: Array<{
    room?: string | number;
    name?: string;
    ok?: boolean;
    loop?: boolean;
    url?: string;
    show_time?: number;
    quality?: Quality;
    err?: string;
  }>;
}

export interface ServiceStatus {
  service?: string;
  douyu?: boolean;
  [key: string]: unknown;
}

export interface StatsRoom {
  rid: string;
  name?: string;
  live?: boolean;
  hot?: number;
  fans?: number;
  giftTotal?: number;
  giftPaid?: number;
  giftUV?: number;
  chatUV?: number;
  activeUV?: number;
  sr?: number;
  gifts?: LiveEvent[];
}

export interface StatsResponse {
  rooms?: StatsRoom[];
}

export interface RoomTrendResponse {
  agg?: {
    '7d'?: {
      lw?: number;
      sr?: number;
    };
  };
}

export interface LiveEvent {
  type?: string;
  room?: string;
  rid?: string;
  name?: string;
  nn?: string;
  text?: string;
  txt?: string;
  giftName?: string;
  gfname?: string;
  giftCount?: number;
  giftPrice?: number;
  totalValue?: number;
  sender?: string;
  receiver?: string;
  count?: number;
  gfcnt?: number;
  col?: string | number;
  time?: number | string;
  ok?: boolean;
}

export interface StreamWindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GiftSessionSnapshot {
  showTime: number;
  totalCents: number;
}

export interface Preferences {
  openRooms: string[];
  favorites: string[];
  mutedRooms: string[];
  roomVolumes: Record<string, number>;
  danmakuHiddenRooms: string[];
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuArea: DanmakuArea;
  giftRevenueRange: GiftRevenueRange;
  includeFreeGifts: boolean;
  giftSessionTotals: Record<string, GiftSessionSnapshot>;
  layout: LayoutMode;
  windowRects: Record<string, StreamWindowRect>;
  queueCollapsed: boolean;
  inspectorCollapsed: boolean;
}
