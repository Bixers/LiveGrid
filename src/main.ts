import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  CircleDollarSign,
  Command,
  Focus,
  GripVertical,
  LayoutGrid,
  ListFilter,
  Maximize2,
  Menu,
  MessageCircle,
  Monitor,
  Move,
  Pause,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
  createElement,
  type IconNode,
} from 'lucide';
import {
  addRoom as addRoomRequest,
  getLastLatency,
  getRoomTrend,
  getServiceStatus,
  getStats,
  getStreams,
  refreshStreams,
  removeRoom as removeRoomRequest,
  setRoomQuality,
} from './api';
import {
  StreamPlayer,
  subscribeNativePlayerEvents,
  type NativePlayerEvent,
  type PlayerState,
} from './player';
import type {
  AppView,
  DanmakuArea,
  GiftRevenueRange,
  GiftSessionSnapshot,
  LayoutMode,
  LiveEvent,
  Preferences,
  Quality,
  RoomFilter,
  StatsRoom,
  StreamRoom,
  StreamWindowRect,
} from './types';
import './styles.css';

declare global {
  interface Window {
    liveGridPreferences?: {
      read: () => unknown;
      write: (value: unknown) => void;
    };
  }
}

const iconSet: Record<string, IconNode> = {
  activity: Activity,
  'bar-chart-3': BarChart3,
  check: Check,
  'chevron-down': ChevronDown,
  'circle-alert': CircleAlert,
  'circle-dollar-sign': CircleDollarSign,
  command: Command,
  focus: Focus,
  'grip-vertical': GripVertical,
  'layout-grid': LayoutGrid,
  'list-filter': ListFilter,
  'maximize-2': Maximize2,
  menu: Menu,
  'message-circle': MessageCircle,
  monitor: Monitor,
  move: Move,
  pause: Pause,
  'panel-left-close': PanelLeftClose,
  'panel-left-open': PanelLeftOpen,
  'panel-right-close': PanelRightClose,
  'panel-right-open': PanelRightOpen,
  play: Play,
  plus: Plus,
  radio: Radio,
  'refresh-cw': RefreshCw,
  search: Search,
  'sliders-horizontal': SlidersHorizontal,
  star: Star,
  'trash-2': Trash2,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  x: X,
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('应用挂载节点不存在');

const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
const storageKey = demoMode ? 'live_ops_preferences_demo_v1' : 'live_ops_preferences_v1';
const desktopPreferences = demoMode ? undefined : window.liveGridPreferences;
const qualityNames: Record<Quality, string> = {
  OD: '原画',
  UHD: '超清',
  HD: '高清',
  SD: '标清',
};

const demoRooms: StreamRoom[] = [
  { room: '612904', name: '夜航电竞', ok: true, loop: false, url: '', showTime: Math.floor(Date.now() / 1000) - 5832, quality: 'HD', error: '' },
  { room: '883120', name: '山城音乐间', ok: true, loop: false, url: '', showTime: Math.floor(Date.now() / 1000) - 2418, quality: 'OD', error: '' },
  { room: '390271', name: '橙子电台', ok: true, loop: true, url: '', showTime: Math.floor(Date.now() / 1000) - 9211, quality: 'HD', error: '' },
  { room: '721536', name: '北岸户外', ok: false, loop: false, url: '', showTime: 0, quality: 'SD', error: '' },
  { room: '459802', name: '像素实验室', ok: false, loop: false, url: '', showTime: 0, quality: 'HD', error: '主播未开播' },
];

const demoStats: StatsRoom[] = [
  { rid: '612904', name: '夜航电竞', live: true, hot: 32741, fans: 184206, giftTotal: 2873.4, giftPaid: 641, giftUV: 214, chatUV: 1638, activeUV: 4821, sr: 641 },
  { rid: '883120', name: '山城音乐间', live: true, hot: 21806, fans: 92713, giftTotal: 1496.8, giftPaid: 382, giftUV: 127, chatUV: 906, activeUV: 2914, sr: 382 },
  { rid: '390271', name: '橙子电台', live: true, hot: 12639, fans: 60388, giftTotal: 683.2, giftPaid: 195, giftUV: 71, chatUV: 517, activeUV: 1736, sr: 195 },
  { rid: '721536', name: '北岸户外', live: false, hot: 0, fans: 43107, giftTotal: 0, giftPaid: 0, giftUV: 0, chatUV: 0, activeUV: 0, sr: 0 },
];

const defaultPreferences: Preferences = {
  openRooms: demoMode ? demoRooms.slice(0, 3).map((room) => room.room) : [],
  favorites: [],
  mutedRooms: [],
  roomVolumes: {},
  danmakuHiddenRooms: [],
  danmakuOpacity: 92,
  danmakuFontSize: 14,
  danmakuArea: 'top-third',
  giftRevenueRange: 'today',
  includeFreeGifts: true,
  giftSessionTotals: {},
  layout: 'auto',
  windowRects: {},
  queueCollapsed: false,
  inspectorCollapsed: false,
};

function readWindowRects(value: unknown): Record<string, StreamWindowRect> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).flatMap(([roomId, candidate]) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const rect = candidate as Partial<StreamWindowRect>;
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return [];
    return [[roomId, {
      x: Number(rect.x),
      y: Number(rect.y),
      width: Number(rect.width),
      height: Number(rect.height),
    }]];
  }));
}

function readRoomVolumes(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([roomId, candidate]) => {
    const volume = Number(candidate);
    if (!Number.isFinite(volume)) return [];
    return [[roomId, Math.round(Math.min(100, Math.max(0, volume)))]];
  }));
}

function readGiftSessionTotals(value: unknown): Record<string, GiftSessionSnapshot> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([roomId, candidate]) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const snapshot = candidate as Partial<GiftSessionSnapshot>;
    if (!Number.isFinite(snapshot.showTime) || !Number.isFinite(snapshot.totalCents)) return [];
    return [[roomId, {
      showTime: Math.max(0, Number(snapshot.showTime)),
      totalCents: Math.max(0, Number(snapshot.totalCents)),
    }]];
  }));
}

