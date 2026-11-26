import { SetMetadata } from '@nestjs/common';

interface LogOptions {
  logParams?: boolean;
  logBody?: boolean;
  logResponse?: boolean;
}

export interface OperationLogContext {
  description?: string;
  objectId?: string;
  objectName?: string;
  body?: unknown;
}

export function setOperationLogContext(
  request: { operationLogContext?: OperationLogContext },
  context: OperationLogContext,
) {
  request.operationLogContext = context;
}

export const LOG_KEY = 'log';
export const Log = (
  moduleName: string,
  description: string,
  options?: LogOptions,
) => SetMetadata(LOG_KEY, { moduleName, description, ...options });
