import { ulid } from 'ulid';
import { ReserveChannelDto, StrategyConfigurationDto } from './dto/template.dto';

export const newId = (prefix: string) => `${prefix}-${ulid().toLowerCase()}`;

export function configurationFrom(value: unknown): StrategyConfigurationDto | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as StrategyConfigurationDto;
  return {
    controlType: input.controlType ?? 'RULE_ACTIONS',
    windowMinutes: input.windowMinutes,
    minSamples: input.minSamples ?? 1,
    cooldownSeconds: input.cooldownSeconds,
    minWeight: input.minWeight,
    maxWeight: input.maxWeight,
    rules: input.rules,
  };
}

export function reserveChannelsFrom(value: unknown): ReserveChannelDto[] {
  return Array.isArray(value) ? (value as ReserveChannelDto[]) : [];
}