function readNumberPreference(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function readPreferences(): Preferences {
  try {
    const desktopValue = desktopPreferences?.read();
    const saved = (desktopValue && typeof desktopValue === 'object'
      ? desktopValue
      : JSON.parse(localStorage.getItem(storageKey) ?? '{}')) as Partial<Preferences>;
    return {
      openRooms: Array.isArray(saved.openRooms) ? saved.openRooms.map(String) : defaultPreferences.openRooms,
      favorites: Array.isArray(saved.favorites) ? saved.favorites.map(String) : [],
      mutedRooms: Array.isArray(saved.mutedRooms) ? saved.mutedRooms.map(String) : [],
      roomVolumes: readRoomVolumes(saved.roomVolumes),
      danmakuHiddenRooms: Array.isArray(saved.danmakuHiddenRooms) ? saved.danmakuHiddenRooms.map(String) : [],
      danmakuOpacity: readNumberPreference(saved.danmakuOpacity, defaultPreferences.danmakuOpacity, 20, 100),
      danmakuFontSize: readNumberPreference(saved.danmakuFontSize, defaultPreferences.danmakuFontSize, 12, 28),
      danmakuArea: ['top-quarter', 'top-third', 'top-half', 'full', 'bottom-half', 'bottom-quarter'].includes(String(saved.danmakuArea))
        ? saved.danmakuArea as DanmakuArea
        : defaultPreferences.danmakuArea,
      giftRevenueRange: ['today', '7d', 'session'].includes(String(saved.giftRevenueRange))
        ? saved.giftRevenueRange as GiftRevenueRange
        : defaultPreferences.giftRevenueRange,
      includeFreeGifts: saved.includeFreeGifts !== false,
      giftSessionTotals: readGiftSessionTotals(saved.giftSessionTotals),
      layout: ['free', 'auto', '1', '2', '3', '4', 'focus'].includes(String(saved.layout))
        ? saved.layout as LayoutMode
        : 'auto',
      windowRects: readWindowRects(saved.windowRects),
      queueCollapsed: Boolean(saved.queueCollapsed),
      inspectorCollapsed: Boolean(saved.inspectorCollapsed),
    };
  } catch {
    return { ...defaultPreferences };
  }
}

const preferences = readPreferences();
desktopPreferences?.write(preferences);
const state = {
  rooms: [] as StreamRoom[],
  stats: [] as StatsRoom[],
  openRooms: [...preferences.openRooms],
  favorites: new Set(preferences.favorites),
  mutedRooms: new Set(preferences.mutedRooms),
  roomVolumes: { ...preferences.roomVolumes },
  danmakuHiddenRooms: new Set(preferences.danmakuHiddenRooms),
  danmakuOpacity: preferences.danmakuOpacity,
  danmakuFontSize: preferences.danmakuFontSize,
  danmakuArea: preferences.danmakuArea,
  giftRevenueRange: preferences.giftRevenueRange,
  includeFreeGifts: preferences.includeFreeGifts,
  giftSessionTotals: { ...preferences.giftSessionTotals },
  windowRects: { ...preferences.windowRects },
  queueCollapsed: preferences.queueCollapsed,
  inspectorCollapsed: preferences.inspectorCollapsed,
  selectedRooms: new Set<string>(),
  activeRoom: preferences.openRooms[0] ?? null as string | null,
  filter: 'all' as RoomFilter,
  query: '',
  layout: preferences.layout,
  lastPresetLayout: (preferences.layout === 'free' ? 'auto' : preferences.layout) as Exclude<LayoutMode, 'free'>,
  view: 'monitor' as AppView,
  service: 'checking' as 'checking' | 'online' | 'degraded' | 'offline',
  serviceMessage: '正在连接本地服务',
  lastUpdatedAt: 0,
  eventState: 'idle' as 'idle' | 'connecting' | 'online' | 'retrying',
  inspectorFeed: 'chat' as 'chat' | 'gift',
};

const players = new Map<string, StreamPlayer>();
const playerStates = new Map<string, { state: PlayerState; detail: string }>();
const danmakuStates = new Map<string, { ok: boolean; text: string }>();
const sevenDayGiftTotals = new Map<string, number>();
const sevenDayPaidGiftTotals = new Map<string, number>();
const sevenDayGiftLoadedAt = new Map<string, number>();
const sevenDayGiftRequests = new Set<string>();
const chatEvents: LiveEvent[] = demoMode
  ? [{ type: 'chat', room: '612904', nn: '演示观众', txt: '今晚的赛程开始了', time: Date.now() - 42000 }]
  : [];
const giftEvents: LiveEvent[] = demoMode
  ? [{ type: 'gift', room: '883120', sender: '山风', giftName: '荧光棒', giftCount: 6, giftPrice: 10, totalValue: 60, time: Date.now() - 18000 }]
  : [];
const giftEventKeys = new Set<string>();
let streamsAbort: AbortController | null = null;
let streamsRequest: Promise<boolean> | null = null;
let statusAbort: AbortController | null = null;
let statsAbort: AbortController | null = null;
let statsEventSource: EventSource | null = null;
let pendingRemovalIds: string[] = [];
let zIndexCounter = 1;
let preferencesSaveTimer = 0;

interface RoomRuntimeState {
  refreshAttempt: number;
  nextRefreshAt: number;
  requestedQuality: Quality;
  automaticQuality: boolean;
  qualityPending: boolean;
}

const roomRuntime = new Map<string, RoomRuntimeState>();
const refreshRetrySeconds = [1, 2, 4, 8, 15, 30];
let roomRefreshTimer = 0;

const initiallyAudibleRooms = state.openRooms.filter((roomId) => !state.mutedRooms.has(roomId));
initiallyAudibleRooms.slice(1).forEach((roomId) => state.mutedRooms.add(roomId));

function runtimeFor(roomId: string, quality: Quality = 'HD'): RoomRuntimeState {
  let runtime = roomRuntime.get(roomId);
  if (!runtime) {
    runtime = {
      refreshAttempt: 0,
      nextRefreshAt: Date.now() + Math.round(Math.random() * 2500),
      requestedQuality: quality,
      automaticQuality: false,
      qualityPending: false,
    };
    roomRuntime.set(roomId, runtime);
  }
  return runtime;
}

function setNextRoomRefresh(runtime: RoomRuntimeState, success: boolean): void {
  if (success) runtime.refreshAttempt = 0;
  else runtime.refreshAttempt += 1;
  const baseSeconds = success
    ? 8
    : refreshRetrySeconds[Math.min(runtime.refreshAttempt - 1, refreshRetrySeconds.length - 1)]!;
  const jitter = 0.85 + Math.random() * 0.3;
  runtime.nextRefreshAt = Date.now() + Math.round(baseSeconds * jitter * 1000);
}

app.innerHTML = `
  <a class="skip-link" href="#main-workspace">跳到主要工作区</a>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand-block" aria-label="监控室">
        <span class="brand-mark"><i data-lucide="radio"></i></span>
        <span class="brand-copy">
          <h1>监控室</h1>
          <small>LIVEGRID</small>
        </span>
      </div>

      <nav class="view-switcher" aria-label="工作区">
        <button type="button" class="view-tab is-active" data-view="monitor">
          <i data-lucide="monitor"></i><span>直播监控</span>
        </button>
        <button type="button" class="view-tab" data-view="analytics">
          <i data-lucide="bar-chart-3"></i><span>运行数据</span>
        </button>
      </nav>

      <div class="topbar-actions">
        <button type="button" class="icon-button desktop-panel-toggle" id="queue-panel-button" aria-label="隐藏房间队列" title="隐藏房间队列" aria-pressed="false">
          <i data-lucide="panel-left-close"></i>
        </button>
        <div id="service-status" class="service-status is-checking" role="status" aria-atomic="true">
          <span class="status-signal" aria-hidden="true"></span>
          <span id="service-label">正在连接本地服务</span>
          <span id="service-meta" class="service-meta"></span>
        </div>
        <span id="demo-label" class="demo-label" ${demoMode ? '' : 'hidden'}>演示数据</span>
        <button type="button" class="icon-button" id="command-button" aria-label="打开命令面板" title="打开命令面板">
          <i data-lucide="command"></i>
        </button>
        <button type="button" class="icon-button mobile-only" id="room-drawer-button" aria-label="打开房间队列" title="打开房间队列">
          <i data-lucide="menu"></i>
        </button>
        <button type="button" class="icon-button inspector-toggle" id="inspector-button" aria-label="隐藏房间检查器" title="隐藏房间检查器" aria-pressed="false">
          <i data-lucide="panel-right-close"></i>
        </button>
      </div>
    </header>

    <main id="main-workspace" class="workspace" tabindex="-1">
      <aside class="room-panel" id="room-panel" aria-label="房间队列">
        <div class="panel-heading">
          <div>
            <h2>房间队列</h2>
            <p id="room-summary">0 个房间</p>
          </div>
          <button type="button" class="icon-button panel-close" data-action="close-room-drawer" aria-label="隐藏房间队列" title="隐藏房间队列">
            <i data-lucide="x"></i>
          </button>
        </div>

        <form id="add-room-form" class="add-room-form" novalidate>
          <label for="room-input">添加房间</label>
          <div class="input-action-row">
            <input id="room-input" name="room" inputmode="numeric" autocomplete="off" placeholder="输入数字房间号" aria-describedby="room-input-error" />
            <button type="submit" class="primary-icon-button" aria-label="添加房间" title="添加房间">
              <i data-lucide="plus"></i>
            </button>
          </div>
          <p id="room-input-error" class="field-error" role="alert"></p>
        </form>

        <div class="queue-tools">
          <label for="room-search">筛选队列</label>
          <div class="search-field">
            <i data-lucide="search"></i>
            <input id="room-search" type="search" autocomplete="off" placeholder="房间号或主播名" />
          </div>
          <div class="segmented-control filter-control" aria-label="房间状态筛选">
            <button type="button" class="is-active" data-filter="all" aria-pressed="true">全部</button>
            <button type="button" data-filter="live" aria-pressed="false">直播中</button>
            <button type="button" data-filter="offline" aria-pressed="false">未开播</button>
          </div>
        </div>

        <div id="bulk-bar" class="bulk-bar" hidden>
          <span id="bulk-count">已选 0 项</span>
          <div class="bulk-actions">
            <button type="button" data-action="open-selected">打开</button>
            <button type="button" data-action="mute-selected">静音</button>
            <button type="button" class="danger-text" data-action="remove-selected">移除</button>
          </div>
        </div>

        <div class="queue-select-all">
          <label>
            <input id="select-all" type="checkbox" />
            <span>选择当前列表</span>
          </label>
          <button type="button" class="quiet-button" data-action="favorites-first">
            <i data-lucide="star"></i><span>关注优先</span>
          </button>
        </div>

        <div id="room-list" class="room-list" aria-live="polite"></div>
      </aside>

      <section class="main-surface" aria-label="主要工作区">
        <div id="monitor-view" class="monitor-view">
          <div class="surface-toolbar">
            <div class="surface-title">
              <h2>直播画布</h2>
              <span id="canvas-count">0 路已打开</span>
            </div>
            <div class="surface-controls">
              <label class="free-window-toggle" title="开启后可拖动和缩放直播窗口">
                <input id="free-window-toggle" type="checkbox" />
                <span class="toggle-track" aria-hidden="true"><span></span></span>
                <i data-lucide="move"></i>
                <span class="free-window-label">自由窗口</span>
              </label>
              <div class="segmented-control layout-control" aria-label="画布布局">
                <button type="button" data-layout="auto" aria-label="自动布局" title="自动布局"><i data-lucide="layout-grid"></i></button>
                <button type="button" data-layout="1" aria-label="单列布局" title="单列布局">1</button>
                <button type="button" data-layout="2" aria-label="两列布局" title="两列布局">2</button>
                <button type="button" data-layout="3" aria-label="三列布局" title="三列布局">3</button>
                <button type="button" data-layout="4" aria-label="四列布局" title="四列布局">4</button>
                <button type="button" data-layout="focus" aria-label="重点布局" title="重点布局"><i data-lucide="focus"></i></button>
              </div>
              <button type="button" class="tool-button" data-action="open-danmaku-settings" aria-label="显示设置" title="显示设置">
                <i data-lucide="sliders-horizontal"></i><span>显示设置</span>
              </button>
              <button type="button" class="tool-button" data-action="mute-all" aria-label="全部静音" title="全部静音">
                <i data-lucide="volume-x"></i><span>全部静音</span>
              </button>
              <button type="button" class="tool-button" data-action="refresh-all" aria-label="刷新流" title="刷新流">
                <i data-lucide="refresh-cw"></i><span>刷新流</span>
              </button>
            </div>
          </div>
          <div id="video-grid" class="video-grid" data-layout="auto"></div>
          <div id="canvas-empty" class="canvas-empty">
            <span class="empty-symbol"><i data-lucide="monitor"></i></span>
            <h2>画布等待分配</h2>
            <p>从左侧队列打开一个直播房间。</p>
            <button type="button" class="secondary-button mobile-only" data-action="open-room-drawer">查看房间队列</button>
          </div>
        </div>

        <div id="analytics-view" class="analytics-view" hidden>
          <div class="surface-toolbar">
            <div class="surface-title">
              <h2>运行数据</h2>
              <span id="analytics-updated">尚未同步</span>
            </div>
            <button type="button" class="tool-button" data-action="refresh-analytics">
              <i data-lucide="refresh-cw"></i><span>同步数据</span>
            </button>
          </div>
          <div id="metric-strip" class="metric-strip" aria-label="运行概览"></div>
          <div class="analytics-table-wrap">
            <table class="analytics-table">
              <thead>
                <tr>
                  <th scope="col">房间</th>
                  <th scope="col">状态</th>
                  <th scope="col">热度</th>
                  <th scope="col">活跃用户</th>
                  <th scope="col">互动用户</th>
                  <th scope="col">礼物金额</th>
                </tr>
              </thead>
              <tbody id="analytics-body"></tbody>
            </table>
            <div id="analytics-empty" class="table-empty" hidden>
              <i data-lucide="bar-chart-3"></i>
              <strong>暂无统计数据</strong>
              <span>服务产生房间数据后会显示在这里。</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="inspector" id="inspector" aria-label="房间检查器">
        <div class="panel-heading inspector-heading">
          <div>
            <h2>房间检查器</h2>
            <p>当前上下文</p>
          </div>
          <button type="button" class="icon-button inspector-close" data-action="close-inspector" aria-label="隐藏检查器" title="隐藏检查器">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div id="inspector-content" class="inspector-content"></div>
      </aside>
    </main>
  </div>

  <dialog id="confirm-dialog" class="confirm-dialog">
    <form method="dialog">
      <div class="dialog-icon"><i data-lucide="circle-alert"></i></div>
      <h2 id="confirm-title">移除房间</h2>
      <p id="confirm-description">将从本地服务的监控列表移除。</p>
      <div class="dialog-actions">
        <button value="cancel" class="secondary-button">取消</button>
        <button value="confirm" class="danger-button" id="confirm-remove">确认移除</button>
      </div>
    </form>
  </dialog>

  <dialog id="danmaku-settings-dialog" class="danmaku-settings-dialog">
    <form method="dialog">
      <div class="settings-dialog-header">
        <div>
          <h2>显示设置</h2>
          <p>全部直播窗口</p>
        </div>
        <button value="cancel" class="row-icon-button" aria-label="关闭显示设置" title="关闭"><i data-lucide="x"></i></button>
      </div>
      <label class="danmaku-area-field gift-revenue-field" for="gift-revenue-range">
        <span>礼物收入统计</span>
        <select id="gift-revenue-range">
          <option value="today">当日</option>
          <option value="7d">近 7 日</option>
          <option value="session">本次直播</option>
        </select>
      </label>
      <label class="settings-toggle-row" for="include-free-gifts">
        <span>统计免费礼物</span>
        <input id="include-free-gifts" type="checkbox" />
        <span class="toggle-track" aria-hidden="true"><span></span></span>
      </label>
      <div class="settings-group-label">弹幕</div>
      <div class="danmaku-setting-row">
        <label for="danmaku-opacity">透明度</label>
        <output id="danmaku-opacity-output" for="danmaku-opacity">92%</output>
        <input id="danmaku-opacity" type="range" min="20" max="100" step="5" />
      </div>
      <div class="danmaku-setting-row">
        <label for="danmaku-font-size">字号</label>
        <output id="danmaku-font-size-output" for="danmaku-font-size">14 px</output>
        <input id="danmaku-font-size" type="range" min="12" max="28" step="1" />
      </div>
      <label class="danmaku-area-field" for="danmaku-area">
        <span>显示区域</span>
        <select id="danmaku-area">
          <option value="top-quarter">顶部 1/4</option>
          <option value="top-third">顶部 1/3</option>
          <option value="top-half">上半屏</option>
          <option value="full">全屏</option>
          <option value="bottom-half">下半屏</option>
          <option value="bottom-quarter">底部 1/4</option>
        </select>
      </label>
      <div class="dialog-actions">
        <button value="close" class="primary-button">完成</button>
      </div>
    </form>
  </dialog>

  <dialog id="command-dialog" class="command-dialog">
    <div class="command-search">
      <i data-lucide="search"></i>
      <label class="sr-only" for="command-input">查找命令</label>
      <input id="command-input" autocomplete="off" placeholder="查找操作" />
      <button type="button" class="icon-button" data-action="close-command" aria-label="关闭命令面板" title="关闭">
        <i data-lucide="x"></i>
      </button>
    </div>
    <div id="command-results" class="command-results"></div>
  </dialog>

  <div id="toast-region" class="toast-region" aria-live="polite" aria-atomic="true"></div>
`;

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`缺少界面节点: ${id}`);
  return found as T;
}

const roomList = element<HTMLDivElement>('room-list');
const videoGrid = element<HTMLDivElement>('video-grid');
const canvasEmpty = element<HTMLDivElement>('canvas-empty');
const inspectorContent = element<HTMLDivElement>('inspector-content');
const analyticsBody = element<HTMLTableSectionElement>('analytics-body');
const analyticsEmpty = element<HTMLDivElement>('analytics-empty');
const metricStrip = element<HTMLDivElement>('metric-strip');
const addRoomForm = element<HTMLFormElement>('add-room-form');
const roomInput = element<HTMLInputElement>('room-input');
const roomInputError = element<HTMLParagraphElement>('room-input-error');
const roomSearch = element<HTMLInputElement>('room-search');
const selectAll = element<HTMLInputElement>('select-all');
const confirmDialog = element<HTMLDialogElement>('confirm-dialog');
const danmakuSettingsDialog = element<HTMLDialogElement>('danmaku-settings-dialog');
const danmakuOpacityInput = element<HTMLInputElement>('danmaku-opacity');
const danmakuFontSizeInput = element<HTMLInputElement>('danmaku-font-size');
const danmakuAreaSelect = element<HTMLSelectElement>('danmaku-area');
const giftRevenueRangeSelect = element<HTMLSelectElement>('gift-revenue-range');
const includeFreeGiftsInput = element<HTMLInputElement>('include-free-gifts');
const commandDialog = element<HTMLDialogElement>('command-dialog');
const commandInput = element<HTMLInputElement>('command-input');
const freeWindowToggle = element<HTMLInputElement>('free-window-toggle');

function drawIcons(): void {
  document.querySelectorAll<HTMLElement>('i[data-lucide]').forEach((placeholder) => {
    const icon = iconSet[placeholder.dataset.lucide ?? ''];
    if (!icon) return;

    const svg = createElement(icon, {
      'aria-hidden': 'true',
      focusable: 'false',
      'stroke-width': '1.8',
    });
    const className = placeholder.getAttribute('class');
    if (className) svg.setAttribute('class', className);
    placeholder.replaceWith(svg);
  });
}

