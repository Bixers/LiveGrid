import {
  Activity,
  BarChart3,
  Check,
  ChevronDown,
  CircleAlert,
  Command,
  Focus,
  GripVertical,
  LayoutGrid,
  ListFilter,
  Menu,
  Monitor,
  PanelRightOpen,
  Plus,
  Radio,
  RefreshCw,
  Search,
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
  getServiceStatus,
  getStats,
  getStreams,
  refreshStreams,
  removeRoom as removeRoomRequest,
  setRoomQuality,
} from './api';
import { StreamPlayer, type PlayerState } from './player';
import type {
  AppView,
  LayoutMode,
  LiveEvent,
  Preferences,
  Quality,
  RoomFilter,
  StatsRoom,
  StreamRoom,
} from './types';
import './styles.css';

const iconSet: Record<string, IconNode> = {
  activity: Activity,
  'bar-chart-3': BarChart3,
  check: Check,
  'chevron-down': ChevronDown,
  'circle-alert': CircleAlert,
  command: Command,
  focus: Focus,
  'grip-vertical': GripVertical,
  'layout-grid': LayoutGrid,
  'list-filter': ListFilter,
  menu: Menu,
  monitor: Monitor,
  'panel-right-open': PanelRightOpen,
  plus: Plus,
  radio: Radio,
  'refresh-cw': RefreshCw,
  search: Search,
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
  { rid: '612904', name: '夜航电竞', live: true, hot: 32741, fans: 184206, noble: 37, giftTotal: 287340, giftUV: 214, chatUV: 1638, activeUV: 4821, sr: 641 },
  { rid: '883120', name: '山城音乐间', live: true, hot: 21806, fans: 92713, noble: 19, giftTotal: 149680, giftUV: 127, chatUV: 906, activeUV: 2914, sr: 382 },
  { rid: '390271', name: '橙子电台', live: true, hot: 12639, fans: 60388, noble: 8, giftTotal: 68320, giftUV: 71, chatUV: 517, activeUV: 1736, sr: 195 },
  { rid: '721536', name: '北岸户外', live: false, hot: 0, fans: 43107, noble: 0, giftTotal: 0, giftUV: 0, chatUV: 0, activeUV: 0, sr: 0 },
];

const defaultPreferences: Preferences = {
  openRooms: demoMode ? demoRooms.slice(0, 3).map((room) => room.room) : [],
  favorites: [],
  mutedRooms: [],
  layout: 'auto',
};

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Preferences>;
    return {
      openRooms: Array.isArray(saved.openRooms) ? saved.openRooms.map(String) : defaultPreferences.openRooms,
      favorites: Array.isArray(saved.favorites) ? saved.favorites.map(String) : [],
      mutedRooms: Array.isArray(saved.mutedRooms) ? saved.mutedRooms.map(String) : [],
      layout: ['auto', '1', '2', '3', '4', 'focus'].includes(String(saved.layout))
        ? saved.layout as LayoutMode
        : 'auto',
    };
  } catch {
    return { ...defaultPreferences };
  }
}

const preferences = readPreferences();
const state = {
  rooms: [] as StreamRoom[],
  stats: [] as StatsRoom[],
  openRooms: [...preferences.openRooms],
  favorites: new Set(preferences.favorites),
  mutedRooms: new Set(preferences.mutedRooms),
  selectedRooms: new Set<string>(),
  activeRoom: preferences.openRooms[0] ?? null as string | null,
  filter: 'all' as RoomFilter,
  query: '',
  layout: preferences.layout,
  view: 'monitor' as AppView,
  service: 'checking' as 'checking' | 'online' | 'degraded' | 'offline',
  serviceMessage: '正在连接本地服务',
  lastUpdatedAt: 0,
  eventState: 'idle' as 'idle' | 'connecting' | 'online' | 'retrying',
};

