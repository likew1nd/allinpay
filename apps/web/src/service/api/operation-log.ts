import { request } from '../request';

export interface OperationLogRecord {
  id: string;
  username: string;
  moduleName: string;
  description: string;
  method: string;
  url: string;
  source: 'USER' | 'SYSTEM';
  level: 'INFO' | 'WARN' | 'ERROR';
  status: string;
  objectName: string | null;
  params: unknown;
  body: unknown;
  response: unknown;
  endTime: string;
  duration?: number;
  relatedId: string | null;
}

export function fetchOperationLogs(params?: Record<string, unknown>) {
  return request<Api.Common.PaginatingQueryRecord<OperationLogRecord>>({
    url: '/operation-log',
    method: 'get',
    params
  });
}