function savePreferences(): void {
  const value: Preferences = {
    openRooms: state.openRooms,
    favorites: [...state.favorites],
    mutedRooms: [...state.mutedRooms],
    roomVolumes: state.roomVolumes,
    danmakuHiddenRooms: [...state.danmakuHiddenRooms],
    danmakuOpacity: state.danmakuOpacity,
    danmakuFontSize: state.danmakuFontSize,
    danmakuArea: state.danmakuArea,
    giftRevenueRange: state.giftRevenueRange,
    includeFreeGifts: state.includeFreeGifts,
    giftSessionTotals: state.giftSessionTotals,
    layout: state.layout,
    windowRects: state.windowRects,
    queueCollapsed: state.queueCollapsed,
    inspectorCollapsed: state.inspectorCollapsed,
  };
  localStorage.setItem(storageKey, JSON.stringify(value));
  desktopPreferences?.write(value);
}

function schedulePreferencesSave(): void {
  window.clearTimeout(preferencesSaveTimer);
  preferencesSaveTimer = window.setTimeout(savePreferences, 500);
}

const desktopQueueMedia = window.matchMedia('(min-width: 901px)');
const desktopInspectorMedia = window.matchMedia('(min-width: 1181px)');

function setControlIcon(button: HTMLButtonElement, iconName: string): void {
  const icon = iconSet[iconName];
  if (!icon) return;
  button.replaceChildren(createElement(icon, {
    'aria-hidden': 'true',
    focusable: 'false',
    'stroke-width': '1.8',
  }));
}

function applyDanmakuDisplaySettings(persist = false): void {
  videoGrid.style.setProperty('--danmaku-opacity', String(state.danmakuOpacity / 100));
  videoGrid.style.setProperty('--danmaku-font-size', `${state.danmakuFontSize}px`);
  videoGrid.dataset.danmakuArea = state.danmakuArea;
  danmakuOpacityInput.value = String(state.danmakuOpacity);
  danmakuFontSizeInput.value = String(state.danmakuFontSize);
  danmakuAreaSelect.value = state.danmakuArea;
  element<HTMLOutputElement>('danmaku-opacity-output').value = `${state.danmakuOpacity}%`;
  element<HTMLOutputElement>('danmaku-font-size-output').value = `${state.danmakuFontSize} px`;
  players.forEach((player) => player.setDanmakuSettings(
    state.danmakuOpacity,
    state.danmakuFontSize,
    state.danmakuArea,
  ));
  if (persist) savePreferences();
}

function openDanmakuSettings(): void {
  applyDanmakuDisplaySettings();
  giftRevenueRangeSelect.value = state.giftRevenueRange;
  includeFreeGiftsInput.checked = state.includeFreeGifts;
  danmakuSettingsDialog.showModal();
}

function applyPanelVisibility(): void {
  const queueCollapsed = desktopQueueMedia.matches && state.queueCollapsed;
  const inspectorCollapsed = desktopInspectorMedia.matches && state.inspectorCollapsed;
  document.body.classList.toggle('queue-collapsed', queueCollapsed);
  document.body.classList.toggle('inspector-collapsed', inspectorCollapsed);

  const queueButton = element<HTMLButtonElement>('queue-panel-button');
  queueButton.setAttribute('aria-pressed', String(queueCollapsed));
  queueButton.setAttribute('aria-label', queueCollapsed ? '显示房间队列' : '隐藏房间队列');
  queueButton.title = queueCollapsed ? '显示房间队列' : '隐藏房间队列';
  setControlIcon(queueButton, queueCollapsed ? 'panel-left-open' : 'panel-left-close');

  const inspectorButton = element<HTMLButtonElement>('inspector-button');
  const inspectorOpen = desktopInspectorMedia.matches
    ? !inspectorCollapsed
    : document.body.classList.contains('inspector-open');
  inspectorButton.setAttribute('aria-pressed', String(!inspectorOpen));
  inspectorButton.setAttribute('aria-label', inspectorOpen ? '隐藏房间检查器' : '显示房间检查器');
  inspectorButton.title = inspectorOpen ? '隐藏房间检查器' : '显示房间检查器';
  setControlIcon(inspectorButton, inspectorOpen ? 'panel-right-close' : 'panel-right-open');
}

function toggleQueuePanel(): void {
  if (!desktopQueueMedia.matches) {
    document.body.classList.toggle('room-drawer-open');
    return;
  }
  state.queueCollapsed = !state.queueCollapsed;
  savePreferences();
  applyPanelVisibility();
  window.setTimeout(constrainAllWindows, 220);
}

function hideQueuePanel(): void {
  if (desktopQueueMedia.matches) {
    state.queueCollapsed = true;
    savePreferences();
    applyPanelVisibility();
    window.setTimeout(constrainAllWindows, 220);
  } else {
    document.body.classList.remove('room-drawer-open');
  }
}

function toggleInspectorPanel(): void {
  if (!desktopInspectorMedia.matches) {
    document.body.classList.toggle('inspector-open');
    applyPanelVisibility();
    return;
  }
  state.inspectorCollapsed = !state.inspectorCollapsed;
  savePreferences();
  applyPanelVisibility();
  window.setTimeout(constrainAllWindows, 220);
}

function hideInspectorPanel(): void {
  if (desktopInspectorMedia.matches) {
    state.inspectorCollapsed = true;
    savePreferences();
  } else {
    document.body.classList.remove('inspector-open');
  }
  applyPanelVisibility();
  window.setTimeout(constrainAllWindows, 220);
}

function roomById(roomId: string): StreamRoom | undefined {
  return state.rooms.find((room) => room.room === roomId);
}

function statsByRoomId(roomId: string): StatsRoom | undefined {
  return state.stats.find((room) => String(room.rid) === roomId);
}

function roomVolume(roomId: string): number {
  return state.roomVolumes[roomId] ?? 100;
}

function displayRoomName(room: StreamRoom | undefined, roomId: string): string {
  return room?.name || `房间 ${roomId}`;
}

function filteredRooms(): StreamRoom[] {
  const query = state.query.trim().toLocaleLowerCase('zh-CN');
  return state.rooms
    .filter((room) => {
      if (state.filter === 'live' && !room.ok) return false;
      if (state.filter === 'offline' && room.ok) return false;
      if (!query) return true;
      return room.room.includes(query) || room.name.toLocaleLowerCase('zh-CN').includes(query);
    })
    .sort((left, right) => {
      const favoriteDelta = Number(state.favorites.has(right.room)) - Number(state.favorites.has(left.room));
      if (favoriteDelta !== 0) return favoriteDelta;
      const stateDelta = Number(right.ok) - Number(left.ok);
      if (stateDelta !== 0) return stateDelta;
      return left.room.localeCompare(right.room);
    });
}

function roomStateText(room: StreamRoom): string {
  if (!room.ok) return '未开播';
  return room.loop ? '轮播中' : '直播中';
}

function formatInteger(value: number | undefined): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value ?? 0);
}

function formatMoney(amountCny: number | undefined): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCny ?? 0);
}

const giftRevenueRangeNames: Record<GiftRevenueRange, string> = {
  today: '当日',
  '7d': '近 7 日',
  session: '本次直播',
};