const players = new Map<string, StreamPlayer>();
const playerStates = new Map<string, { state: PlayerState; detail: string }>();
const events: LiveEvent[] = demoMode ? [
  { type: 'chat', room: '612904', nn: '演示观众', txt: '今晚的赛程开始了', time: Date.now() - 42000 },
  { type: 'gift', room: '883120', nn: '山风', giftName: '荧光棒', count: 6, time: Date.now() - 18000 },
] : [];
let streamsAbort: AbortController | null = null;
let statusAbort: AbortController | null = null;
let statsAbort: AbortController | null = null;
let danmakuSource: EventSource | null = null;
let danmakuIntent = '';
let pendingRemovalIds: string[] = [];

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
        <button type="button" class="icon-button inspector-toggle" id="inspector-button" aria-label="打开房间检查器" title="打开房间检查器">
          <i data-lucide="panel-right-open"></i>
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
          <button type="button" class="icon-button mobile-only" data-action="close-room-drawer" aria-label="关闭房间队列" title="关闭">
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
              <div class="segmented-control layout-control" aria-label="画布布局">
                <button type="button" data-layout="auto" aria-label="自动布局" title="自动布局"><i data-lucide="layout-grid"></i></button>
                <button type="button" data-layout="1" aria-label="单列布局" title="单列布局">1</button>
                <button type="button" data-layout="2" aria-label="两列布局" title="两列布局">2</button>
                <button type="button" data-layout="3" aria-label="三列布局" title="三列布局">3</button>
                <button type="button" data-layout="4" aria-label="四列布局" title="四列布局">4</button>
                <button type="button" data-layout="focus" aria-label="重点布局" title="重点布局"><i data-lucide="focus"></i></button>
              </div>
              <button type="button" class="tool-button" data-action="mute-all">
                <i data-lucide="volume-x"></i><span>全部静音</span>
              </button>
              <button type="button" class="tool-button" data-action="refresh-all">
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
                  <th scope="col">贵族</th>
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
          <button type="button" class="icon-button inspector-close" data-action="close-inspector" aria-label="关闭检查器" title="关闭">
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
const commandDialog = element<HTMLDialogElement>('command-dialog');
const commandInput = element<HTMLInputElement>('command-input');

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
    layout: state.layout,
  };
  localStorage.setItem(storageKey, JSON.stringify(value));
}

function roomById(roomId: string): StreamRoom | undefined {
  return state.rooms.find((room) => room.room === roomId);
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

function formatMoney(cents: number | undefined): string {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0,
  }).format((cents ?? 0) / 100);
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
  card.draggable = true;
  card.innerHTML = `
    <div class="stream-chrome">
      <button type="button" class="drag-handle" aria-label="调整画面顺序，使用方向键移动" title="拖动或使用方向键排序"><i data-lucide="grip-vertical"></i></button>
      <div class="stream-title"><strong></strong><small></small></div>
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
      <button type="button" class="row-icon-button" data-action="toggle-mute" aria-label="切换静音" title="切换静音"></button>
      <button type="button" class="row-icon-button" data-action="close-room" aria-label="关闭画面" title="关闭画面"><i data-lucide="x"></i></button>
    </div>
    <div class="video-frame">
      <video autoplay muted controls playsinline></video>
      <div class="player-state">
        <i data-lucide="activity"></i>
        <strong>等待直播流</strong>
        <span></span>
      </div>
      <div class="stream-state-tag"></div>
    </div>
  `;
  const video = card.querySelector<HTMLVideoElement>('video')!;
  const player = new StreamPlayer(video, (playerState, detail = '') => {
    playerStates.set(roomId, { state: playerState, detail });
    updatePlayerState(roomId);
  });
  players.set(roomId, player);
  return card;
}

