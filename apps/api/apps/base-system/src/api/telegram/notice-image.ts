import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Logger } from '@nestjs/common';
import { Resvg } from '@resvg/resvg-js';

// 把已渲染好的通知正文（空行分块、首行为标题、行首为状态灯）画成卡片图，供环境巡检与通道状态使用。
// 状态灯画成色点：SVG 渲染器没有彩色 emoji 字体。字体不可用或绘制失败时返回 null，调用方退回文字发送。
// 主题色：每类通知一套，避免连续发送时两类图片看起来一样。状态灯颜色不属于主题，两类共用。
export interface NoticeTheme { bgFrom: string; bgTo: string; grid: string; accent: string; title: string; sub: string; border: string; text: string }
export const THEME_BLUE: NoticeTheme = { bgFrom: '#F0F6FC', bgTo: '#D3E4F2', grid: '#D5E4F0', accent: '#1565C0', title: '#12304D', sub: '#2A6FA3', border: '#C9DAE8', text: '#3F5870' };
export const THEME_TEAL: NoticeTheme = { bgFrom: '#EEF8F5', bgTo: '#CDE9E0', grid: '#D2E8E0', accent: '#0F8B7A', title: '#0F3B38', sub: '#1B7F73', border: '#BFDDD3', text: '#35605A' };
export const THEME_ORANGE: NoticeTheme = { bgFrom: '#FFF6EE', bgTo: '#F8DDC6', grid: '#F4E1CF', accent: '#D9622B', title: '#4A1E0C', sub: '#B4501F', border: '#EBCDB4', text: '#6B4630' };
export const THEME_RED: NoticeTheme = { bgFrom: '#FFF1F1', bgTo: '#F6D3D3', grid: '#F3DCDC', accent: '#C62828', title: '#4A1010', sub: '#B23A3A', border: '#EBC4C4', text: '#6B3A3A' };
export interface NoticeImageOptions { title: string; english: string; fig: string; theme?: NoticeTheme; single?: boolean }
export interface NoticeCard { lamp: string; title: string; lines: string[] }
type Item = { card: NoticeCard; title: string[]; lines: string[]; height: number };

const LAMPS: Record<string, string> = { '🔴': '#D64545', '🟠': '#E08A1E', '⚪': '#9AA7B4', '🟢': '#2E9E5B', '🔵': '#2A7FBF' };
const ORDER = Object.keys(LAMPS);
const W = 1080, PAD = 36, GAP = 18, HEAD = 168, COL_W = (W - PAD * 2 - GAP) / 2, TEXT_X = 52, INNER = COL_W - TEXT_X - 18;
const TITLE_PX = 26, TEXT_PX = 22, TITLE_H = 40, TITLE_LINE = 32, LINE_H = 32, CARD_PAD = 18;
// 字体优先级：TG_IMAGE_FONT 指定 > 依赖包 @expo-google-fonts/noto-sans-sc 的静态 Regular/Bold（OFL 许可，pnpm install 自动下载，仓库不存字体）> 系统字体兜底。
// 必须用静态字体：resvg 不支持可变字体的字重，粗体会和常规一样粗。
function bundledFonts() {
  try {
    const dir = dirname(require.resolve('@expo-google-fonts/noto-sans-sc/package.json'));
    return [join(dir, '400Regular', 'NotoSansSC_400Regular.ttf'), join(dir, '700Bold', 'NotoSansSC_700Bold.ttf')];
  } catch { return []; }
}
const BUNDLED = bundledFonts().filter(path => existsSync(path));
const SYSTEM_FONTS = ['C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\msyhbd.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc'];
const CUSTOM = process.env.TG_IMAGE_FONT && existsSync(process.env.TG_IMAGE_FONT) ? [process.env.TG_IMAGE_FONT] : [];
const FONTS = [...CUSTOM, ...(BUNDLED.length === 2 ? BUNDLED : SYSTEM_FONTS.filter(path => existsSync(path)))];
const FAMILY = CUSTOM.length || BUNDLED.length === 2 ? 'Noto Sans SC' : FONTS[0]?.includes('msyh') ? 'Microsoft YaHei' : 'Noto Sans CJK SC';
const log = new Logger('NoticeImage');