function formatCny(cents: number | undefined): string {
  if (cents === undefined) return 'CNY --';
  const amount = Math.max(0, cents) / 100;
  return `CNY ${new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

function giftRevenueCents(roomId: string): number | undefined {
  if (state.giftRevenueRange === 'session') return state.giftSessionTotals[roomId]?.totalCents ?? 0;
  if (state.giftRevenueRange === '7d') {
    return (state.includeFreeGifts ? sevenDayGiftTotals : sevenDayPaidGiftTotals).get(roomId);
  }
  const room = statsByRoomId(roomId);
  const amountCny = state.includeFreeGifts ? room?.giftTotal : (room?.giftPaid ?? room?.sr);
  return amountCny === undefined ? undefined : Math.round(amountCny * 100);
}

function statsGiftAmount(room: StatsRoom): number {
  return state.includeFreeGifts ? (room.giftTotal ?? 0) : (room.giftPaid ?? room.sr ?? 0);
}

function formatDuration(showTime: number): string {
  if (!showTime) return '00:00:00';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - showTime));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  return [hours, minutes, rest].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatEventTime(value: number | string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function giftEventKey(event: LiveEvent): string {
  return [
    event.rid ?? event.room ?? '',
    event.time ?? '',
    event.sender ?? event.nn ?? '',
    event.giftName ?? event.gfname ?? '',
    event.giftCount ?? event.count ?? event.gfcnt ?? 1,
    event.totalValue ?? '',
  ].join('|');
}

function addLiveEvent(event: LiveEvent): boolean {
  const normalized = { ...event, time: event.time ?? Date.now() };
  if (normalized.type === 'gift') {
    const key = giftEventKey(normalized);
    if (giftEventKeys.has(key)) return false;
    giftEventKeys.add(key);
    giftEvents.unshift(normalized);
    if (giftEvents.length > 300) {
      const removed = giftEvents.pop();
      if (removed) giftEventKeys.delete(giftEventKey(removed));
    }
    return true;
  }
  if (normalized.type === 'chat') {
    chatEvents.unshift(normalized);
    if (chatEvents.length > 300) chatEvents.length = 300;
    return true;
  }
  return false;
}

function mergeStatsGiftEvents(rooms: StatsRoom[]): boolean {
  let changed = false;
  rooms.forEach((room) => {
    (room.gifts ?? []).forEach((gift) => {
      changed = addLiveEvent({ ...gift, type: 'gift', rid: gift.rid ?? room.rid }) || changed;
    });
  });
  giftEvents.sort((left, right) => Number(right.time ?? 0) - Number(left.time ?? 0));
  return changed;
}

function isFreeGift(event: LiveEvent): boolean {
  return Number(event.totalValue ?? 0) <= 0;
}

function toast(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
  const region = element<HTMLDivElement>('toast-region');
  const item = document.createElement('div');
  item.className = `toast is-${tone}`;
  item.textContent = message;
  region.replaceChildren(item);
  window.setTimeout(() => item.remove(), 3200);
}

function renderHeader(): void {
  const status = element<HTMLDivElement>('service-status');
  const label = element<HTMLSpanElement>('service-label');
  const meta = element<HTMLSpanElement>('service-meta');
  status.className = `service-status is-${state.service}`;
  label.textContent = state.serviceMessage;
  meta.textContent = state.lastUpdatedAt
    ? `${getLastLatency()}ms / ${new Date(state.lastUpdatedAt).toLocaleTimeString('zh-CN', { hour12: false })}`
    : '';
}

function renderRoomList(): void {
  const visibleRooms = filteredRooms();
  const liveCount = state.rooms.filter((room) => room.ok).length;
  element<HTMLParagraphElement>('room-summary').textContent = `${liveCount} 个直播中 / ${state.rooms.length} 个房间`;
  roomList.replaceChildren();

  if (visibleRooms.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'queue-empty';
    const title = state.rooms.length === 0 ? '尚未添加房间' : '没有符合条件的房间';
    const detail = state.rooms.length === 0 ? '在上方输入数字房间号开始监控。' : '调整筛选条件或搜索内容。';
    empty.innerHTML = '<i data-lucide="list-filter"></i><strong></strong><span></span>';
    empty.querySelector('strong')!.textContent = title;
    empty.querySelector('span')!.textContent = detail;
    roomList.appendChild(empty);
    renderBulkBar(visibleRooms);
    drawIcons();
    return;
  }

  visibleRooms.forEach((room) => {
    const item = document.createElement('article');
    item.className = [
      'room-row',
      room.ok ? 'is-live' : 'is-offline',
      state.openRooms.includes(room.room) ? 'is-open' : '',
      state.activeRoom === room.room ? 'is-active' : '',
    ].filter(Boolean).join(' ');
    item.dataset.room = room.room;
    item.innerHTML = `
      <label class="row-check">
        <input type="checkbox" data-select-room aria-label="选择房间" />
      </label>
      <button type="button" class="room-main" data-action="toggle-room">
        <span class="room-state-code"></span>
        <span class="room-copy"><strong></strong><small></small></span>
      </button>
      <button type="button" class="row-icon-button favorite-button" data-action="toggle-favorite" aria-label="关注房间" title="关注房间">
        <i data-lucide="star"></i>
      </button>
    `;
    const checkbox = item.querySelector<HTMLInputElement>('[data-select-room]')!;
    checkbox.checked = state.selectedRooms.has(room.room);
    checkbox.setAttribute('aria-label', `选择 ${displayRoomName(room, room.room)}`);
    item.querySelector<HTMLSpanElement>('.room-state-code')!.textContent = room.ok ? (room.loop ? 'LOOP' : 'LIVE') : 'OFF';
    item.querySelector<HTMLElement>('.room-copy strong')!.textContent = displayRoomName(room, room.room);
    item.querySelector<HTMLElement>('.room-copy small')!.textContent = `${room.room} / ${qualityNames[room.quality]}`;
    const favorite = item.querySelector<HTMLButtonElement>('.favorite-button')!;
    const isFavorite = state.favorites.has(room.room);
    favorite.classList.toggle('is-active', isFavorite);
    favorite.setAttribute('aria-pressed', String(isFavorite));
    favorite.setAttribute('aria-label', isFavorite ? '取消关注房间' : '关注房间');
    roomList.appendChild(item);
  });

  renderBulkBar(visibleRooms);
  drawIcons();
}

function renderBulkBar(visibleRooms = filteredRooms()): void {
  const bulkBar = element<HTMLDivElement>('bulk-bar');
  const selectedVisible = visibleRooms.filter((room) => state.selectedRooms.has(room.room));
  element<HTMLSpanElement>('bulk-count').textContent = `已选 ${state.selectedRooms.size} 项`;
  bulkBar.hidden = state.selectedRooms.size === 0;
  selectAll.checked = visibleRooms.length > 0 && selectedVisible.length === visibleRooms.length;
  selectAll.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleRooms.length;
}

function createStreamCard(roomId: string): HTMLElement {
  const card = document.createElement('article');
  card.className = 'stream-card';
  card.dataset.room = roomId;
  card.style.zIndex = String(++zIndexCounter);
  card.innerHTML = `
    <div class="stream-chrome-trigger" aria-hidden="true"></div>
    <div class="stream-chrome">
      <button type="button" class="drag-handle" aria-label="移动直播窗口；方向键移动，Alt 加方向键调整大小" title="拖动窗口；方向键移动；Alt+方向键调整大小"><i data-lucide="grip-vertical"></i></button>
      <div class="stream-title"><strong></strong><small></small></div>
      <span class="stream-revenue" title="礼物收入" aria-label="礼物收入"><i data-lucide="circle-dollar-sign"></i><span data-gift-revenue>CNY --</span></span>
      <span class="stream-duration">00:00:00</span>
      <label class="quality-select">
        <span class="sr-only">清晰度</span>
        <select data-quality>
          <option value="OD">原画</option>
          <option value="UHD">超清</option>
          <option value="HD">高清</option>
          <option value="SD">标清</option>
        </select>
        <i data-lucide="chevron-down"></i>
      </label>
      <button type="button" class="row-icon-button danmaku-button" data-action="toggle-danmaku" aria-label="隐藏弹幕" title="隐藏弹幕"><i data-lucide="message-circle"></i></button>
      <button type="button" class="row-icon-button mute-button" data-action="toggle-mute" aria-label="切换静音" title="切换静音"></button>
      <button type="button" class="row-icon-button close-stream-button" data-action="close-room" aria-label="关闭画面" title="关闭画面"><i data-lucide="x"></i></button>
    </div>
    <div class="video-frame">
      <div class="native-player-surface" role="img" aria-label="libmpv 直播画面"></div>
      <div class="player-state">
        <i data-lucide="activity"></i>
        <strong>等待直播流</strong>
        <span></span>
      </div>
      <div class="stream-state-tag"></div>
      <div class="video-controls" aria-label="直播播放控制">
        <button type="button" class="media-control-button" data-action="toggle-playback" aria-label="暂停" title="暂停"><i data-lucide="pause"></i></button>
        <span class="live-control-status"><span aria-hidden="true"></span>直播</span>
        <span class="video-controls-spacer"></span>
        <label class="media-quality-select">
          <span class="sr-only">清晰度</span>
          <select data-quality data-room="${roomId}" aria-label="清晰度">
            <option value="OD">原画</option>
            <option value="UHD">超清</option>
            <option value="HD">高清</option>
            <option value="SD">标清</option>
          </select>
          <i data-lucide="chevron-down"></i>
        </label>
        <button type="button" class="media-control-button media-mute-button" data-action="toggle-mute" aria-label="静音" title="静音"><i data-lucide="volume-2"></i></button>
        <label class="media-volume-control" title="音量">
          <span class="sr-only">音量</span>
          <input type="range" min="0" max="100" step="1" value="100" data-volume data-room="${roomId}" aria-label="音量" />
          <output data-volume-output data-room="${roomId}">100%</output>
        </label>
        <button type="button" class="media-control-button" data-action="fullscreen-room" aria-label="全屏" title="全屏"><i data-lucide="maximize-2"></i></button>
      </div>
    </div>
    <div class="resize-handle resize-n" data-resize="n"></div>
    <div class="resize-handle resize-s" data-resize="s"></div>
    <div class="resize-handle resize-e" data-resize="e"></div>
    <div class="resize-handle resize-w" data-resize="w"></div>
    <div class="resize-handle resize-ne" data-resize="ne"></div>
    <div class="resize-handle resize-nw" data-resize="nw"></div>
    <div class="resize-handle resize-se" data-resize="se"></div>
    <div class="resize-handle resize-sw" data-resize="sw"></div>
  `;
  const surface = card.querySelector<HTMLElement>('.native-player-surface')!;
  const player = new StreamPlayer(roomId, surface, (playerState, detail = '') => {
    playerStates.set(roomId, { state: playerState, detail });
    updatePlayerState(roomId);
    updatePlaybackControls(roomId);
  });
  players.set(roomId, player);
  player.setDanmakuSettings(state.danmakuOpacity, state.danmakuFontSize, state.danmakuArea);
  player.setDanmakuVisible(!state.danmakuHiddenRooms.has(roomId));
  card.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('.stream-chrome [data-action], .stream-chrome select, .video-controls [data-action]')) {
      event.stopPropagation();
    }
  });
  card.addEventListener('click', (event) => {
    const actionButton = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
    if (!actionButton) return;
    event.stopPropagation();
    performAction(actionButton.dataset.action ?? '', roomId);
  });
  return card;
}

function updatePlaybackControls(roomId: string): void {
  const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
  const player = players.get(roomId);
  const room = roomById(roomId);
  if (!card || !player || !room) return;
  const hasStream = room.ok && Boolean(room.url) && !demoMode;
  const paused = player.isPaused();
  const playButton = card.querySelector<HTMLButtonElement>('[data-action="toggle-playback"]')!;
  const muteButton = card.querySelector<HTMLButtonElement>('.media-mute-button')!;
  const chromeMuteButton = card.querySelector<HTMLButtonElement>('.stream-chrome [data-action="toggle-mute"]')!;

  card.classList.toggle('has-stream', hasStream);
  card.classList.toggle('is-paused', hasStream && paused);
  playButton.disabled = !hasStream;
  playButton.setAttribute('aria-label', paused ? '播放' : '暂停');
  playButton.title = paused ? '播放' : '暂停';
  setControlIcon(playButton, paused ? 'play' : 'pause');
  muteButton.disabled = !hasStream;
  muteButton.classList.toggle('is-active', player.isMuted());
  muteButton.setAttribute('aria-pressed', String(player.isMuted()));
  muteButton.setAttribute('aria-label', player.isMuted() ? '取消静音' : '静音');
  muteButton.title = player.isMuted() ? '取消静音' : '静音';
  setControlIcon(muteButton, player.isMuted() ? 'volume-x' : 'volume-2');
  chromeMuteButton.classList.toggle('is-active', player.isMuted());
  chromeMuteButton.setAttribute('aria-pressed', String(player.isMuted()));
  chromeMuteButton.setAttribute('aria-label', player.isMuted() ? '取消静音' : '静音');
  chromeMuteButton.title = player.isMuted() ? '取消静音' : '静音';
  setControlIcon(chromeMuteButton, player.isMuted() ? 'volume-x' : 'volume-2');
  updateVolumeControls(roomId, hasStream);
}

function updateVolumeControls(roomId: string, enabled = true): void {
  const volume = roomVolume(roomId);
  document.querySelectorAll<HTMLInputElement>(`input[data-volume][data-room="${CSS.escape(roomId)}"]`).forEach((input) => {
    input.value = String(volume);
    input.disabled = Boolean(input.closest('.video-controls')) && !enabled;
    input.setAttribute('aria-valuetext', `${volume}%`);
  });
  document.querySelectorAll<HTMLOutputElement>(`output[data-volume-output][data-room="${CSS.escape(roomId)}"]`).forEach((output) => {
    output.value = `${volume}%`;
  });
}

function updateGiftRevenueDisplays(): void {
  const rangeName = giftRevenueRangeNames[state.giftRevenueRange];
  videoGrid.querySelectorAll<HTMLElement>('.stream-card[data-room]').forEach((card) => {
    const roomId = card.dataset.room ?? '';
    const value = formatCny(giftRevenueCents(roomId));
    const display = card.querySelector<HTMLElement>('[data-gift-revenue]');
    const wrapper = display?.closest<HTMLElement>('.stream-revenue');
    if (display) display.textContent = value;
    const description = `礼物收入 · ${rangeName} · ${value}`;
    wrapper?.setAttribute('aria-label', description);
    if (wrapper) wrapper.title = description;
  });
}

async function loadSevenDayGiftRevenue(roomIds = state.openRooms): Promise<void> {
  if (state.giftRevenueRange !== '7d') return;
  if (demoMode) {
    demoStats.forEach((room) => sevenDayGiftTotals.set(room.rid, (room.giftTotal ?? 0) * 7));
    updateGiftRevenueDisplays();
    return;
  }

  const now = Date.now();
  const pending = roomIds.filter((roomId) => (
    !sevenDayGiftRequests.has(roomId)
    && now - (sevenDayGiftLoadedAt.get(roomId) ?? 0) >= 60000
  ));
  await Promise.all(pending.map(async (roomId) => {
    sevenDayGiftRequests.add(roomId);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const result = await getRoomTrend(roomId, controller.signal);
      const amountCny = Number(result.agg?.['7d']?.lw ?? 0);
      const paidCny = Number(result.agg?.['7d']?.sr ?? 0);
      if (Number.isFinite(amountCny) && Number.isFinite(paidCny)) {
        sevenDayGiftTotals.set(roomId, Math.max(0, Math.round(amountCny * 100)));
        sevenDayPaidGiftTotals.set(roomId, Math.max(0, Math.round(paidCny * 100)));
        sevenDayGiftLoadedAt.set(roomId, Date.now());
      }
    } catch {
      // Keep the last successful value when a room trend request is unavailable.
    } finally {
      window.clearTimeout(timeout);
      sevenDayGiftRequests.delete(roomId);
    }
  }));
  updateGiftRevenueDisplays();
}

function syncGiftSessions(rooms: StreamRoom[]): void {
  let changed = false;
  rooms.forEach((room) => {
    if (!room.ok || !room.showTime) return;
    const current = state.giftSessionTotals[room.room];
    if (!current || current.showTime !== room.showTime) {
      state.giftSessionTotals[room.room] = { showTime: room.showTime, totalCents: 0 };
      changed = true;
    }
  });
  if (changed) schedulePreferencesSave();
}

function recordRealtimeGiftRevenue(event: LiveEvent): void {
  if (event.type !== 'gift') return;
  const roomId = String(event.room ?? event.rid ?? '');
  if (!roomId) return;
  const count = Number(event.giftCount ?? event.count ?? event.gfcnt ?? 1);
  const totalCents = Number(event.totalValue ?? (Number(event.giftPrice) * count));
  if (!Number.isFinite(totalCents) || totalCents <= 0) return;

  const room = roomById(roomId);
  const showTime = room?.showTime ?? state.giftSessionTotals[roomId]?.showTime ?? 0;
  const current = state.giftSessionTotals[roomId];
  const session = !current || (showTime > 0 && current.showTime !== showTime)
    ? { showTime, totalCents: 0 }
    : current;
  session.totalCents += Math.round(totalCents);
  state.giftSessionTotals[roomId] = session;
  schedulePreferencesSave();
  if (state.giftRevenueRange === 'session') updateGiftRevenueDisplays();
}

function updatePlayerState(roomId: string): void {
  const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
  const room = roomById(roomId);
  if (!card || !room) return;
  const overlay = card.querySelector<HTMLDivElement>('.player-state')!;
  const title = overlay.querySelector<HTMLElement>('strong')!;
  const detail = overlay.querySelector<HTMLSpanElement>('span')!;
  const current = playerStates.get(roomId) ?? { state: 'idle' as PlayerState, detail: '' };

  players.get(roomId)?.setSurfaceVisible(
    current.state === 'playing' && room.ok && Boolean(room.url) && state.view === 'monitor',
  );

  overlay.hidden = current.state === 'playing';
  overlay.dataset.state = current.state;
  if (demoMode && room.ok) {
    overlay.hidden = false;
    title.textContent = '演示画面';
    detail.textContent = '未请求真实直播流';
    return;
  }
  if (!room.ok) {
    overlay.hidden = false;
    title.textContent = '当前未开播';
    detail.textContent = room.error || '检测到开播后将自动加载';
    return;
  }
  if (room.ok && !room.url) {
    overlay.hidden = false;
    title.textContent = '正在获取直播流';
    detail.textContent = room.error || '本地服务仍在解析地址';
    return;
  }
  const labels: Record<PlayerState, string> = {
    idle: '等待直播流',
    loading: '正在载入直播流',
    playing: '',
    stalled: '播放暂时中断',
    error: '直播流加载失败',
  };
  title.textContent = labels[current.state];
  detail.textContent = current.detail;
}

function updateStreamCard(card: HTMLElement, room: StreamRoom): void {
  card.classList.toggle('is-active', state.activeRoom === room.room);
  card.classList.toggle('is-live', room.ok);
  card.classList.toggle('is-free', state.layout === 'free');
  const dragHandle = card.querySelector<HTMLButtonElement>('.drag-handle')!;
  dragHandle.disabled = state.layout !== 'free';
  dragHandle.setAttribute('aria-label', state.layout === 'free'
    ? '移动直播窗口；方向键移动，Alt 加方向键调整大小'
    : '开启自由窗口后可移动直播窗口');
  dragHandle.title = state.layout === 'free'
    ? '拖动窗口；方向键移动；Alt+方向键调整大小'
    : '开启自由窗口后可拖动';
  const roomName = displayRoomName(room, room.room);
  const roomCode = `ROOM ${room.room}`;
  const title = card.querySelector<HTMLElement>('.stream-title strong')!;
  const code = card.querySelector<HTMLElement>('.stream-title small')!;
  title.textContent = roomName;
  title.title = roomName;
  code.textContent = roomCode;
  code.title = roomCode;
  card.querySelector<HTMLElement>('.stream-duration')!.textContent = room.ok ? formatDuration(room.showTime) : '00:00:00';
  const revenue = formatCny(giftRevenueCents(room.room));
  const revenueDescription = `礼物收入 · ${giftRevenueRangeNames[state.giftRevenueRange]} · ${revenue}`;
  card.querySelector<HTMLElement>('[data-gift-revenue]')!.textContent = revenue;
  const revenueWrapper = card.querySelector<HTMLElement>('.stream-revenue')!;
  revenueWrapper.title = revenueDescription;
  revenueWrapper.setAttribute('aria-label', revenueDescription);
  const tag = card.querySelector<HTMLElement>('.stream-state-tag')!;
  tag.textContent = roomStateText(room);
  tag.dataset.state = room.ok ? (room.loop ? 'loop' : 'live') : 'offline';
  card.querySelectorAll<HTMLSelectElement>('[data-quality]').forEach((quality) => {
    quality.value = room.quality;
  });
  const muted = state.mutedRooms.has(room.room);
  const muteButton = card.querySelector<HTMLButtonElement>('.stream-chrome [data-action="toggle-mute"]')!;
  muteButton.innerHTML = muted ? '<i data-lucide="volume-x"></i>' : '<i data-lucide="volume-2"></i>';
  muteButton.classList.toggle('is-active', muted);
  muteButton.setAttribute('aria-pressed', String(muted));
  muteButton.setAttribute('aria-label', muted ? '取消静音' : '静音');
  muteButton.title = muted ? '取消静音' : '静音';
  players.get(room.room)?.setVolume(roomVolume(room.room) / 100);
  players.get(room.room)?.setMuted(muted);
  players.get(room.room)?.setDanmakuVisible(!state.danmakuHiddenRooms.has(room.room));
  players.get(room.room)?.setDanmakuSettings(
    state.danmakuOpacity,
    state.danmakuFontSize,
    state.danmakuArea,
  );

  updateDanmakuControl(room.room);

  if (!room.ok || !room.url || demoMode) {
    players.get(room.room)?.unload();
    playerStates.set(room.room, { state: 'idle', detail: '' });
  } else {
    players.get(room.room)?.load(room.url);
  }
  updatePlayerState(room.room);
  updatePlaybackControls(room.room);
}

const minimumWindowWidth = 320;
const minimumWindowHeight = 220;
const windowGap = 8;

function clampWindowRect(rect: StreamWindowRect): StreamWindowRect {
  const widthLimit = Math.max(240, videoGrid.clientWidth - windowGap * 2);
  const heightLimit = Math.max(180, videoGrid.clientHeight - windowGap * 2);
  const minimumWidth = Math.min(minimumWindowWidth, widthLimit);
  const minimumHeight = Math.min(minimumWindowHeight, heightLimit);
  const width = Math.min(Math.max(rect.width, minimumWidth), widthLimit);
  const height = Math.min(Math.max(rect.height, minimumHeight), heightLimit);
  return {
    x: Math.min(Math.max(rect.x, windowGap), Math.max(windowGap, videoGrid.clientWidth - width - windowGap)),
    y: Math.min(Math.max(rect.y, windowGap), Math.max(windowGap, videoGrid.clientHeight - height - windowGap)),
    width,
    height,
  };
}

function defaultWindowRect(index: number): StreamWindowRect {
  const width = Math.min(560, Math.max(minimumWindowWidth, videoGrid.clientWidth * 0.62));
  const height = Math.min(360, Math.max(minimumWindowHeight, videoGrid.clientHeight * 0.58));
  const offset = (index % 8) * 24;
  return clampWindowRect({ x: windowGap + offset, y: windowGap + offset, width, height });
}

function applyWindowRect(card: HTMLElement, roomId: string, rect: StreamWindowRect, remember = true): void {
  const next = clampWindowRect(rect);
  if (remember) state.windowRects[roomId] = next;
  card.style.width = `${Math.round(next.width)}px`;
  card.style.height = `${Math.round(next.height)}px`;
  card.style.transform = `translate3d(${Math.round(next.x)}px, ${Math.round(next.y)}px, 0)`;
}

function arrangeWindows(layout: Exclude<LayoutMode, 'free'>, persist = true): void {
  const roomIds = state.openRooms.filter((roomId) => roomById(roomId));
  if (roomIds.length === 0 || videoGrid.clientWidth === 0 || videoGrid.clientHeight === 0) return;
  const availableWidth = Math.max(1, videoGrid.clientWidth - windowGap * 2);
  const availableHeight = Math.max(1, videoGrid.clientHeight - windowGap * 2);

  if (layout === 'focus' && roomIds.length > 1) {
    const focusId = state.activeRoom && roomIds.includes(state.activeRoom) ? state.activeRoom : roomIds[0]!;
    const sideIds = roomIds.filter((roomId) => roomId !== focusId);
    const focusWidth = Math.max(minimumWindowWidth, Math.floor(availableWidth * 0.68));
    const sideWidth = Math.max(240, availableWidth - focusWidth - windowGap);
    applyWindowRect(videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${focusId}"]`)! , focusId, {
      x: windowGap,
      y: windowGap,
      width: focusWidth,
      height: availableHeight,
    }, false);
    const sideHeight = (availableHeight - windowGap * Math.max(0, sideIds.length - 1)) / sideIds.length;
    sideIds.forEach((roomId, index) => {
      const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
      if (!card) return;
      applyWindowRect(card, roomId, {
        x: windowGap + focusWidth + windowGap,
        y: windowGap + index * (sideHeight + windowGap),
        width: sideWidth,
        height: sideHeight,
      }, false);
    });
  } else {
    const requestedColumns = layout === 'auto'
      ? Math.ceil(Math.sqrt(roomIds.length * Math.max(0.7, availableWidth / Math.max(availableHeight, 1)) * 0.72))
      : Number(layout);
    const columns = Math.max(1, Math.min(roomIds.length, Number.isFinite(requestedColumns) ? requestedColumns : 1));
    const rows = Math.ceil(roomIds.length / columns);
    const cellWidth = (availableWidth - windowGap * (columns - 1)) / columns;
    const cellHeight = (availableHeight - windowGap * (rows - 1)) / rows;
    roomIds.forEach((roomId, index) => {
      const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
      if (!card) return;
      const column = index % columns;
      const row = Math.floor(index / columns);
      applyWindowRect(card, roomId, {
        x: windowGap + column * (cellWidth + windowGap),
        y: windowGap + row * (cellHeight + windowGap),
        width: cellWidth,
        height: cellHeight,
      }, false);
    });
  }
  if (persist) savePreferences();
}

