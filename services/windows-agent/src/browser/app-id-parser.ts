export interface AppIdRowText {
  firstColumnText: string;
  linkedText: string[];
}

export function parseAlipayAppIds(rows: AppIdRowText[]): string[] {
  const result = new Set<string>();
  for (const row of rows) {
    const linkedLines = new Set(row.linkedText.flatMap(text => text.split(/\r?\n/).map(line => line.trim())));
    const lines = row.firstColumnText.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    // 仅排除首行应用名，不要把链接中的独立 APPID 一并过滤。
    for (const [index, line] of lines.entries()) {
      if (/^\d{16,24}$/.test(line) && (index > 0 || !linkedLines.has(line))) result.add(line);
    }
  }
  return [...result];
}