export function parseCards(text: string) {
  const test = text.startsWith('【测试发送】');
  const cards: NoticeCard[] = text.replace(/^【测试发送】\n?/, '').split('\n\n').map(block => block.split('\n').filter(line => line.trim())).filter(lines => lines.length)
    .map(([first, ...lines]) => {
      const lamp = ORDER.find(key => first.startsWith(key)) ?? '';
      return { lamp, title: first.slice(lamp.length).replace(/^\uFE0F/, '').trim(), lines };
    });
  return { test, cards };
}
function count(cards: NoticeCard[]) {
  const counts: Record<string, number> = {};
  for (const card of cards) if (card.lamp) counts[card.lamp] = (counts[card.lamp] ?? 0) + 1;
  return counts;
}
// 图注：通知栏预览只显示图注，所以写明总数、各状态数量和需要关注的环境，编号仍可复制。
export function noticeCaption(text: string, name: string) {
  const { test, cards } = parseCards(text), counts = count(cards);
  const abnormal = cards.filter(card => card.lamp === '🔴' || card.lamp === '🟠');
  return [(test ? '【测试发送】' : '') + name + '｜共 ' + cards.length + ' 项', ORDER.filter(key => counts[key]).map(key => key + ' ' + counts[key]).join(' · '),
    ...abnormal.slice(0, 8).map(card => card.lamp + ' ' + card.title), abnormal.length > 8 ? '…另有 ' + (abnormal.length - 8) + ' 项需关注，见图' : ''].filter(Boolean).join('\n').slice(0, 1024);
}