function updatePlayerState(roomId: string): void {
  const card = videoGrid.querySelector<HTMLElement>(`.stream-card[data-room="${roomId}"]`);
  const room = roomById(roomId);
  if (!card || !room) return;
  const overlay = card.querySelector<HTMLDivElement>('.player-state')!;
  const title = overlay.querySelector<HTMLElement>('strong')!;
  const detail = overlay.querySelector<HTMLSpanElement>('span')!;
  const current = playerStates.get(roomId) ?? { state: 'idle' as PlayerState, detail: '' };

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
  const roomName = displayRoomName(room, room.room);
  const roomCode = `ROOM ${room.room}`;
  const title = card.querySelector<HTMLElement>('.stream-title strong')!;
  const code = card.querySelector<HTMLElement>('.stream-title small')!;
  title.textContent = roomName;
  title.title = roomName;
  code.textContent = roomCode;
  code.title = roomCode;
  card.querySelector<HTMLElement>('.stream-duration')!.textContent = room.ok ? formatDuration(room.showTime) : '00:00:00';
  const tag = card.querySelector<HTMLElement>('.stream-state-tag')!;
  tag.textContent = roomStateText(room);
  tag.dataset.state = room.ok ? (room.loop ? 'loop' : 'live') : 'offline';
  const quality = card.querySelector<HTMLSelectElement>('[data-quality]')!;
  quality.value = room.quality;
  const muted = state.mutedRooms.has(room.room);
  const muteButton = card.querySelector<HTMLButtonElement>('[data-action="toggle-mute"]')!;
  muteButton.innerHTML = muted ? '<i data-lucide="volume-x"></i>' : '<i data-lucide="volume-2"></i>';
  muteButton.setAttribute('aria-label', muted ? '取消静音' : '静音');
  muteButton.title = muted ? '取消静音' : '静音';
  players.get(room.room)?.setMuted(muted);

  if (!room.ok || !room.url || demoMode) {
    players.get(room.room)?.unload();
    playerStates.set(room.room, { state: 'idle', detail: '' });
  } else {
    players.get(room.room)?.load(room.url);
  }
  updatePlayerState(room.room);
}

function renderCanvas(): void {
  videoGrid.dataset.layout = state.layout;
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
    } else {
      videoGrid.appendChild(card);
    }
    updateStreamCard(card, room);
  });

  const openCount = state.openRooms.filter((roomId) => roomById(roomId)).length;
  element<HTMLSpanElement>('canvas-count').textContent = `${openCount} 路已打开`;
  canvasEmpty.hidden = openCount > 0;
  videoGrid.hidden = openCount === 0;
  drawIcons();
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
    ['弹幕通道', state.eventState === 'online' ? '已连接' : state.eventState === 'retrying' ? '重连中' : '未连接'],
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
    <div class="inspector-actions">
      <button type="button" class="secondary-button" data-action="refresh-room" data-room="${room.room}"><i data-lucide="refresh-cw"></i><span>刷新流</span></button>
      <button type="button" class="secondary-button" data-action="toggle-mute" data-room="${room.room}"><i data-lucide="${state.mutedRooms.has(room.room) ? 'volume-2' : 'volume-x'}"></i><span>${state.mutedRooms.has(room.room) ? '取消静音' : '静音'}</span></button>
    </div>
    <button type="button" class="remove-room-button" data-action="remove-room" data-room="${room.room}"><i data-lucide="trash-2"></i><span>从监控列表移除</span></button>
  `;
  controls.querySelector<HTMLSelectElement>('[data-quality]')!.value = room.quality;
  inspectorContent.appendChild(controls);

  const eventSection = document.createElement('section');
  eventSection.className = 'inspector-section event-section';
  eventSection.innerHTML = '<div class="section-heading"><h3>最近事件</h3><span></span></div><div class="event-list"></div>';
  const roomEvents = events.filter((event) => String(event.room ?? event.rid ?? '') === room.room).slice(0, 20);
  eventSection.querySelector<HTMLElement>('.section-heading span')!.textContent = `${roomEvents.length} 条`;
  const eventList = eventSection.querySelector<HTMLDivElement>('.event-list')!;
  if (roomEvents.length === 0) {
    eventList.innerHTML = '<div class="event-empty">等待弹幕或礼物事件</div>';
  } else {
    roomEvents.forEach((event) => eventList.appendChild(createEventRow(event)));
  }
  inspectorContent.appendChild(eventSection);
  drawIcons();
}

function createEventRow(event: LiveEvent): HTMLElement {
  const row = document.createElement('div');
  row.className = `event-row is-${event.type === 'gift' || event.type === 'noble' ? 'gift' : 'chat'}`;
  row.innerHTML = '<time></time><div><strong></strong><span></span></div>';
  row.querySelector('time')!.textContent = formatEventTime(event.time);
  row.querySelector('strong')!.textContent = event.nn || event.name || '匿名用户';
  const message = event.type === 'gift' || event.type === 'noble'
    ? `${event.giftName || event.gfname || '礼物'} x${event.count || event.gfcnt || 1}`
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
    ['礼物金额', formatMoney(rooms.reduce((sum, room) => sum + (room.giftTotal ?? 0), 0)), '当前会话累计'],
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
      formatMoney(room.giftTotal),
      formatInteger(room.noble),
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
}

function renderAll(): void {
  renderHeader();
  renderRoomList();
  renderCanvas();
  renderInspector();
  renderAnalytics();
  renderView();
}

async function loadRooms(silent = false): Promise<void> {
  if (demoMode) {
    state.rooms = [...demoRooms];
    state.stats = [...demoStats];
    state.service = 'online';
    state.serviceMessage = '演示服务正常';
    state.lastUpdatedAt = Date.now();
    renderAll();
    return;
  }

  streamsAbort?.abort();
  const controller = new AbortController();
  streamsAbort = controller;
  try {
    const rooms = await getStreams(controller.signal);
    state.rooms = rooms;
    state.openRooms = state.openRooms.filter((roomId) => rooms.some((room) => room.room === roomId));
    if (state.activeRoom && !rooms.some((room) => room.room === state.activeRoom)) {
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
  } catch (error) {
    if (controller.signal.aborted) return;
    state.service = 'offline';
    state.serviceMessage = '本地服务未连接';
    renderHeader();
    if (!silent) toast(error instanceof Error ? error.message : '读取房间失败', 'error');
  }
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
    element<HTMLSpanElement>('analytics-updated').textContent = '演示数据';
    renderAnalytics();
    return;
  }
  statsAbort?.abort();
  const controller = new AbortController();
  statsAbort = controller;
  try {
    const result = await getStats(controller.signal);
    state.stats = result.rooms ?? [];
    element<HTMLSpanElement>('analytics-updated').textContent = `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
    renderAnalytics();
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
  const intent = [...state.openRooms].sort().join(',');
  if (intent === danmakuIntent && danmakuSource) return;
  danmakuSource?.close();
  danmakuSource = null;
  danmakuIntent = intent;
  if (!intent) {
    state.eventState = 'idle';
    renderInspector();
    return;
  }
  state.eventState = 'connecting';
  const source = new EventSource(`/danmaku?rooms=${encodeURIComponent(intent)}`);
  danmakuSource = source;
  source.onopen = () => {
    state.eventState = 'online';
    renderInspector();
  };
  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as LiveEvent;
      if (event.type === 'status') return;
      events.unshift({ ...event, time: event.time ?? Date.now() });
      if (events.length > 200) events.length = 200;
      if (state.activeRoom === String(event.room ?? event.rid ?? '')) renderInspector();
    } catch {
      // Ignore malformed third-party event payloads.
    }
  };
  source.onerror = () => {
    state.eventState = 'retrying';
    renderInspector();
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
  document.body.classList.remove('room-drawer-open');
}

