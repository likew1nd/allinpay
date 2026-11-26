import type { MessageEntity } from 'grammy/types';

// 只给原文标注样式，模板、环境名中的尖括号等字符不被解释为 HTML。
export function environmentCardEntities(text: string): MessageEntity[] {
  const entities: MessageEntity[] = [];
  const tag = '【测试发送】\n';
  let offset = text.startsWith(tag) ? tag.length : 0;
  if (offset) entities.push({ type: 'italic', offset: 0, length: tag.length - 1 });
  for (const block of text.slice(offset).split('\n\n')) {
    if (block.trim() && entities.length <= 98) {
      entities.push({ type: 'blockquote', offset, length: block.trimEnd().length });
      const title = block.split('\n', 1)[0].trimEnd();
      if (title) entities.push({ type: 'bold', offset, length: title.length });
    }
    offset += block.length + 2;
  }
  return entities;
}

// 发送用：块与块之间只留一个换行。Telegram 对引用块自带上下间距，再加空行会出现很大的空隙。
export function environmentCard(text: string): { text: string; entities: MessageEntity[] } {
  const tag = '【测试发送】\n';
  const entities: MessageEntity[] = [];
  let result = '';
  if (text.startsWith(tag)) { entities.push({ type: 'italic', offset: 0, length: tag.length - 1 }); result = tag; }
  const blocks = text.slice(result.length).split('\n\n').map(block => block.trimEnd()).filter(block => block.trim());
  blocks.forEach((block, index) => {
    if (index) result += '\n';
    const offset = result.length;
    if (entities.length <= 98) {
      entities.push({ type: 'blockquote', offset, length: block.length });
      const title = block.split('\n', 1)[0];
      if (title) entities.push({ type: 'bold', offset, length: title.length });
    }
    result += block;
  });
  return { text: result, entities };
}
