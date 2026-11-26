import { views } from '@/router/elegant/imports';
import { $t } from '@/locales';
import { request } from '../request';

type BackendStatus = 'ENABLED' | 'DISABLED' | 'BANNED';
interface Audit {
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  status: BackendStatus;
}
interface RoleRecord extends Audit {
  id: string;
  name: string;
  code: string;
  description: string | null;
}
interface UserRecord extends Audit {
  id: string;
  username: string;
  nickName: string;
  phoneNumber: string | null;
  email: string | null;
  roleIds: string[];
}
interface MenuRecord extends Audit {
  id: number;
  pid: number;
  menuName: string;
  menuType: 'directory' | 'menu';
  routeName: string;
  routePath: string;
  component: string;
  pathParam: string | null;
  icon: string | null;
  iconType: number | null;
  order: number;
  i18nKey: string | null;
  constant: boolean;
  keepAlive: boolean | null;
  hideInMenu: boolean | null;
  activeMenu: string | null;
  href: string | null;
  multiTab: boolean | null;
  children?: MenuRecord[];
}
function toStatus(status?: Api.Common.EnableStatus | null): BackendStatus | undefined {
  if (!status) return undefined;
  return status === '1' ? 'ENABLED' : 'DISABLED';
}
function audit(row: Audit) {
  return {
    status: (row.status === 'ENABLED' ? '1' : '2') as Api.Common.EnableStatus,
    createTime: row.createdAt ?? '',
    updateTime: row.updatedAt ?? '',
    createBy: row.createdBy ?? '',
    updateBy: row.updatedBy ?? ''
  };
}
function role(row: RoleRecord): Api.SystemManage.Role {
  return { ...audit(row), id: row.id, roleName: row.name, roleCode: row.code, roleDesc: row.description ?? '' };
}
function user(row: UserRecord): Api.SystemManage.User {
  return {
    ...audit(row),
    id: row.id,
    userName: row.username,
    nickName: row.nickName,
    userPhone: row.phoneNumber ?? '',
    userEmail: row.email ?? '',
    userRoles: row.roleIds
  };
}
function menu(row: MenuRecord): Api.SystemManage.Menu {
  return {
    ...audit(row),
    id: row.id,
    parentId: row.pid,
    menuType: row.menuType === 'directory' ? '1' : '2',
    menuName: row.menuName,
    routeName: row.routeName,
    routePath: row.routePath + (row.pathParam ? `/:${row.pathParam}` : ''),
    component: row.component,
    icon: row.icon ?? '',
    iconType: row.iconType === 2 ? '2' : '1',
    order: row.order,
    i18nKey: row.i18nKey as App.I18n.I18nKey | null,
    constant: row.constant,
    keepAlive: row.keepAlive ?? false,
    hideInMenu: row.hideInMenu ?? false,
    activeMenu: row.activeMenu as Api.SystemManage.Menu['activeMenu'],
    href: row.href,
    multiTab: row.multiTab ?? false,
    children: row.children?.map(menu)
  };
}
export async function fetchGetRoleList(params?: Api.SystemManage.RoleSearchParams) {
  const result = await request<Api.Common.PaginatingQueryRecord<RoleRecord>>({
    url: '/role',
    params: {
      current: params?.current ?? 1,
      size: params?.size ?? 10,
      name: params?.roleName || undefined,
      code: params?.roleCode || undefined,
      status: toStatus(params?.status)
    }
  });
  if (result.error) return result;
  return { ...result, data: { ...result.data, records: result.data.records.map(role) } };
}
export async function fetchGetAllRoles() {
  const result = await fetchGetRoleList({
    current: 1,
    size: 100,
    roleName: undefined,
    roleCode: undefined,
    status: undefined
  });
  if (result.error) return result;
  const records = [...result.data.records];
  // Stop fetching as soon as a page fails or the server returns no more roles.
  /* eslint-disable no-await-in-loop */
  for (let current = 2; records.length < result.data.total; current += 1) {
    const page = await fetchGetRoleList({
      current,
      size: 100,
      roleName: undefined,
      roleCode: undefined,
      status: undefined
    });
    if (page.error) return page;
    if (!page.data.records.length) break;
    records.push(...page.data.records);
  }
  /* eslint-enable no-await-in-loop */
  return { ...result, data: records };
}
export async function fetchGetUserList(params?: Api.SystemManage.UserSearchParams) {
  const result = await request<Api.Common.PaginatingQueryRecord<UserRecord>>({
    url: '/user',
    params: {
      current: params?.current ?? 1,
      size: params?.size ?? 10,
      username: params?.userName || undefined,
      nickName: params?.nickName || undefined,
      status: toStatus(params?.status)
    }
  });
  if (result.error) return result;
  return { ...result, data: { ...result.data, records: result.data.records.map(user) } };
}
export async function fetchGetMenuList({ current, size }: Api.Common.CommonSearchParams) {
  const result = await request<MenuRecord[]>({ url: '/route' });
  if (result.error) return result;
  const start = (current - 1) * size;
  const records = result.data.slice(start, start + size).map(menu);
  return { ...result, data: { records, current, size, total: result.data.length } };
}
export async function fetchGetAllPages() {
  return { data: Object.keys(views), error: null };
}
export async function fetchGetMenuTree() {
  const result = await request<MenuRecord[]>({ url: '/route/tree' });
  if (result.error) return result;
  function tree(row: MenuRecord): Api.SystemManage.MenuTree {
    const label = row.i18nKey ? $t(row.i18nKey as App.I18n.I18nKey, row.menuName) : row.menuName;
    return { id: row.id, label, pId: row.pid, children: row.children?.map(tree) };
  }
  return { ...result, data: result.data.map(tree) };
}
export function fetchSaveRole(
  model: Pick<Api.SystemManage.Role, 'roleName' | 'roleCode' | 'roleDesc' | 'status'>,
  id?: string
) {
  return request({
    url: '/role',
    method: id ? 'put' : 'post',
    data: {
      id,
      name: model.roleName,
      code: model.roleCode,
      description: model.roleDesc || null,
      status: toStatus(model.status),
      pid: '0'
    }
  });
}
export function fetchDeleteRole(id: string) {
  return request({ url: `/role/${encodeURIComponent(id)}`, method: 'delete' });
}
export function fetchSaveUser(
  model: Pick<Api.SystemManage.User, 'userName' | 'nickName' | 'userPhone' | 'userEmail' | 'userRoles' | 'status'> & {
    password: string;
  },
  id?: string
) {
  return request({
    url: '/user',
    method: id ? 'put' : 'post',
    data: {
      id,
      username: model.userName,
      nickName: model.nickName,
      email: model.userEmail || null,
      phoneNumber: model.userPhone || null,
      avatar: null,
      status: toStatus(model.status),
      roleIds: model.userRoles,
      ...(id ? {} : { domain: 'built-in', password: model.password })
    }
  });
}
export function fetchDeleteUser(id: string) {
  return request({ url: `/user/${encodeURIComponent(id)}`, method: 'delete' });
}
export function fetchSaveMenu(
  model: Omit<Api.SystemManage.Menu, 'id' | 'createBy' | 'createTime' | 'updateBy' | 'updateTime'>,
  id?: number
) {
  const [routePath, pathParam] = model.routePath.split('/:');
  return request({
    url: '/route',
    method: id ? 'put' : 'post',
    data: {
      id,
      menuName: model.menuName,
      menuType: model.menuType === '1' ? 'directory' : 'menu',
      pid: model.parentId,
      routeName: model.routeName,
      routePath,
      pathParam: pathParam || null,
      component: model.component,
      icon: model.icon || null,
      iconType: Number(model.iconType),
      status: toStatus(model.status),
      order: model.order ?? 0,
      i18nKey: model.i18nKey || null,
      constant: model.constant ?? false,
      keepAlive: model.keepAlive ?? false,
      href: model.href || null,
      hideInMenu: model.hideInMenu ?? false,
      activeMenu: model.activeMenu || null,
      multiTab: model.multiTab ?? false
    }
  });
}
export function fetchDeleteMenu(id: number) {
  return request({ url: `/route/${id}`, method: 'delete' });
}
export function fetchGetRoleMenus(roleId: string) {
  return request<number[]>({ url: `/route/auth-route/${encodeURIComponent(roleId)}` });
}
export function fetchAssignRoleMenus(roleId: string, routeIds: number[]) {
  return request({
    url: '/authorization/assign-routes',
    method: 'post',
    data: { domain: 'built-in', roleId, routeIds }
  });
}

export interface ApiEndpoint {
  id: string;
  controller?: string;
  resource: string;
  action: string;
  path: string;
  method: string;
  summary: string | null;
  children?: ApiEndpoint[];
}
export function fetchGetApiEndpointTree() {
  return request<ApiEndpoint[]>({ url: '/api-endpoint/tree' });
}
export function fetchGetRoleApiPermissions(roleCode: string) {
  return request<{ v1: string; v2: string }[]>({
    url: `/api-endpoint/auth-api-endpoint/${encodeURIComponent(roleCode)}`
  });
}
export function fetchAssignRoleApiPermissions(roleId: string, permissions: string[]) {
  return request({
    url: '/authorization/assign-permission',
    method: 'post',
    data: { domain: 'built-in', roleId, permissions }
  });
}