function closeRoom(roomId: string): void {
  state.openRooms = state.openRooms.filter((id) => id !== roomId);
  players.get(roomId)?.destroy();
  players.delete(roomId);
  playerStates.delete(roomId);
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
  if (state.mutedRooms.has(roomId)) state.mutedRooms.delete(roomId);
  else state.mutedRooms.add(roomId);
  players.get(roomId)?.setMuted(state.mutedRooms.has(roomId));
  savePreferences();
  renderCanvas();
  renderInspector();
}

async function refreshAll(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>('[data-action="refresh-all"]');
  button?.classList.add('is-busy');
  try {
    if (!demoMode) await refreshStreams();
    await loadRooms(true);
    toast('直播流地址已刷新', 'success');
  } catch (error) {
    toast(error instanceof Error ? error.message : '刷新失败', 'error');
  } finally {
    button?.classList.remove('is-busy');
  }
}

async function changeQuality(roomId: string, quality: Quality): Promise<void> {
  const room = roomById(roomId);
  if (!room || room.quality === quality) return;
  const previous = room.quality;
  room.quality = quality;
  renderCanvas();
  renderInspector();
  try {
    if (!demoMode) await setRoomQuality(roomId, quality);
    toast(`${displayRoomName(room, roomId)} 已切换为${qualityNames[quality]}`, 'success');
    if (!demoMode) window.setTimeout(() => void loadRooms(true), 1400);
  } catch (error) {
    room.quality = previous;
    renderCanvas();
    renderInspector();
    toast(error instanceof Error ? error.message : '清晰度切换失败', 'error');
  }
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
  state.layout = layout;
  savePreferences();
  renderCanvas();
}

