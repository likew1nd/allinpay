<script setup lang="ts">
import { useAppStore } from '@/store/modules/app';
import { useThemeStore } from '@/store/modules/theme';
import { $t } from '@/locales';
import PwdLogin from './modules/pwd-login.vue';
import ForestMotionBackground from './modules/forest-motion-background.vue';

defineOptions({ name: 'LoginPage' });

const appStore = useAppStore();
const themeStore = useThemeStore();
const currentYear = new Date().getFullYear();
</script>

<template>
  <div class="senlin-login">
    <ForestMotionBackground />
    <div class="senlin-rings" aria-hidden="true">
      <i v-for="ring in 7" :key="ring" :style="{ '--ring': ring }" />
    </div>

    <div class="senlin-login-layout">
      <header class="senlin-login-header">
        <div class="senlin-brand">
          <SystemLogo class="senlin-brand-mark" />
          <div>
            <div class="senlin-brand-name">{{ $t('system.title') }}</div>
            <div class="senlin-brand-en">SENLIN TECHNOLOGY</div>
          </div>
        </div>
        <LangSwitch
          v-if="themeStore.header.multilingual.visible"
          class="senlin-language"
          :lang="appStore.locale"
          :lang-options="appStore.localeOptions"
          :show-tooltip="false"
          @change-lang="appStore.changeLocale"
        />
      </header>

      <div class="senlin-login-content">
        <section class="senlin-hero" :aria-label="$t('system.title')">
          <div class="senlin-hero-copy">
            <p class="senlin-eyebrow">{{ $t('page.login.common.brandEyebrow') }}</p>
            <h1>
              {{ $t('page.login.common.brandHeadlineFirst') }}
              <br />
              <em>{{ $t('page.login.common.brandHeadlineSecond') }}</em>
            </h1>
            <p class="senlin-description">{{ $t('page.login.common.brandDescription') }}</p>
          </div>
          <div class="senlin-sculpture" aria-hidden="true">
            <div class="senlin-plinth" />
            <i class="senlin-pillar senlin-pillar-left" />
            <i class="senlin-pillar senlin-pillar-center" />
            <i class="senlin-pillar senlin-pillar-right" />
          </div>
        </section>

        <main class="senlin-auth-content">
          <p class="senlin-auth-kicker">{{ $t('page.login.common.workspaceKicker') }}</p>
          <h2>{{ $t('page.login.common.greeting') }}</h2>
          <p class="senlin-auth-intro">{{ $t('page.login.common.loginIntro') }}</p>
          <Transition :name="themeStore.page.animateMode" :css="!themeStore.reducedMotion" mode="out-in" appear>
            <PwdLogin />
          </Transition>
        </main>
      </div>

      <footer class="senlin-login-footer">
        <span class="senlin-platform">
          <i aria-hidden="true" />
          {{ $t('page.login.common.brandPlatformName') }}
        </span>
        <span>© {{ currentYear }} {{ $t('system.title') }} · SENLIN TECHNOLOGY</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.senlin-login {
  --login-ink: #edf5ff;
  --login-muted: #adc1d8;
  --login-field: #142e49b8;
  --login-line: #6b9dd54d;
  --login-action: #007aff;
  position: relative;
  isolation: isolate;
  height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  color: var(--login-ink);
  background:
    radial-gradient(ellipse at 18% 55%, #16467680, transparent 65%),
    radial-gradient(ellipse at 90% 18%, #0d356356, transparent 60%), #0b192c;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color-scheme: dark;
}

.senlin-login-layout {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  min-height: 100dvh;
  flex-direction: column;
  margin: 0 auto;
  padding: 32px clamp(28px, 4vw, 64px) 24px;
}

.senlin-login-header {
  display: flex;
  width: 100%;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin: 0 auto;
}

.senlin-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.senlin-brand-mark {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
}

.senlin-brand-name {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 2px;
}

.senlin-brand-en {
  margin-top: 4px;
  color: var(--login-muted);
  font-size: 10px;
  letter-spacing: 2px;
}

.senlin-language {
  min-width: 44px;
  min-height: 44px;
  color: var(--login-muted);
}

.senlin-login-content {
  display: grid;
  flex: 1;
  width: min(100%, 1080px);
  margin: 0 auto;
  grid-template-columns: minmax(0, 1fr) minmax(0, 400px);
  align-items: center;
  gap: clamp(48px, 7vw, 120px);
  padding: 36px 0;
}

.senlin-hero {
  position: relative;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.senlin-hero-copy {
  position: relative;
  z-index: 1;
}

.senlin-eyebrow {
  margin: 0 0 22px;
  color: #abc7e7;
  font-size: 10px;
  letter-spacing: 3px;
}

.senlin-hero-copy h1 {
  margin: 0;
  font-size: 52px;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 1px;
}

.senlin-hero-copy h1 em {
  color: #2797ff;
  font-style: normal;
}

.senlin-description {
  max-width: 350px;
  margin: 22px 0 0;
  color: var(--login-muted);
  font-size: 14px;
  line-height: 1.9;
}

.senlin-rings {
  position: fixed;
  z-index: 0;
  top: 25%;
  left: calc(50% - 750px);
  width: 900px;
  aspect-ratio: 1;
  pointer-events: none;
  transform: translate(var(--senlin-px, 0px), var(--senlin-py, 0px)) rotate(-25deg);
}

.senlin-rings i {
  position: absolute;
  inset: calc(var(--ring) * 4%);
  border: 1px solid #a0cfff0b;
  border-radius: 44% 55% 47% 53%;
  transform: rotate(calc(var(--ring) * 9deg));
}

.senlin-sculpture {
  position: relative;
  width: 250px;
  height: 155px;
  flex: 0 0 155px;
  align-self: flex-start;
  margin: 28px 0 0;
  opacity: 0.6;
  transform: translate(var(--senlin-px, 0px), var(--senlin-py, 0px)) scale(0.75);
  transform-origin: bottom left;
}

.senlin-plinth {
  position: absolute;
  bottom: 1px;
  left: 26px;
  width: 200px;
  height: 67px;
  border: 1px solid #77bdff32;
  border-radius: 50%;
  box-shadow:
    0 0 55px #168aff20,
    inset 0 0 30px #68baff12;
  transform: rotate(-12deg);
}

.senlin-pillar {
  position: absolute;
  bottom: 30px;
  width: 60px;
  height: 118px;
  background: linear-gradient(140deg, #dfedff90, #65a9ed57 38%, #17416e);
  clip-path: polygon(50% 0, 100% 18%, 100% 82%, 50% 100%, 0 82%, 0 18%);
  filter: drop-shadow(0 10px 12px #0005);
}

.senlin-pillar-left {
  left: 28px;
}

.senlin-pillar-center {
  bottom: 43px;
  left: 96px;
  height: 170px;
  background: linear-gradient(140deg, #eff7ffa8, #83bfff7a 38%, #155697);
}

.senlin-pillar-right {
  right: 26px;
  bottom: 15px;
  height: 130px;
}

.senlin-auth-content {
  position: relative;
  width: 100%;
  max-width: 430px;
  min-width: 0;
  justify-self: center;
  padding: 20px 0;
}

.senlin-auth-kicker {
  margin: 0 0 14px;
  color: #9dcaff;
  font-size: 10px;
  letter-spacing: 2.8px;
}

.senlin-auth-content h2 {
  margin: 0;
  font-size: 30px;
  font-weight: 500;
  line-height: 1.4;
}

.senlin-auth-intro {
  margin: 8px 0 24px;
  color: var(--login-muted);
  font-size: 14px;
  line-height: 1.7;
}

.senlin-login-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin: 0 auto;
  color: var(--login-muted);
  font-size: 11px;
  line-height: 1.7;
}

.senlin-platform {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.senlin-platform i {
  width: 25px;
  height: 1px;
  background: #5b9ded;
}

.senlin-auth-content :deep(.el-form-item) {
  margin-bottom: 24px;
}

.senlin-auth-content :deep(.el-form-item__label) {
  color: var(--login-ink);
  font-size: 13px;
}

.senlin-auth-content :deep(.el-input__wrapper) {
  min-height: 50px;
  padding: 0 15px;
  border: 1px solid var(--login-line);
  border-radius: 8px;
  background: var(--login-field);
  box-shadow: none;
  backdrop-filter: blur(12px);
}

.senlin-auth-content :deep(.el-input__wrapper.is-focus) {
  border-color: #2797ff;
  box-shadow: 0 0 0 3px #007aff25;
}

.senlin-auth-content :deep(.el-form-item.is-error .el-input__wrapper) {
  border-color: #ff7883;
}

.senlin-auth-content :deep(.el-form-item__error) {
  color: #ff9da5;
}

.senlin-auth-content :deep(.el-input__inner) {
  color: var(--login-ink);
  font-size: 14px;
}

.senlin-auth-content :deep(.el-input__inner::placeholder) {
  color: var(--login-muted);
}

.senlin-auth-content :deep(.el-checkbox__inner) {
  border-color: #6d8aa8;
  background: #142e49;
}

.senlin-auth-content :deep(.is-checked .el-checkbox__inner) {
  border-color: var(--login-action);
  background: var(--login-action);
}

.senlin-auth-content :deep(.el-button) {
  min-height: 44px;
  border-radius: 8px;
}

.senlin-auth-content :deep(.el-button--default) {
  --el-button-bg-color: #142e49b8;
  --el-button-text-color: var(--login-ink);
  --el-button-border-color: var(--login-line);
  --el-button-hover-bg-color: #1a3d60;
  --el-button-hover-text-color: #fff;
  --el-button-hover-border-color: #2797ff;
}

.senlin-auth-content :deep(.el-button--primary) {
  --el-button-bg-color: var(--login-action);
  --el-button-border-color: var(--login-action);
  --el-button-hover-bg-color: #168bff;
  --el-button-hover-border-color: #168bff;
}

.senlin-auth-content :deep(.el-button.is-round) {
  border-radius: 8px;
}

.senlin-auth-content :deep(.el-button:focus-visible),
.senlin-auth-content :deep(.el-checkbox__input.is-focus .el-checkbox__inner) {
  outline: 2px solid #7ec0ff;
  outline-offset: 3px;
}

@media (max-width: 960px) {
  .senlin-login-layout {
    width: 100%;
  }

  .senlin-login-content {
    grid-template-columns: minmax(0, 1fr) minmax(0, 350px);
    gap: 40px;
    padding: 32px 0;
  }

  .senlin-hero-copy h1 {
    font-size: 40px;
  }

  .senlin-eyebrow {
    max-width: 230px;
    line-height: 1.8;
  }

  .senlin-sculpture {
    align-self: center;
    margin-right: 0;
    transform: scale(0.82) translate(var(--senlin-px, 0px), var(--senlin-py, 0px));
    transform-origin: bottom center;
  }
}

@media (max-height: 520px) {
  .senlin-login-layout {
    padding-top: 10px;
    padding-bottom: 10px;
  }

  .senlin-login-header {
    min-height: 40px;
  }

  .senlin-login-content {
    gap: 32px;
    padding: 0;
  }

  .senlin-hero-copy h1 {
    font-size: 34px;
    line-height: 1.2;
  }

  .senlin-eyebrow {
    margin-bottom: 8px;
  }

  .senlin-description,
  .senlin-auth-kicker,
  .senlin-auth-intro {
    display: none;
  }

  .senlin-sculpture {
    display: none;
  }

  .senlin-auth-content {
    padding: 0;
  }

  .senlin-auth-content :deep(.el-form-item) {
    margin-bottom: 8px;
  }

  .senlin-auth-content h2 {
    margin-bottom: 10px;
    font-size: 24px;
  }

  .senlin-auth-content :deep(.el-input__wrapper) {
    min-height: 38px;
  }

  .senlin-auth-content :deep(.el-button) {
    min-height: 40px;
  }

  .senlin-auth-content :deep(.senlin-login-options) {
    margin-top: 4px;
    margin-bottom: 10px;
  }

  .senlin-login-footer {
    font-size: 9px;
  }
}

@media (max-width: 720px) {
  .senlin-login-layout {
    padding: max(22px, env(safe-area-inset-top)) 26px max(20px, env(safe-area-inset-bottom));
  }

  .senlin-brand-mark {
    width: 36px;
    height: 36px;
  }

  .senlin-brand-name {
    font-size: 18px;
  }

  .senlin-brand-en {
    font-size: 9px;
  }

  .senlin-login-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 30px;
    padding: 36px 0;
  }

  .senlin-hero {
    align-self: auto;
    width: min(100%, 390px);
  }

  .senlin-eyebrow,
  .senlin-description,
  .senlin-sculpture {
    display: none;
  }

  .senlin-hero-copy h1 {
    font-size: 30px;
    line-height: 1.3;
  }

  .senlin-auth-content {
    width: min(100%, 390px);
    padding: 0;
  }

  .senlin-auth-kicker {
    display: none;
  }

  .senlin-auth-content h2 {
    font-size: 25px;
  }

  .senlin-auth-intro {
    margin-bottom: 24px;
    font-size: 13px;
  }

  .senlin-auth-content :deep(.el-input__inner) {
    font-size: 16px;
  }

  .senlin-login-footer {
    flex-direction: column;
    gap: 7px;
    text-align: center;
    font-size: 10px;
  }

  .senlin-rings {
    top: 0;
    left: -210px;
    width: 800px;
    opacity: 0.65;
  }
}
</style>
