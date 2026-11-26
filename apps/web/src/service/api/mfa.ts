import { request } from '../request';

export interface MfaStatus {
  enabled: boolean;
  bound: boolean;
  pending: boolean;
}
export function fetchMfaStatus() {
  return request<MfaStatus>({ url: '/mfa', method: 'get' });
}
export function beginMfaBinding() {
  return request<{ secret: string; otpauthUri: string }>({ url: '/mfa/bind', method: 'post' });
}
export function confirmMfaBinding(code: string) {
  return request<{ bound: boolean }>({ url: '/mfa/bind/confirm', method: 'post', data: { code } });
}
export function setMfaEnabled(enabled: boolean, code: string) {
  return request<{ enabled: boolean }>({ url: '/mfa/enabled', method: 'patch', data: { enabled, code } });
}
