import type { CustomRoute, ElegantConstRoute, ElegantRoute } from '@elegant-router/types';
import { layouts, views } from '../elegant/imports';
import { generatedRoutes } from '../elegant/routes';
import { transformElegantRoutesToVueRoutes } from '../elegant/transform';
import { businessRoutes } from './business';

/** Constant routes used when the API is unavailable or static mode is selected. */
const customRoutes = [
  {
    name: 'login',
    path: '/login/:module(pwd-login|code-login|register|reset-pwd|bind-wechat)?',
    component: 'layout.blank$view.login',
    meta: { title: 'login', i18nKey: 'route.login', constant: true, hideInMenu: true }
  },
  {
    name: '403',
    path: '/403',
    component: 'layout.blank$view.403',
    meta: { title: '403', i18nKey: 'route.403', constant: true, hideInMenu: true }
  },
  {
    name: '404',
    path: '/404',
    component: 'layout.blank$view.404',
    meta: { title: '404', i18nKey: 'route.404', constant: true, hideInMenu: true }
  },
  {
    name: '500',
    path: '/500',
    component: 'layout.blank$view.500',
    meta: { title: '500', i18nKey: 'route.500', constant: true, hideInMenu: true }
  },
  {
    name: 'iframe-page',
    path: '/iframe-page/:url',
    component: 'layout.base$view.iframe-page',
    props: true,
    meta: { title: 'iframe-page', i18nKey: 'route.iframe-page', constant: true, hideInMenu: true }
  },
  {
    name: 'exception',
    path: '/exception',
    component: 'layout.base',
    meta: {
      title: 'exception',
      i18nKey: 'route.exception',
      icon: 'ant-design:exception-outlined',
      order: 99
    },
    children: [
      {
        name: 'exception_403',
        path: '/exception/403',
        component: 'view.403',
        meta: { title: 'exception_403', i18nKey: 'route.exception_403', icon: 'ic:baseline-block' }
      },
      {
        name: 'exception_404',
        path: '/exception/404',
        component: 'view.404',
        meta: { title: 'exception_404', i18nKey: 'route.exception_404', icon: 'ic:baseline-web-asset-off' }
      },
      {
        name: 'exception_500',
        path: '/exception/500',
        component: 'view.500',
        meta: { title: 'exception_500', i18nKey: 'route.exception_500', icon: 'ic:baseline-wifi-off' }
      }
    ]
  }
] as unknown as CustomRoute[];

/** Create routes for static fallback mode. Dynamic mode uses the database menu response as its source of truth. */
export function createStaticRoutes() {
  const constantRoutes: ElegantRoute[] = [];
  const authRoutes: ElegantRoute[] = [];

  customRoutes.forEach(item => {
    if (item.meta?.constant) {
      constantRoutes.push(item);
    } else {
      authRoutes.push(item);
    }
  });

  authRoutes.push(...businessRoutes);
  authRoutes.push(...generatedRoutes.filter(item => item.name === 'manage'));

  return { constantRoutes, authRoutes };
}

export function getAuthVueRoutes(routes: ElegantConstRoute[]) {
  return transformElegantRoutesToVueRoutes(routes, layouts, views);
}