function constrainAllWindows(): void {
  if (state.layout !== 'free') {
    arrangeWindows(state.layout, false);
    return;
  }
  state.openRooms.forEach((roomId, index) => {
    const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
    if (!card) return;
    applyWindowRect(card, roomId, state.windowRects[roomId] ?? defaultWindowRect(index));
  });
}

function bringWindowToFront(card: HTMLElement): void {
  card.style.zIndex = String(++zIndexCounter);
  const roomId = card.dataset.room;
  if (roomId) players.get(roomId)?.bringToFront();
}

function renderCanvas(): void {
  videoGrid.dataset.layout = state.layout;
  freeWindowToggle.checked = state.layout === 'free';
  freeWindowToggle.setAttribute('aria-checked', String(freeWindowToggle.checked));
  document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach((button) => {
    const selected = button.dataset.layout === state.layout;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });

  [...videoGrid.querySelectorAll<HTMLElement>('.stream-card')].forEach((card) => {
    const roomId = card.dataset.room ?? '';
    if (!state.openRooms.includes(roomId)) {
      players.get(roomId)?.destroy();
      players.delete(roomId);
      playerStates.delete(roomId);
      card.remove();
    }
  });

  state.openRooms.forEach((roomId) => {
    const room = roomById(roomId);
    if (!room) return;
    let card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
    if (!card) {
      card = createStreamCard(roomId);
      videoGrid.appendChild(card);
    }
    updateStreamCard(card, room);
  });

  const openCount = state.openRooms.filter((roomId) => roomById(roomId)).length;
  element<HTMLSpanElement>('canvas-count').textContent = `${openCount} 路已打开`;
  canvasEmpty.hidden = openCount > 0;
  videoGrid.hidden = openCount === 0;
  if (openCount > 0) {
    if (state.layout === 'free') constrainAllWindows();
    else arrangeWindows(state.layout, false);
  }
  void applyMultiRoomQualityPolicy();
  drawIcons();
}

function updateDanmakuControl(roomId: string): void {
  const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
  if (!card) return;
  const visible = !state.danmakuHiddenRooms.has(roomId);
  const connection = danmakuStates.get(roomId);
  const button = card.querySelector<HTMLButtonElement>('[data-action="toggle-danmaku"]');
  if (!button) return;
  button.classList.toggle('is-active', visible);
  button.classList.toggle('is-connected', visible && Boolean(connection?.ok));
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', visible ? '隐藏弹幕' : '显示弹幕');
  button.title = visible ? (connection?.text || '隐藏弹幕') : '显示弹幕';
  players.get(roomId)?.setDanmakuVisible(visible);
}

