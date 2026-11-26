import { createApp, nextTick } from 'vue';
import './plugins/assets';
import './plugins/ui';
import { setupAppVersionNotification, setupDayjs, setupIconifyOffline, setupLoading, setupNProgress } from './plugins';
import { setupStore } from './store';
import { setupRouter } from './router';
import { setupI18n } from './locales';
import App from './App.vue';

async function setupApp() {
  const loading = setupLoading();

  try {
    setupNProgress();
    setupIconifyOffline();
    setupDayjs();

    const app = createApp(App);
    setupStore(app);

    loading.setStep('routes');
    await setupRouter(app, () => loading.setStep('page'));

    setupI18n(app);
    setupAppVersionNotification();
    app.mount('#app');
    await nextTick();
    loading.finish();
  } catch (error) {
    console.error('应用启动失败', error);
    window.NProgress?.done();
    loading.fail();
  }
}

setupApp();
