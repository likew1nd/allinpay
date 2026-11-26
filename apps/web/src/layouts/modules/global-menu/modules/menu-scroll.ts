interface MenuScrollBounds {
  scrollTop: number;
  viewportHeight: number;
  scrollHeight: number;
  itemTop: number;
  itemHeight: number;
}

export function getMenuScrollTop({
  scrollTop,
  viewportHeight,
  scrollHeight,
  itemTop,
  itemHeight
}: MenuScrollBounds): number {
  const inset = 8;
  let top = scrollTop;

  // 分组超出一屏时从标题开始展示，避免只看到末尾几个子项。
  if (itemTop < scrollTop + inset || itemHeight > viewportHeight - inset * 2) {
    top = itemTop - inset;
  } else if (itemTop + itemHeight > scrollTop + viewportHeight - inset) {
    top = itemTop + itemHeight - viewportHeight + inset;
  }

  return Math.max(0, Math.min(top, scrollHeight - viewportHeight));
}
