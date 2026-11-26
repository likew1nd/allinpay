import { BadRequestException } from '@nestjs/common';

export function object(input: unknown, allowed: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new BadRequestException('请求字段无效');
  return input as Record<string, unknown>;
}
export function text(value: unknown, max = 191) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new BadRequestException('文本为空或长度超出范围');
  return value.trim();
}
export function boolean(value: unknown) {
  if (typeof value !== 'boolean') throw new BadRequestException('开关值无效');
  return value;
}
export function integer(value: unknown, min = 0, max = 2147483647) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new BadRequestException('整数参数超出范围');
  return value;
}
export function page(query: Record<string, unknown>) {
  const current = integer(Number(query.current ?? 1), 1, 100000);
  const size = integer(Number(query.size ?? 20), 1, 100);
  return { current, size, skip: (current - 1) * size, take: size };
}