function renderInspector(): void {
  const roomId = state.activeRoom;
  const room = roomId ? roomById(roomId) : undefined;
  inspectorContent.replaceChildren();
  if (!room) {
    inspectorContent.innerHTML = `
      <div class="inspector-empty">
        <i data-lucide="panel-right-open"></i>
        <strong>没有选中房间</strong>
        <span>选择队列或画布中的房间查看运行信息。</span>
      </div>
    `;
    drawIcons();
    return;
  }

  const header = document.createElement('div');
  header.className = 'inspector-room-header';
  header.innerHTML = `
    <div class="inspector-room-title"><span class="room-code"></span><h3></h3><p></p></div>
    <button type="button" class="row-icon-button" data-action="toggle-favorite" aria-label="关注房间" title="关注房间"><i data-lucide="star"></i></button>
  `;
  header.querySelector<HTMLElement>('.room-code')!.textContent = room.ok ? (room.loop ? 'LOOP' : 'LIVE') : 'OFF';
  header.querySelector<HTMLElement>('h3')!.textContent = displayRoomName(room, room.room);
  header.querySelector<HTMLElement>('p')!.textContent = `ROOM ${room.room}`;
  const favorite = header.querySelector<HTMLButtonElement>('[data-action="toggle-favorite"]')!;
  favorite.dataset.room = room.room;
  favorite.classList.toggle('is-active', state.favorites.has(room.room));
  favorite.setAttribute('aria-pressed', String(state.favorites.has(room.room)));
  inspectorContent.appendChild(header);

  const facts = document.createElement('dl');
  facts.className = 'fact-grid';
  const factItems = [
    ['运行状态', roomStateText(room)],
    ['开播时长', room.ok ? formatDuration(room.showTime) : '未计时'],
    ['当前清晰度', qualityNames[room.quality]],
    ['弹幕通道', danmakuStates.get(room.room)?.text ?? '正在连接'],
  ];
  factItems.forEach(([label, value]) => {
    const wrapper = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label ?? '';
    description.textContent = value ?? '';
    wrapper.append(term, description);
    facts.appendChild(wrapper);
  });
  inspectorContent.appendChild(facts);

  if (room.error) {
    const error = document.createElement('div');
    error.className = 'inline-alert';
    error.setAttribute('role', 'alert');
    error.innerHTML = '<i data-lucide="circle-alert"></i><div><strong>直播流异常</strong><span></span></div>';
    error.querySelector('span')!.textContent = room.error;
    inspectorContent.appendChild(error);
  }

  const controls = document.createElement('section');
  controls.className = 'inspector-section';
  controls.innerHTML = `
    <h3>播放控制</h3>
    <label class="field-label" for="inspector-quality">清晰度</label>
    <div class="select-field">
      <select id="inspector-quality" data-quality data-room="${room.room}">
        <option value="OD">原画</option>
        <option value="UHD">超清</option>
        <option value="HD">高清</option>
        <option value="SD">标清</option>
      </select>
      <i data-lucide="chevron-down"></i>
    </div>
    <div class="inspector-volume-control">
      <label class="field-label" for="inspector-volume">音量 <output data-volume-output data-room="${room.room}">${roomVolume(room.room)}%</output></label>
      <input id="inspector-volume" type="range" min="0" max="100" step="1" value="${roomVolume(room.room)}" data-volume data-room="${room.room}" aria-label="音量" />
    </div>
    <div class="inspector-actions">
      <button type="button" class="secondary-button" data-action="refresh-room" data-room="${room.room}"><i data-lucide="refresh-cw"></i><span>刷新流</span></button>
      <button type="button" class="secondary-button" data-action="toggle-mute" data-room="${room.room}"><i data-lucide="${state.mutedRooms.has(room.room) ? 'volume-2' : 'volume-x'}"></i><span>${state.mutedRooms.has(room.room) ? '取消静音' : '静音'}</span></button>
    </div>
    <button type="button" class="remove-room-button" data-action="remove-room" data-room="${room.room}"><i data-lucide="trash-2"></i><span>从监控列表移除</span></button>
  `;
  controls.querySelector<HTMLSelectElement>('[data-quality]')!.value = room.quality;
  inspectorContent.appendChild(controls);
  updateVolumeControls(room.room, room.ok && Boolean(room.url) && !demoMode);

  const eventSection = document.createElement('section');
  eventSection.className = 'inspector-section event-section';
  eventSection.innerHTML = `
    <div class="event-tabs" role="tablist" aria-label="房间事件">
      <button type="button" role="tab" data-event-feed="chat">弹幕</button>
      <button type="button" role="tab" data-event-feed="gift">礼物</button>
      <span></span>
    </div>
    <div class="event-list" role="tabpanel"></div>
  `;
  eventSection.querySelectorAll<HTMLButtonElement>('[data-event-feed]').forEach((button) => {
    const active = button.dataset.eventFeed === state.inspectorFeed;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  const source = state.inspectorFeed === 'gift' ? giftEvents : chatEvents;
  const roomEvents = source
    .filter((event) => String(event.room ?? event.rid ?? '') === room.room)
    .filter((event) => state.inspectorFeed !== 'gift' || state.includeFreeGifts || !isFreeGift(event))
    .slice(0, 50);
  eventSection.querySelector<HTMLElement>('.event-tabs span')!.textContent = `${roomEvents.length} 条`;
  const eventList = eventSection.querySelector<HTMLDivElement>('.event-list')!;
  if (roomEvents.length === 0) {
    eventList.innerHTML = `<div class="event-empty">等待${state.inspectorFeed === 'gift' ? '礼物' : '弹幕'}事件</div>`;
  } else {
    roomEvents.forEach((event) => eventList.appendChild(createEventRow(event)));
  }
  inspectorContent.appendChild(eventSection);
  drawIcons();
}

function createEventRow(event: LiveEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = `event-row is-${event.type === 'gift' ? 'gift' : 'chat'}`;
  row.innerHTML = '<time></time><div><strong></strong><span></span></div>';
  row.querySelector('time')!.textContent = formatEventTime(event.time);
  row.querySelector('strong')!.textContent = event.sender || event.nn || event.name || '匿名用户';
  const giftCount = event.giftCount ?? event.count ?? event.gfcnt ?? 1;
  const amount = Number(event.totalValue ?? 0);
  const message = event.type === 'gift'
    ? `${event.giftName || event.gfname || '礼物'} x${giftCount}${amount > 0 ? ` · ${formatMoney(amount / 100)}` : ' · 免费'}`
    : event.text || event.txt || '新弹幕';
  row.querySelector('span')!.textContent = message;
  return row;
}

function renderAnalytics(): void {
  const rooms = [...state.stats].sort((left, right) => (right.hot ?? 0) - (left.hot ?? 0));
  const totals = [
    ['监控房间', formatInteger(rooms.length), '当前统计范围'],
    ['正在直播', formatInteger(rooms.filter((room) => room.live).length), '实时房间'],
    ['总热度', formatInteger(rooms.reduce((sum, room) => sum + (room.hot ?? 0), 0)), '房间热度合计'],
    ['礼物金额', formatMoney(rooms.reduce((sum, room) => sum + statsGiftAmount(room), 0)), state.includeFreeGifts ? '包含免费礼物' : '仅付费礼物'],
  ];
  metricStrip.replaceChildren();
  totals.forEach(([label, value, detail]) => {
    const metric = document.createElement('div');
    metric.className = 'metric-cell';
    metric.innerHTML = '<span></span><strong></strong><small></small>';
    metric.querySelector('span')!.textContent = label ?? '';
    metric.querySelector('strong')!.textContent = value ?? '';
    metric.querySelector('small')!.textContent = detail ?? '';
    metricStrip.appendChild(metric);
  });

  analyticsBody.replaceChildren();
  analyticsEmpty.hidden = rooms.length > 0;
  if (rooms.length === 0) {
    drawIcons();
    return;
  }
  rooms.forEach((room) => {
    const row = document.createElement('tr');
    const cells = [
      room.name || `房间 ${room.rid}`,
      room.live ? '直播中' : '未开播',
      formatInteger(room.hot),
      formatInteger(room.activeUV),
      formatInteger((room.chatUV ?? 0) + (room.giftUV ?? 0)),
      formatMoney(statsGiftAmount(room)),
    ];
    cells.forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) {
        cell.setAttribute('scope', 'row');
        const name = document.createElement('strong');
        const id = document.createElement('small');
        name.textContent = value;
        id.textContent = `ROOM ${room.rid}`;
        cell.append(name, id);
      } else {
        cell.textContent = value;
      }
      if (index === 1) cell.className = room.live ? 'status-live' : 'status-offline';
      row.appendChild(cell);
    });
    row.dataset.room = room.rid;
    row.tabIndex = 0;
    row.title = '查看房间';
    analyticsBody.appendChild(row);
  });
}

function renderView(): void {
  element<HTMLDivElement>('monitor-view').hidden = state.view !== 'monitor';
  element<HTMLDivElement>('analytics-view').hidden = state.view !== 'analytics';
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  state.openRooms.forEach((roomId) => updatePlayerState(roomId));
}

function renderAll(): void {
  renderHeader();
  renderRoomList();
  renderCanvas();
  renderInspector();
  renderAnalytics();
  renderView();
}

async function loadRooms(silent = false): Promise<boolean> {
  if (demoMode) {
    state.rooms = [...demoRooms];
    state.stats = [...demoStats];
    state.rooms.forEach((room) => runtimeFor(room.room, room.quality));
    syncGiftSessions(state.rooms);
    state.service = 'online';
    state.serviceMessage = '演示服务正常';
    state.lastUpdatedAt = Date.now();
    renderAll();
    return true;
  }

  if (streamsRequest) return streamsRequest;
  const controller = new AbortController();
  streamsAbort = controller;
  const run = async (): Promise<boolean> => {
    try {
      const rooms = await getStreams(controller.signal);
      state.rooms = rooms;
      const validRoomIds = new Set(rooms.map((room) => room.room));
      rooms.forEach((room) => runtimeFor(room.room, room.quality));
      [...roomRuntime.keys()].forEach((roomId) => {
        if (!validRoomIds.has(roomId)) roomRuntime.delete(roomId);
      });
      syncGiftSessions(rooms);
      state.openRooms = state.openRooms.filter((roomId) => validRoomIds.has(roomId));
      if (state.activeRoom && !validRoomIds.has(state.activeRoom)) {
        state.activeRoom = state.openRooms[0] ?? rooms[0]?.room ?? null;
      }
      state.lastUpdatedAt = Date.now();
      if (state.service === 'offline' || state.service === 'checking') {
        state.service = 'online';
        state.serviceMessage = '本地服务正常';
      }
      savePreferences();
      renderAll();
      connectDanmaku();
      void applyMultiRoomQualityPolicy();
      return true;
    } catch (error) {
      if (controller.signal.aborted) return false;
      state.service = 'offline';
      state.serviceMessage = '本地服务未连接';
      renderHeader();
      if (!silent) toast(error instanceof Error ? error.message : '读取房间失败', 'error');
      return false;
    } finally {
      if (streamsAbort === controller) streamsAbort = null;
      streamsRequest = null;
    }
  };
  streamsRequest = run();
  return streamsRequest;
}

async function runRoomRefreshScheduler(): Promise<void> {
  window.clearTimeout(roomRefreshTimer);
  if (document.hidden || state.rooms.length === 0) {
    roomRefreshTimer = window.setTimeout(() => void runRoomRefreshScheduler(), 3000);
    return;
  }
  const now = Date.now();
  const due = state.rooms.filter((room) => runtimeFor(room.room, room.quality).nextRefreshAt <= now);
  if (due.length > 0) {
    const success = await loadRooms(true);
    due.forEach((room) => setNextRoomRefresh(runtimeFor(room.room, room.quality), success));
  }
  const nextAt = Math.min(...state.rooms.map((room) => runtimeFor(room.room, room.quality).nextRefreshAt));
  const delay = Number.isFinite(nextAt) ? Math.min(3000, Math.max(350, nextAt - Date.now())) : 2000;
  roomRefreshTimer = window.setTimeout(() => void runRoomRefreshScheduler(), delay);
}

async function checkService(): Promise<void> {
  if (demoMode) return;
  statusAbort?.abort();
  const controller = new AbortController();
  statusAbort = controller;
  try {
    const result = await getServiceStatus(controller.signal);
    if (result.service === 'ok' && result.douyu !== false) {
      state.service = 'online';
      state.serviceMessage = '本地服务正常';
    } else if (result.service === 'ok') {
      state.service = 'degraded';
      state.serviceMessage = '斗鱼接口异常';
    } else {
      state.service = 'offline';
      state.serviceMessage = '本地服务异常';
    }
  } catch {
    if (controller.signal.aborted) return;
    state.service = 'offline';
    state.serviceMessage = '本地服务未连接';
  }
  renderHeader();
}

async function loadAnalytics(silent = false): Promise<void> {
  if (demoMode) {
    state.stats = [...demoStats];
    mergeStatsGiftEvents(state.stats);
    element<HTMLSpanElement>('analytics-updated').textContent = '演示数据';
    renderAnalytics();
    updateGiftRevenueDisplays();
    void loadSevenDayGiftRevenue();
    return;
  }
  statsAbort?.abort();
  const controller = new AbortController();
  statsAbort = controller;
  try {
    const result = await getStats(controller.signal);
    state.stats = result.rooms ?? [];
    mergeStatsGiftEvents(state.stats);
    element<HTMLSpanElement>('analytics-updated').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    renderAnalytics();
    if (state.inspectorFeed === 'gift') renderInspector();
    updateGiftRevenueDisplays();
    void loadSevenDayGiftRevenue();
  } catch (error) {
    if (controller.signal.aborted) return;
    element<HTMLSpanElement>('analytics-updated').textContent = '同步失败';
    if (!silent) toast(error instanceof Error ? error.message : '统计数据同步失败', 'error');
  }
}

function connectDanmaku(): void {
  if (demoMode) {
    state.eventState = 'online';
    renderInspector();
    return;
  }
  if (state.openRooms.length === 0) {
    state.eventState = 'idle';
    renderInspector();
    return;
  }
  state.eventState = 'connecting';
  state.openRooms.forEach((roomId) => {
    if (!danmakuStates.has(roomId)) danmakuStates.set(roomId, { ok: false, text: '正在连接' });
    updateDanmakuControl(roomId);
  });
  renderInspector();
}

function updateDanmakuSummary(): void {
  const current = state.openRooms.map((roomId) => danmakuStates.get(roomId));
  if (current.length === 0) state.eventState = 'idle';
  else if (current.every((item) => item?.ok)) state.eventState = 'online';
  else if (current.some((item) => item?.text.includes('重连'))) state.eventState = 'retrying';
  else state.eventState = 'connecting';
}

function handleNativePlayerEvent(event: NativePlayerEvent): void {
  const roomId = String(event.roomId ?? '');
  if (!roomId) return;
  if (event.event === 'danmaku-state') {
    const stateName = String(event.state ?? 'connecting');
    const endpoint = event.endpoint ? ` · ${event.endpoint}` : '';
    const labels: Record<string, string> = {
      online: `已连接${endpoint}`,
      retrying: `重连中${endpoint}`,
      connecting: `正在连接${endpoint}`,
      offline: '未连接',
    };
    danmakuStates.set(roomId, { ok: stateName === 'online', text: labels[stateName] ?? '正在连接' });
    updateDanmakuSummary();
    updateDanmakuControl(roomId);
    if (state.activeRoom === roomId) renderInspector();
    return;
  }
  if (event.event !== 'danmaku' || (event.type !== 'chat' && event.type !== 'gift')) return;
  const liveEvent: LiveEvent = event.type === 'gift'
    ? {
        type: 'gift', room: roomId, sender: event.sender,
        giftName: event.giftId ? `礼物 ${event.giftId}` : '礼物',
        giftCount: Number(event.giftCount ?? 1), totalValue: 0, time: event.time,
      }
    : { type: 'chat', room: roomId, sender: event.sender, text: event.text, col: event.color, time: event.time };
  if (addLiveEvent(liveEvent) && state.activeRoom === roomId) renderInspector();
}

const unsubscribeNativePlayerEvents = subscribeNativePlayerEvents(handleNativePlayerEvent);

