export type SiteControlAction =
  | 'SET_CHANNEL_STATUS'
  | 'SET_POLLING_GROUP_STATUS'
  | 'SET_POLLING_MEMBER_WEIGHTS'
  | 'ADD_POLLING_MEMBER'
  | 'REMOVE_POLLING_MEMBER';

export interface SiteControlTarget {
  channelCode?: string;
  groupCode?: string;
}

export interface SiteControlCommand {
  id: string;
  idempotencyKey: string;
  action: SiteControlAction;
  target: SiteControlTarget;
  expectedState: Record<string, unknown>;
  desiredState: Record<string, unknown>;
  strategyVersion: number;
  targetVersion: string;
  expiresAt: string;
}

export interface SiteControlResult {
  status: 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'SKIPPED';
  beforeState?: Record<string, unknown>;
  actualState?: Record<string, unknown>;
  failureReason?: string;
}
