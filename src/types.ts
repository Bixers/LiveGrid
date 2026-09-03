export type Quality = 'OD' | 'UHD' | 'HD' | 'SD';
export type LayoutMode = 'auto' | '1' | '2' | '3' | '4' | 'focus';
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
  noble?: number;
  giftTotal?: number;
  giftUV?: number;
  chatUV?: number;
  activeUV?: number;
  sr?: number;
}

export interface StatsResponse {
  rooms?: StatsRoom[];
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
  count?: number;
  gfcnt?: number;
  value?: number;
  time?: number | string;
  ok?: boolean;
}

export interface Preferences {
  openRooms: string[];
  favorites: string[];
  mutedRooms: string[];
  layout: LayoutMode;
}