function connectStatsEvents(): void {
  if (demoMode || statsEventSource) return;
  const source = new EventSource('/api/events');
  statsEventSource = source;
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as LiveEvent;
      if (event.type !== 'gift') return;
      recordRealtimeGiftRevenue(event);
      addLiveEvent(event);
      const roomId = String(event.room ?? event.rid ?? '');
      if (state.activeRoom === roomId) renderInspector();
    } catch {
      // Ignore malformed third-party event payloads.
    }
  };
}

function openRoom(roomId: string): void {
  if (!state.openRooms.includes(roomId)) state.openRooms.push(roomId);
  state.activeRoom = roomId;
  savePreferences();
  renderRoomList();
  renderCanvas();
  renderInspector();
  connectDanmaku();
  void loadSevenDayGiftRevenue([roomId]);
  document.body.classList.remove('room-drawer-open');
}

function closeRoom(roomId: string): void {
  state.openRooms = state.openRooms.filter((id) => id !== roomId);
  players.get(roomId)?.destroy();
  players.delete(roomId);
  playerStates.delete(roomId);
  danmakuStates.delete(roomId);
  if (state.activeRoom === roomId) state.activeRoom = state.openRooms[0] ?? null;
  savePreferences();
  renderRoomList();
  renderCanvas();
  renderInspector();
  connectDanmaku();
}

function toggleRoom(roomId: string): void {
  if (state.openRooms.includes(roomId)) {
    state.activeRoom = roomId;
    renderRoomList();
    renderCanvas();
    renderInspector();
    document.body.classList.add('inspector-open');
  } else {
    openRoom(roomId);
  }
}

function toggleFavorite(roomId: string): void {
  if (state.favorites.has(roomId)) state.favorites.delete(roomId);
  else state.favorites.add(roomId);
  savePreferences();
  renderRoomList();
  renderInspector();
}

function toggleMute(roomId: string): void {
  if (state.mutedRooms.has(roomId)) {
    state.openRooms.forEach((id) => {
      if (id !== roomId) {
        state.mutedRooms.add(id);
        players.get(id)?.setMuted(true);
      }
    });
    state.mutedRooms.delete(roomId);
    if (roomVolume(roomId) === 0) state.roomVolumes[roomId] = 50;
  } else {
    state.mutedRooms.add(roomId);
  }
  players.get(roomId)?.setVolume(roomVolume(roomId) / 100);
  players.get(roomId)?.setMuted(state.mutedRooms.has(roomId));
  savePreferences();
  renderCanvas();
  renderInspector();
}

function setRoomVolume(roomId: string, value: number): void {
  if (!roomId || !Number.isFinite(value)) return;
  const volume = Math.round(Math.min(100, Math.max(0, value)));
  state.roomVolumes[roomId] = volume;
  if (volume === 0) state.mutedRooms.add(roomId);
  else {
    state.openRooms.forEach((id) => {
      if (id !== roomId) {
        state.mutedRooms.add(id);
        players.get(id)?.setMuted(true);
      }
    });
    state.mutedRooms.delete(roomId);
  }
  const player = players.get(roomId);
  player?.setVolume(volume / 100);
  player?.setMuted(volume === 0);
  savePreferences();
  updatePlaybackControls(roomId);

  if (state.activeRoom === roomId) {
    const inspectorMute = inspectorContent.querySelector<HTMLButtonElement>('[data-action="toggle-mute"]');
    if (inspectorMute) {
      inspectorMute.innerHTML = `<i data-lucide="${volume === 0 ? 'volume-2' : 'volume-x'}"></i><span>${volume === 0 ? '取消静音' : '静音'}</span>`;
      drawIcons();
    }
  }
}

function togglePlayback(roomId: string): void {
  const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
  const player = players.get(roomId);
  if (!player || !card?.classList.contains('has-stream')) return;
  player.setPaused(!player.isPaused());
  updatePlaybackControls(roomId);
}

function fullscreenRoom(roomId: string): void {
  const frame = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"] .video-frame`);
  if (!frame) return;
  void frame.requestFullscreen().catch(() => toast('当前环境无法进入全屏', 'error'));
}

function toggleDanmaku(roomId: string): void {
  if (state.danmakuHiddenRooms.has(roomId)) state.danmakuHiddenRooms.delete(roomId);
  else state.danmakuHiddenRooms.add(roomId);
  savePreferences();
  updateDanmakuControl(roomId);
}

async function refreshAll(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('[data-action="refresh-all"]');
  button?.classList.add('is-busy');
  try {
    players.forEach((player) => player.expectNextUrl());
    if (!demoMode) await refreshStreams();
    await loadRooms(true);
    toast('直播流地址已刷新', 'success');
  } catch (error) {
    toast(error instanceof Error ? error.message : '刷新失败', 'error');
  } finally {
    button?.classList.remove('is-busy');
  }
}

async function changeQuality(roomId: string, quality: Quality, automatic = false): Promise<void> {
  const room = roomById(roomId);
  if (!room) return;
  const runtime = runtimeFor(roomId, room.quality);
  if (!automatic) runtime.requestedQuality = quality;
  if (runtime.qualityPending || room.quality === quality) {
    if (!automatic) runtime.automaticQuality = false;
    return;
  }
  const previous = room.quality;
  runtime.qualityPending = true;
  room.quality = quality;
  players.get(roomId)?.expectNextUrl();
  renderCanvas();
  renderInspector();
  try {
    if (!demoMode) await setRoomQuality(roomId, quality);
    runtime.automaticQuality = automatic && quality === 'SD';
    if (!automatic) toast(`${displayRoomName(room, roomId)} 已切换为${qualityNames[quality]}`, 'success');
    if (!demoMode) window.setTimeout(() => void loadRooms(true), 1400);
  } catch (error) {
    room.quality = previous;
    renderCanvas();
    renderInspector();
    if (!automatic) toast(error instanceof Error ? error.message : '清晰度切换失败', 'error');
  } finally {
    runtime.qualityPending = false;
  }
}

async function applyMultiRoomQualityPolicy(): Promise<void> {
  const openRoomIds = state.openRooms.filter((roomId) => roomById(roomId));
  const primaryRoom = state.activeRoom ?? openRoomIds[0];
  const shouldReduce = openRoomIds.length >= 5;
  await Promise.all(openRoomIds.map(async (roomId) => {
    const room = roomById(roomId);
    if (!room) return;
    const runtime = runtimeFor(roomId, room.quality);
    const isSecondary = shouldReduce && roomId !== primaryRoom;
    if (isSecondary) {
      if (!runtime.automaticQuality) runtime.requestedQuality = room.quality;
      if (room.quality !== 'SD' && !runtime.qualityPending) await changeQuality(roomId, 'SD', true);
      return;
    }
    if (runtime.automaticQuality && room.quality !== runtime.requestedQuality && !runtime.qualityPending) {
      await changeQuality(roomId, runtime.requestedQuality, true);
      runtime.automaticQuality = false;
    }
  }));
}

function askToRemove(roomIds: string[]): void {
  pendingRemovalIds = [...new Set(roomIds)];
  if (pendingRemovalIds.length === 0) return;
  element<HTMLHeadingElement>('confirm-title').textContent = pendingRemovalIds.length === 1
    ? '移除这个房间?'
    : `移除 ${pendingRemovalIds.length} 个房间?`;
  element<HTMLParagraphElement>('confirm-description').textContent = '这些房间将从本地服务的监控列表中移除。';
  confirmDialog.showModal();
}

async function confirmRemoval(): Promise<void> {
  const roomIds = [...pendingRemovalIds];
  pendingRemovalIds = [];
  try {
    if (!demoMode) await Promise.all(roomIds.map((roomId) => removeRoomRequest(roomId)));
    roomIds.forEach((roomId) => {
      state.rooms = state.rooms.filter((room) => room.room !== roomId);
      state.selectedRooms.delete(roomId);
      closeRoom(roomId);
    });
    renderAll();
    toast(`已移除 ${roomIds.length} 个房间`, 'success');
  } catch (error) {
    toast(error instanceof Error ? error.message : '移除房间失败', 'error');
    await loadRooms(true);
  }
}

async function submitRoom(): Promise<void> {
  const roomId = roomInput.value.trim();
  roomInputError.textContent = '';
  roomInput.removeAttribute('aria-invalid');
  if (!/^\d+$/.test(roomId)) {
    roomInputError.textContent = '请输入数字房间号。';
    roomInput.setAttribute('aria-invalid', 'true');
    roomInput.focus();
    return;
  }
  const existing = roomById(roomId);
  if (existing) {
    roomInput.value = '';
    openRoom(roomId);
    toast('房间已在队列中');
    return;
  }

  const submit = addRoomForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  submit.disabled = true;
  submit.classList.add('is-busy');
  const pending: StreamRoom = { room: roomId, name: '', ok: false, loop: false, url: '', showTime: 0, quality: 'HD', error: '正在解析房间信息' };
  state.rooms.push(pending);
  openRoom(roomId);
  try {
    if (!demoMode) await addRoomRequest(roomId);
    roomInput.value = '';
    toast(`房间 ${roomId} 已加入队列`, 'success');
    if (!demoMode) window.setTimeout(() => void loadRooms(true), 1200);
  } catch (error) {
    state.rooms = state.rooms.filter((room) => room.room !== roomId);
    closeRoom(roomId);
    roomInputError.textContent = error instanceof Error ? error.message : '添加房间失败。';
    roomInput.setAttribute('aria-invalid', 'true');
  } finally {
    submit.disabled = false;
    submit.classList.remove('is-busy');
    renderAll();
  }
}

function switchView(view: AppView): void {
  state.view = view;
  renderView();
  if (view === 'analytics') void loadAnalytics(true);
}

function setLayout(layout: LayoutMode): void {
  if (layout !== 'free') state.lastPresetLayout = layout;
  state.layout = layout;
  renderCanvas();
  savePreferences();
}

function renderCommands(query = ''): void {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  const commands = [
    { id: 'monitor', icon: 'monitor', label: '打开直播监控', run: () => switchView('monitor') },
    { id: 'analytics', icon: 'bar-chart-3', label: '打开运行数据', run: () => switchView('analytics') },
    { id: 'refresh', icon: 'refresh-cw', label: '刷新全部直播流', run: () => void refreshAll() },
    { id: 'mute', icon: 'volume-x', label: '静音全部画面', run: () => muteAll() },
    { id: 'focus', icon: 'focus', label: '切换重点布局', run: () => setLayout('focus') },
    { id: 'queue', icon: 'list-filter', label: '显示房间队列', run: () => {
      if (desktopQueueMedia.matches) {
        state.queueCollapsed = false;
        savePreferences();
        applyPanelVisibility();
      } else {
        document.body.classList.add('room-drawer-open');
      }
    } },
  ].filter((command) => command.label.toLocaleLowerCase('zh-CN').includes(normalized));
  const results = element<HTMLDivElement>('command-results');
  results.replaceChildren();
  commands.forEach((command, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.command = command.id;
    button.innerHTML = `<i data-lucide="${command.icon}"></i><span></span><i data-lucide="check" class="command-check"></i>`;
    button.querySelector('span')!.textContent = command.label;
    if (index === 0) button.classList.add('is-current');
    button.addEventListener('click', () => {
      commandDialog.close();
      command.run();
    });
    results.appendChild(button);
  });
  if (commands.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'command-empty';
    empty.textContent = '没有匹配的操作';
    results.appendChild(empty);
  }
  drawIcons();
}

function openCommandDialog(): void {
  renderCommands();
  commandDialog.showModal();
  commandInput.value = '';
  window.setTimeout(() => commandInput.focus(), 0);
}

function muteAll(): void {
  const allMuted = state.openRooms.length > 0 && state.openRooms.every((roomId) => state.mutedRooms.has(roomId));
  state.openRooms.forEach((roomId) => {
    if (allMuted) state.mutedRooms.delete(roomId);
    else state.mutedRooms.add(roomId);
    players.get(roomId)?.setMuted(!allMuted);
  });
  savePreferences();
  renderCanvas();
  renderInspector();
  toast(allMuted ? '已取消全部静音' : '已将全部画面静音');
}

