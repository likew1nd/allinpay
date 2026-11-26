import { addAPIProvider, addCollection } from '@iconify/vue';
import menuIcons from '@/assets/icons/menu-icons.json';

/** Setup the iconify offline */
export function setupIconifyOffline() {
  // 菜单图标随应用打包，首次加载无需请求外部图标服务。
  addCollection(menuIcons);

  const { VITE_ICONIFY_URL } = import.meta.env;

  if (VITE_ICONIFY_URL) {
    addAPIProvider('', { resources: [VITE_ICONIFY_URL] });
  }
}