// 运行异常的图注：只留标题和可复制的编号、事件号，其余内容在图里。
export function alertCaption(text: string) {
  const { test, cards } = parseCards(text);
  return cards.flatMap((card, index) => [(test && !index ? '【测试发送】' : '') + (card.lamp ? card.lamp + ' ' : '') + card.title, ...card.lines.filter(line => /^(#|事件：)/.test(line))]).join('\n').slice(0, 1024);
}

// 长模板与连续编号均按实际宽度换行，完整保留图中的内容。
function wrap(line: string, px: number, max: number) {
  const rows: string[] = [];
  let row = '', width = 0;
  for (const char of line) {
    const advance = (char.codePointAt(0) ?? 0) > 0x2000 ? px : px * 0.6;
    if (row && width + advance > max) { rows.push(row); row = ''; width = 0; }
    row += char;
    width += advance;
  }
  rows.push(row);
  return rows;
}
const esc = (s: string) => s.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
function layout(card: NoticeCard, inner = INNER): Item {
  const title = wrap(card.title, TITLE_PX, inner);
  const lines = card.lines.flatMap(line => wrap(line, TEXT_PX, inner));
  return { card, title, lines, height: CARD_PAD * 2 + TITLE_H + (title.length - 1) * TITLE_LINE + lines.length * LINE_H };
}

function cardSvg({ card, title, lines }: Item, x: number, y: number, height: number, t: NoticeTheme, w = COL_W) {
  const color = LAMPS[card.lamp] ?? '#9AA7B4';
  const dot = card.lamp ? `<circle cx='${x + 32}' cy='${y + CARD_PAD + 19}' r='9' fill='${color}'/>` : '';
  const rows = lines.map((line, i) => `<text x='${x + TEXT_X}' y='${y + CARD_PAD + TITLE_H + (title.length - 1) * TITLE_LINE + i * LINE_H + 23}' font-size='${TEXT_PX}' fill='${t.text}'>${esc(line)}</text>`).join('');
  return `<rect x='${x}' y='${y}' width='${w}' height='${height}' rx='12' fill='#FFFFFF' stroke='${t.border}'/><rect x='${x}' y='${y + 10}' width='6' height='${height - 20}' rx='3' fill='${color}'/>${dot}` +
    `${title.map((row, n) => `<text x='${x + TEXT_X}' y='${y + CARD_PAD + 28 + n * TITLE_LINE}' font-size='${TITLE_PX}' font-weight='700' fill='${t.title}'>${esc(row)}</text>`).join('')}${rows}`;
}
function noticeSvg(items: Item[], options: NoticeImageOptions, test: boolean, counts: Record<string, number>) {
  let y = HEAD, body = '';
  const area = items.reduce((sum, item) => sum + item.height + GAP, 0);
  const cols = options.single ? 1 : Math.max(2, Math.ceil(Math.sqrt(area / ((COL_W + GAP) * 2))));
  const cardW = options.single ? W - PAD * 2 : COL_W;
  const width = 2 * PAD + cols * cardW + (cols - 1) * GAP;
  for (let i = 0; i < items.length; i += cols) {
    const pair = items.slice(i, i + cols), height = Math.max(...pair.map(item => item.height));
    pair.forEach((item, j) => { body += cardSvg(item, PAD + j * (COL_W + GAP), y, height, options.theme ?? THEME_BLUE, cardW); });
    y += height + GAP;
  }
  const H = y + 40, t = options.theme ?? THEME_BLUE;
  const chips = ORDER.filter(key => counts[key] && !options.single).map((key, i, all) => {
    const x = width - PAD - (all.length - i) * 84;
    return `<circle cx='${x + 10}' cy='112' r='9' fill='${LAMPS[key]}'/><text x='${x + 26}' y='120' font-size='24' font-weight='700' fill='${t.title}'>${counts[key]}</text>`;
  }).join('');
  const badge = test ? `<rect x='${width - PAD - 120}' y='22' width='120' height='34' rx='17' fill='#FFF1DD' stroke='#E08A1E'/><text x='${width - PAD - 60}' y='46' font-size='20' text-anchor='middle' fill='#B26200'>测试发送</text>` : '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${H}' viewBox='0 0 ${width} ${H}' font-family='${FAMILY}, sans-serif'>` +
    `<defs><linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${t.bgFrom}'/><stop offset='1' stop-color='${t.bgTo}'/></linearGradient><pattern id='grid' width='54' height='54' patternUnits='userSpaceOnUse'><path d='M54 0H0V54' fill='none' stroke='${t.grid}'/></pattern></defs>` +
    `<rect width='${width}' height='${H}' fill='url(#bg)'/><rect width='${width}' height='${H}' fill='url(#grid)'/>` +
    `<rect x='${PAD}' y='34' width='8' height='20' fill='${t.accent}'/><text x='${PAD + 18}' y='52' font-size='20' font-weight='700' fill='${t.sub}'>EPAY  /  OPERATIONS</text>` +
    `<text x='${PAD}' y='112' font-size='56' font-weight='700' fill='${t.title}'>${esc(options.title)}</text>` +
    `<text x='${PAD + 2}' y='146' font-size='22' font-weight='700' letter-spacing='2' fill='${t.sub}'>${esc(options.english)}</text>` +
    `<text x='${width - PAD}' y='86' font-size='30' font-weight='700' text-anchor='end' fill='${t.title}'>${options.single ? '' : '共 ' + items.length + ' 项'}</text>${badge}${chips}${body}` +
    `<text x='${PAD}' y='${H - 14}' font-size='16' fill='${t.text}'>OPERATIONS DESK</text><text x='${width - PAD}' y='${H - 14}' font-size='16' text-anchor='end' fill='${t.text}'>${esc(options.fig)}</text></svg>`;
  return { svg, width, height: H };
}

// 超出 Telegram 照片规格时保留矢量原图，避免生成巨幅位图或缩小到文字不可读。
export function renderNoticeImage(text: string, options: NoticeImageOptions): { data: Buffer; format: 'png' | 'svg' } | null {
  const { test, cards } = parseCards(text);
  if (!cards.length) return null;
  const inner = options.single ? W - PAD * 2 - TEXT_X - 18 : INNER;
  const { svg, width, height } = noticeSvg(cards.map(card => layout(card, inner)), options, test, count(cards));
  if (FONTS.length && width + height <= 10000 && Math.max(width / height, height / width) <= 20) {
    try {
      const data = Buffer.from(new Resvg(svg, { font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: FAMILY } }).render().asPng());
      if (data.length <= 10_000_000) return { data, format: 'png' };
    } catch (error) {
      log.warn('通知 PNG 绘制失败：' + (error as Error).message);
    }
  }
  return { data: Buffer.from(svg), format: 'svg' };
}