function performAction(action: string, roomId: string): void {
  switch (action) {
    case 'toggle-room':
      toggleRoom(roomId);
      break;
    case 'close-room':
      closeRoom(roomId);
      break;
    case 'toggle-favorite':
      toggleFavorite(roomId);
      break;
    case 'toggle-mute':
      toggleMute(roomId);
      break;
    case 'toggle-danmaku':
      toggleDanmaku(roomId);
      break;
    case 'toggle-playback':
      void togglePlayback(roomId);
      break;
    case 'fullscreen-room':
      fullscreenRoom(roomId);
      break;
    case 'open-danmaku-settings':
      openDanmakuSettings();
      break;
    case 'refresh-room':
    case 'refresh-all':
      void refreshAll();
      break;
    case 'remove-room':
      askToRemove([roomId]);
      break;
    case 'open-selected':
      [...state.selectedRooms].forEach(openRoom);
      state.selectedRooms.clear();
      renderRoomList();
      break;
    case 'mute-selected':
      [...state.selectedRooms].forEach((id) => {
        state.mutedRooms.add(id);
        players.get(id)?.setMuted(true);
      });
      savePreferences();
      renderCanvas();
      renderInspector();
      toast(`已静音 ${state.selectedRooms.size} 个房间`);
      break;
    case 'remove-selected':
      askToRemove([...state.selectedRooms]);
      break;
    case 'mute-all':
      muteAll();
      break;
    case 'refresh-analytics':
      void loadAnalytics();
      break;
    case 'open-room-drawer':
      if (desktopQueueMedia.matches) {
        state.queueCollapsed = false;
        savePreferences();
        applyPanelVisibility();
      } else {
        document.body.classList.add('room-drawer-open');
      }
      break;
    case 'close-room-drawer':
      hideQueuePanel();
      break;
    case 'close-inspector':
      hideInspectorPanel();
      break;
    case 'close-command':
      commandDialog.close();
      break;
    case 'favorites-first':
      roomList.scrollTo({ top: 0, behavior: 'smooth' });
      toast('已将关注房间排在队列前方');
      break;
  }
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const eventFeedButton = target.closest<HTMLButtonElement>('[data-event-feed]');
  if (eventFeedButton) {
    state.inspectorFeed = eventFeedButton.dataset.eventFeed === 'gift' ? 'gift' : 'chat';
    renderInspector();
    return;
  }
  const viewButton = target.closest<HTMLButtonElement>('[data-view]');
  if (viewButton) {
    switchView(viewButton.dataset.view as AppView);
    return;
  }
  const layoutButton = target.closest<HTMLButtonElement>('[data-layout]');
  if (layoutButton) {
    setLayout(layoutButton.dataset.layout as LayoutMode);
    return;
  }
  const actionButton = target.closest<HTMLButtonElement>('[data-action]');
  if (!actionButton) return;
  const roomId = actionButton.dataset.room
    ?? actionButton.closest<HTMLElement>('[data-room]')?.dataset.room
    ?? state.activeRoom
    ?? '';
  performAction(actionButton.dataset.action ?? '', roomId);
});

app.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target === freeWindowToggle) {
    setLayout(freeWindowToggle.checked ? 'free' : state.lastPresetLayout);
    return;
  }
  if (target.matches('[data-select-room]')) {
    const roomId = target.closest<HTMLElement>('[data-room]')?.dataset.room ?? '';
    if ((target as HTMLInputElement).checked) state.selectedRooms.add(roomId);
    else state.selectedRooms.delete(roomId);
    renderBulkBar();
    return;
  }
  if (target.matches('[data-quality]')) {
    const roomId = target.dataset.room
      ?? target.closest<HTMLElement>('[data-room]')?.dataset.room
      ?? state.activeRoom
      ?? '';
    void changeQuality(roomId, target.value as Quality);
  }
});

app.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.matches('input[data-volume]')) return;
  const roomId = target.dataset.room
    ?? target.closest<HTMLElement>('[data-room]')?.dataset.room
    ?? state.activeRoom
    ?? '';
  setRoomVolume(roomId, Number(target.value));
});

interface WindowInteraction {
  pointerId: number;
  target: HTMLElement;
  card: HTMLElement;
  roomId: string;
  mode: 'move' | 'resize';
  direction: string;
  startX: number;
  startY: number;
  startRect: StreamWindowRect;
}

let windowInteraction: WindowInteraction | null = null;

app.addEventListener('pointerdown', (event) => {
  const target = event.target as HTMLElement;
  const card = target.closest<HTMLElement>('.stream-card');
  if (!card) return;
  bringWindowToFront(card);
  const roomId = card.dataset.room ?? '';
  if (roomId && state.activeRoom !== roomId) {
    state.activeRoom = roomId;
    videoGrid.querySelectorAll<HTMLElement>('.stream-card').forEach((candidate) => {
      candidate.classList.toggle('is-active', candidate === card);
    });
    renderRoomList();
    renderInspector();
  }

  const resizeHandle = target.closest<HTMLElement>('[data-resize]');
  const moveHandle = target.closest<HTMLElement>('.drag-handle');
  const interactionTarget = resizeHandle ?? moveHandle;
  if (!interactionTarget || !roomId || state.layout !== 'free') return;

  event.preventDefault();
  interactionTarget.setPointerCapture(event.pointerId);
  const startRect = state.windowRects[roomId] ?? defaultWindowRect(state.openRooms.indexOf(roomId));
  windowInteraction = {
    pointerId: event.pointerId,
    target: interactionTarget,
    card,
    roomId,
    mode: resizeHandle ? 'resize' : 'move',
    direction: resizeHandle?.dataset.resize ?? '',
    startX: event.clientX,
    startY: event.clientY,
    startRect: { ...startRect },
  };
  card.classList.add(resizeHandle ? 'is-resizing' : 'is-moving');
});

app.addEventListener('pointermove', (event) => {
  const interaction = windowInteraction;
  if (!interaction || interaction.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - interaction.startX;
  const deltaY = event.clientY - interaction.startY;
  const next = { ...interaction.startRect };
  if (interaction.mode === 'move') {
    next.x += deltaX;
    next.y += deltaY;
  } else {
    if (interaction.direction.includes('e')) next.width += deltaX;
    if (interaction.direction.includes('s')) next.height += deltaY;
    if (interaction.direction.includes('w')) {
      next.x += deltaX;
      next.width -= deltaX;
    }
    if (interaction.direction.includes('n')) {
      next.y += deltaY;
      next.height -= deltaY;
    }
  }
  applyWindowRect(interaction.card, interaction.roomId, next);
});

function finishWindowInteraction(event: PointerEvent): void {
  const interaction = windowInteraction;
  if (!interaction || interaction.pointerId !== event.pointerId) return;
  interaction.card.classList.remove('is-moving', 'is-resizing');
  if (interaction.target.hasPointerCapture(event.pointerId)) interaction.target.releasePointerCapture(event.pointerId);
  windowInteraction = null;
  savePreferences();
}

app.addEventListener('pointerup', finishWindowInteraction);
app.addEventListener('pointercancel', finishWindowInteraction);

app.addEventListener('keydown', (event) => {
  const handle = (event.target as HTMLElement).closest<HTMLButtonElement>('.drag-handle');
  if (!handle || state.layout !== 'free' || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

  event.preventDefault();
  const card = handle.closest<HTMLElement>('.stream-card');
  const roomId = card?.dataset.room ?? '';
  if (!card || !roomId) return;
  const step = event.shiftKey ? 40 : 10;
  const rect = { ...(state.windowRects[roomId] ?? defaultWindowRect(state.openRooms.indexOf(roomId))) };
  if (event.altKey) {
    if (event.key === 'ArrowLeft') rect.width -= step;
    if (event.key === 'ArrowRight') rect.width += step;
    if (event.key === 'ArrowUp') rect.height -= step;
    if (event.key === 'ArrowDown') rect.height += step;
  } else {
    if (event.key === 'ArrowLeft') rect.x -= step;
    if (event.key === 'ArrowRight') rect.x += step;
    if (event.key === 'ArrowUp') rect.y -= step;
    if (event.key === 'ArrowDown') rect.y += step;
  }
  applyWindowRect(card, roomId, rect);
  bringWindowToFront(card);
  savePreferences();
  toast(event.altKey ? '已调整窗口大小' : '已移动窗口');
});

roomSearch.addEventListener('input', () => {
  state.query = roomSearch.value;
  renderRoomList();
});

document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter as RoomFilter;
    document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((candidate) => {
      const active = candidate === button;
      candidate.classList.toggle('is-active', active);
      candidate.setAttribute('aria-pressed', String(active));
    });
    renderRoomList();
  });
});

selectAll.addEventListener('change', () => {
  filteredRooms().forEach((room) => {
    if (selectAll.checked) state.selectedRooms.add(room.room);
    else state.selectedRooms.delete(room.room);
  });
  renderRoomList();
});

addRoomForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void submitRoom();
});

element<HTMLButtonElement>('command-button').addEventListener('click', openCommandDialog);
element<HTMLButtonElement>('queue-panel-button').addEventListener('click', toggleQueuePanel);
element<HTMLButtonElement>('room-drawer-button').addEventListener('click', toggleQueuePanel);
element<HTMLButtonElement>('inspector-button').addEventListener('click', toggleInspectorPanel);
element<HTMLButtonElement>('confirm-remove').addEventListener('click', () => void confirmRemoval());
commandInput.addEventListener('input', () => renderCommands(commandInput.value));
commandInput.addEventListener('keydown', (event) => {
  const buttons = [...element<HTMLDivElement>('command-results').querySelectorAll<HTMLButtonElement>('button[data-command]')];
  if (buttons.length === 0) return;

  const currentIndex = Math.max(0, buttons.findIndex((button) => button.classList.contains('is-current')));
  if (event.key === 'Enter') {
    event.preventDefault();
    buttons[currentIndex]?.click();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

  event.preventDefault();
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
  buttons.forEach((button, index) => button.classList.toggle('is-current', index === nextIndex));
  buttons[nextIndex]?.scrollIntoView({ block: 'nearest' });
});

videoGrid.addEventListener('dblclick', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('button, select')) return;
  const roomId = target.closest<HTMLElement>('.stream-card')?.dataset.room;
  if (roomId) fullscreenRoom(roomId);
});

analyticsBody.addEventListener('click', (event) => {
  const row = (event.target as HTMLElement).closest<HTMLTableRowElement>('tr[data-room]');
  if (!row) return;
  const roomId = row.dataset.room ?? '';
  if (roomById(roomId)) {
    state.activeRoom = roomId;
    switchView('monitor');
    openRoom(roomId);
  }
});

analyticsBody.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const row = (event.target as HTMLElement).closest<HTMLTableRowElement>('tr[data-room]');
  if (!row) return;
  event.preventDefault();
  row.click();
});

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  const isTyping = target.matches('input, textarea, select, [contenteditable="true"]');
  if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === 'k') {
    event.preventDefault();
    if (commandDialog.open) commandDialog.close();
    else openCommandDialog();
    return;
  }
  if (isTyping || commandDialog.open || confirmDialog.open || danmakuSettingsDialog.open) return;
  if (event.key === '/') {
    event.preventDefault();
    roomSearch.focus();
  } else if (['1', '2', '3', '4'].includes(event.key)) {
    setLayout(event.key as LayoutMode);
  } else if (event.key.toLocaleLowerCase() === 'm') {
    muteAll();
  } else if (event.key.toLocaleLowerCase() === 'r') {
    void refreshAll();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    void checkService();
    void loadRooms(true);
    void runRoomRefreshScheduler();
  }
});

window.addEventListener('beforeunload', () => {
  window.clearTimeout(preferencesSaveTimer);
  savePreferences();
  streamsAbort?.abort();
  statusAbort?.abort();
  statsAbort?.abort();
  window.clearTimeout(roomRefreshTimer);
  statsEventSource?.close();
  unsubscribeNativePlayerEvents();
  players.forEach((player) => player.destroy());
});

desktopQueueMedia.addEventListener('change', () => {
  document.body.classList.remove('room-drawer-open');
  applyPanelVisibility();
  constrainAllWindows();
});

desktopInspectorMedia.addEventListener('change', () => {
  document.body.classList.remove('inspector-open');
  applyPanelVisibility();
  constrainAllWindows();
});

new ResizeObserver(() => constrainAllWindows()).observe(videoGrid);

danmakuOpacityInput.addEventListener('input', () => {
  state.danmakuOpacity = Number(danmakuOpacityInput.value);
  applyDanmakuDisplaySettings(true);
});

danmakuFontSizeInput.addEventListener('input', () => {
  state.danmakuFontSize = Number(danmakuFontSizeInput.value);
  applyDanmakuDisplaySettings(true);
});

danmakuAreaSelect.addEventListener('change', () => {
  state.danmakuArea = danmakuAreaSelect.value as DanmakuArea;
  applyDanmakuDisplaySettings(true);
});

giftRevenueRangeSelect.addEventListener('change', () => {
  state.giftRevenueRange = giftRevenueRangeSelect.value as GiftRevenueRange;
  savePreferences();
  updateGiftRevenueDisplays();
  void loadSevenDayGiftRevenue();
});

includeFreeGiftsInput.addEventListener('change', () => {
  state.includeFreeGifts = includeFreeGiftsInput.checked;
  savePreferences();
  updateGiftRevenueDisplays();
  renderAnalytics();
  renderInspector();
});

window.setInterval(() => {
  document.querySelectorAll<HTMLElement>('.stream-card').forEach((card) => {
    const room = roomById(card.dataset.room ?? '');
    if (room) card.querySelector<HTMLElement>('.stream-duration')!.textContent = room.ok ? formatDuration(room.showTime) : '00:00:00';
  });
  if (state.lastUpdatedAt > 0 && Date.now() - state.lastUpdatedAt > 15000 && state.service === 'online') {
    state.service = 'degraded';
    state.serviceMessage = '数据等待刷新';
    renderHeader();
  }
}, 1000);

window.setInterval(() => {
  if (!document.hidden) {
    void checkService();
    void loadAnalytics(true);
  }
}, 8000);

applyDanmakuDisplaySettings();
drawIcons();
applyPanelVisibility();
renderAll();
void loadRooms();
void runRoomRefreshScheduler();
void checkService();
void loadAnalytics(true);
connectStatsEvents();