function renderCommands(query = ''): void {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  const commands = [
    { id: 'monitor', icon: 'monitor', label: '打开直播监控', run: () => switchView('monitor') },
    { id: 'analytics', icon: 'bar-chart-3', label: '打开运行数据', run: () => switchView('analytics') },
    { id: 'refresh', icon: 'refresh-cw', label: '刷新全部直播流', run: () => void refreshAll() },
    { id: 'mute', icon: 'volume-x', label: '静音全部画面', run: () => muteAll() },
    { id: 'focus', icon: 'focus', label: '切换重点布局', run: () => setLayout('focus') },
    { id: 'queue', icon: 'list-filter', label: '打开房间队列', run: () => document.body.classList.add('room-drawer-open') },
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
      document.body.classList.add('room-drawer-open');
      break;
    case 'close-room-drawer':
      document.body.classList.remove('room-drawer-open');
      break;
    case 'close-inspector':
      document.body.classList.remove('inspector-open');
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

app.addEventListener('dragstart', (event) => {
  const card = (event.target as HTMLElement).closest<HTMLElement>('.stream-card');
  if (!card || !event.dataTransfer) return;
  event.dataTransfer.setData('text/plain', card.dataset.room ?? '');
  event.dataTransfer.effectAllowed = 'move';
  card.classList.add('is-dragging');
});

app.addEventListener('dragend', (event) => {
  (event.target as HTMLElement).closest<HTMLElement>('.stream-card')?.classList.remove('is-dragging');
});

app.addEventListener('keydown', (event) => {
  const handle = (event.target as HTMLElement).closest<HTMLButtonElement>('.drag-handle');
  if (!handle || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;

  event.preventDefault();
  const card = handle.closest<HTMLElement>('.stream-card');
  const roomId = card?.dataset.room ?? '';
  const currentIndex = state.openRooms.indexOf(roomId);
  const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
  const nextIndex = Math.max(0, Math.min(state.openRooms.length - 1, currentIndex + direction));
  if (currentIndex < 0 || currentIndex === nextIndex) return;

  const currentRoomId = state.openRooms[currentIndex]!;
  state.openRooms[currentIndex] = state.openRooms[nextIndex]!;
  state.openRooms[nextIndex] = currentRoomId;
  savePreferences();
  renderCanvas();
  card?.querySelector<HTMLButtonElement>('.drag-handle')?.focus();
  toast(`已将 ${displayRoomName(roomById(roomId), roomId)} 移动到第 ${nextIndex + 1} 位`);
});

videoGrid.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
});

videoGrid.addEventListener('drop', (event) => {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData('text/plain') ?? '';
  const target = (event.target as HTMLElement).closest<HTMLElement>('.stream-card');
  const targetId = target?.dataset.room ?? '';
  if (!sourceId || !targetId || sourceId === targetId) return;
  const sourceIndex = state.openRooms.indexOf(sourceId);
  const targetIndex = state.openRooms.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  state.openRooms.splice(sourceIndex, 1);
  state.openRooms.splice(targetIndex, 0, sourceId);
  savePreferences();
  renderCanvas();
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
element<HTMLButtonElement>('room-drawer-button').addEventListener('click', () => document.body.classList.add('room-drawer-open'));
element<HTMLButtonElement>('inspector-button').addEventListener('click', () => document.body.classList.toggle('inspector-open'));
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
  const video = (event.target as HTMLElement).closest<HTMLElement>('.stream-card')?.querySelector<HTMLVideoElement>('video');
  if (!video) return;
  void video.requestFullscreen().catch(() => toast('当前环境无法进入全屏', 'error'));
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
  if (isTyping || commandDialog.open || confirmDialog.open) return;
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
  }
});

window.addEventListener('beforeunload', () => {
  streamsAbort?.abort();
  statusAbort?.abort();
  statsAbort?.abort();
  danmakuSource?.close();
  players.forEach((player) => player.destroy());
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
    void loadRooms(true);
    void checkService();
    if (state.view === 'analytics') void loadAnalytics(true);
  }
}, 5000);

drawIcons();
renderAll();
void loadRooms();
void checkService();
