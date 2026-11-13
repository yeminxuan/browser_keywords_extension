export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ShortcutType = 'drag' | 'point' | 'area' | 'loupe' | 'picker' | 'ruler';

export interface ShortcutGroup {
  id: string;
  type: ShortcutType;
  /** 单字符按键，小写存储，展示时转大写 */
  key: string;
  enabled: boolean;
  /** 单组拖拽时长覆盖，null 表示使用全局设置 */
  duration: number | null;
  /** true 表示起点取触发时的当前鼠标位置；false/undefined 表示起点固定存储值 */
  dragFromCursor?: boolean;
  /** 拖拽起点 / 终点（页面坐标，不受滚动影响） */
  start?: Point;
  end?: Point;
  /** 定点点击位置（页面坐标） */
  point?: Point;
  /** 区域点击范围（页面坐标） */
  area?: Rect;
}

export interface PanelPosition {
  left: number;
  top: number;
}

export interface Settings {
  duration: number;
  holdAfterPress: number;
  steps: number;
  /** 区域点击的网格间距（px） */
  areaStep: number;
  /** 区域点击每次点击之间的间隔（毫秒） */
  clickInterval: number;
  highCompat: boolean;
  allEnabled: boolean;
  /** 放大镜倍数 */
  magnifierZoom: number;
  /** 放大镜模式：dom=DOM 镜像（60fps 实时），screenshot=截图（可放大 video/canvas） */
  magnifierMode: 'dom' | 'screenshot';
  /** 取色器默认放大倍数（取色时可用 +/- 临时调整并回写） */
  pickerZoom: number;
  /** 当前激活的功能 tab，持久化保存 */
  activeTab: ShortcutType;
  panel: PanelPosition | null;
}

export interface Store {
  groups: ShortcutGroup[];
  settings: Settings;
}

export interface CdpDragPayload {
  start: Point;
  end: Point;
  duration: number;
  hold: number;
  steps: number;
}

export interface CdpClicksPayload {
  points: Point[];
  interval: number;
}

export const DEFAULT_SETTINGS: Settings = {
  duration: 600,
  holdAfterPress: 120,
  steps: 24,
  areaStep: 5,
  clickInterval: 5,
  highCompat: false,
  allEnabled: true,
  magnifierZoom: 2.4,
  magnifierMode: 'dom',
  pickerZoom: 6,
  activeTab: 'drag',
  panel: null,
};
