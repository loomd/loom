/**
 * 全局设计令牌。
 *
 * 移动端所有页面（聊天、抽屉、登录、配对、设置）共用同一套色板与间距，
 * 保证整体风格统一：深色、扁平、无阴影堆叠、无 emoji。
 */

export const colors = {
  /** 页面底色 */
  bg: "#0b0b10",
  /** 卡片/面板底色 */
  surface: "#14141b",
  /** 次级容器（输入框、代码块） */
  surfaceAlt: "#1b1b24",
  /** 选中/激活态底色 */
  surfaceActive: "#23232f",
  /** 分隔线与描边 */
  border: "#26262f",
  /** 强调描边 */
  borderStrong: "#34343f",
  /** 正文 */
  text: "#e9e9ee",
  /** 次级文字 */
  textMuted: "#9a9aa6",
  /** 弱化文字 */
  textFaint: "#6a6a77",
  /** 主色 */
  accent: "#7c8cf8",
  /** 主色浅底 */
  accentSoft: "rgba(124, 140, 248, 0.16)",
  /** 主色文字 */
  accentText: "#a9b3ff",
  /** 成功 */
  success: "#4ade80",
  /** 进行中 */
  warning: "#f0b429",
  /** 失败 */
  danger: "#f0656f",
  /** 代码块底色 */
  codeBg: "#0e0e14",
  /** 遮罩 */
  overlay: "rgba(5, 5, 9, 0.68)",
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const font = {
  title: 17,
  body: 15,
  small: 13,
  tiny: 11,
  code: 12.5,
} as const;

/** 等宽字体族（代码块与等宽场景） */
export const monoFont = "monospace";
