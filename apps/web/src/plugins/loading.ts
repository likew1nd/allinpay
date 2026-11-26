// @unocss-include
import { getRgb } from '@sa/color';
import { DARK_CLASS } from '@/constants/app';
import { localStg } from '@/utils/storage';
import { toggleHtmlClass } from '@/utils/common';
import logoSvg from '@/assets/svg-icon/logo.svg?raw';
import { $t } from '@/locales';

const loadingSteps = [
  { key: 'runtime', label: '加载运行环境', detail: '正在初始化界面组件和本地配置' },
  { key: 'routes', label: '加载路由与权限', detail: '正在准备基础路由、登录状态和可用菜单' },
  { key: 'page', label: '准备页面', detail: '正在加载页面资源并准备界面' }
] as const;

type LoadingStep = (typeof loadingSteps)[number]['key'];

export function setupLoading() {
  const themeColor = localStg.get('themeColor') || '#007aff';
  const darkMode = localStg.get('darkMode') || false;
  const motion = localStg.get('themeSettings')?.motionPreference ?? localStg.get('motionPreference');
  document.documentElement.dataset.motion = motion === 'reduced' ? 'reduced' : 'full';

  const { r, g, b } = getRgb(themeColor);

  if (darkMode) {
    toggleHtmlClass(DARK_CLASS).add();
  }

  const loading = `
<style>
  .epay-boot,
  .epay-boot * {
    box-sizing: border-box;
  }

  .epay-boot {
    --epay-primary: ${r} ${g} ${b};
    position: fixed;
    z-index: 9999;
    inset: 0;
    overflow-x: hidden;
    overflow-y: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 32px;
    color: #f4f8ff;
    background:
      radial-gradient(circle at 78% 18%, rgb(var(--epay-primary) / 0.2), transparent 30%),
      radial-gradient(circle at 14% 86%, rgb(47 120 255 / 0.12), transparent 32%),
      linear-gradient(135deg, #071426 0%, #0b1b32 52%, #101f3a 100%);
    font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
  }

  .epay-boot::before {
    position: absolute;
    inset: 0;
    background-image: linear-gradient(rgb(255 255 255 / 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgb(255 255 255 / 0.035) 1px, transparent 1px);
    background-size: 56px 56px;
    mask-image: linear-gradient(to bottom, transparent, black 24%, black 78%, transparent);
    content: '';
    pointer-events: none;
  }

  .epay-boot::after {
    position: absolute;
    width: 520px;
    height: 520px;
    border: 1px solid rgb(111 174 255 / 0.12);
    border-radius: 50%;
    box-shadow: 0 0 0 48px rgb(111 174 255 / 0.025), 0 0 0 96px rgb(111 174 255 / 0.018);
    content: '';
    pointer-events: none;
  }

  .epay-boot__shell {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(360px, 0.92fr);
    gap: clamp(56px, 8vw, 128px);
    width: min(1080px, 100%);
    margin-block: auto;
    align-items: center;
  }

  .epay-boot__brand {
    max-width: 500px;
  }

  .epay-boot__eyebrow,
  .epay-boot__panel-kicker,
  .epay-boot__panel-code,
  .epay-boot__footer {
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .epay-boot__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
    color: #8fb9ef;
    font-size: 11px;
    font-weight: 700;
  }

  .epay-boot__eyebrow-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #54a7ff;
    box-shadow: 0 0 0 5px rgb(84 167 255 / 0.12), 0 0 18px rgb(84 167 255 / 0.75);
  }

  .epay-boot__brand h1 {
    margin: 0;
    color: #ffffff;
    font-size: clamp(36px, 5vw, 58px);
    font-weight: 650;
    letter-spacing: -0.045em;
    line-height: 1.08;
  }

  .epay-boot__brand p {
    max-width: 380px;
    margin: 20px 0 0;
    color: #9bb0ca;
    font-size: 16px;
    line-height: 1.7;
  }

  .epay-boot__signals {
    display: flex;
    gap: 28px;
    margin-top: 44px;
  }

  .epay-boot__signal {
    display: grid;
    gap: 7px;
  }

  .epay-boot__signal strong {
    color: #e6f0ff;
    font-size: 14px;
    font-weight: 600;
  }

  .epay-boot__signal span {
    color: #6f86a5;
    font-size: 12px;
  }

  .epay-boot__panel {
    position: relative;
    padding: 30px;
    overflow: hidden;
    border: 1px solid rgb(174 208 255 / 0.16);
    border-radius: 24px;
    background: linear-gradient(145deg, rgb(25 49 83 / 0.82), rgb(11 27 50 / 0.72));
    box-shadow: 0 28px 80px rgb(0 7 20 / 0.42), inset 0 1px 0 rgb(255 255 255 / 0.08);
    backdrop-filter: blur(18px);
  }

  .epay-boot__panel::after {
    position: absolute;
    top: -120px;
    right: -90px;
    width: 250px;
    height: 250px;
    border-radius: 50%;
    background: rgb(var(--epay-primary) / 0.14);
    filter: blur(4px);
    content: '';
    pointer-events: none;
  }

  .epay-boot__panel-top,
  .epay-boot__status-row,
  .epay-boot__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .epay-boot__panel-top {
    position: relative;
    z-index: 1;
    margin-bottom: 34px;
  }

  .epay-boot__panel-kicker,
  .epay-boot__panel-code {
    color: #7292ba;
    font-size: 10px;
    font-weight: 700;
  }

  .epay-boot__panel-code {
    color: #6a88ae;
  }

  .epay-boot__icon {
    position: relative;
    display: grid;
    width: 72px;
    height: 72px;
    margin-bottom: 24px;
    place-items: center;
    border: 1px solid rgb(133 188 255 / 0.24);
    border-radius: 20px;
    background: linear-gradient(145deg, rgb(77 153 255 / 0.26), rgb(77 153 255 / 0.05));
    box-shadow: 0 0 0 8px rgb(85 161 255 / 0.05), 0 10px 30px rgb(0 14 42 / 0.35);
  }

  .epay-boot__icon::after {
    position: absolute;
    inset: -12px;
    border: 3px solid rgb(133 188 255 / 0.13);
    border-top-color: #a5d8ff;
    border-right-color: #4f9cff;
    border-radius: 50%;
    animation: epay-boot-spin 1.2s linear infinite;
    content: '';
  }

  .epay-boot__icon svg {
    width: 46px;
    height: 46px;
  }

  .epay-boot__panel h2 {
    position: relative;
    z-index: 1;
    margin: 0;
    color: #ffffff;
    font-size: 23px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .epay-boot__panel-desc {
    position: relative;
    z-index: 1;
    margin: 10px 0 28px;
    color: #91a9c6;
    font-size: 13px;
  }

  .epay-boot__progress-meta,
  .epay-boot__activity {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #a7bad3;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }

  .epay-boot__progress-meta { margin-bottom: 10px; }
  .epay-boot__percent { color: #b9dfff; font-size: 18px; font-weight: 600; }
  .epay-boot__activity { min-height: 32px; margin-top: 14px; }

  .epay-boot__progress {
    position: relative;
    z-index: 1;
    height: 7px;
    overflow: hidden;
    border-radius: 999px;
    background: rgb(142 181 230 / 0.14);
  }

  .epay-boot__progress-fill {
    display: block;
    width: 0;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #3f8dff, #8bc7ff);
    box-shadow: 0 0 16px rgb(76 159 255 / 0.75);
    transition: width 0.35s ease;
  }

  .epay-boot__progress::after {
    position: absolute;
    inset: 0 auto 0 0;
    width: 38%;
    background: linear-gradient(90deg, transparent, rgb(210 236 255 / 0.85), transparent);
    animation: epay-boot-progress 1.5s linear infinite;
    content: '';
  }

  .epay-boot__retry {
    padding: 6px 10px;
    border: 1px solid rgb(143 198 255 / 0.5);
    border-radius: 8px;
    color: #c7e5ff;
    background: rgb(77 153 255 / 0.12);
    font: inherit;
    cursor: pointer;
  }

  .epay-boot__retry:hover { background: rgb(77 153 255 / 0.25); }
  .epay-boot__retry:focus-visible { outline: 2px solid #a5d8ff; outline-offset: 3px; }
  .epay-boot__hint { position: relative; z-index: 1; margin: 8px 0 0; color: #e2bd83; font-size: 12px; line-height: 1.6; }
  .epay-boot [hidden] { display: none !important; }
  .epay-boot__statuses {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 17px;
    margin-top: 28px;
  }

  .epay-boot__status-row {
    color: #a7bad3;
    font-size: 13px;
  }

  .epay-boot__status-label {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .epay-boot__status-state {
    color: #6884a5;
    font-size: 11px;
  }

  .epay-boot__status-row.is-done .epay-boot__status-state {
    color: #72d9b0;
  }

  .epay-boot__status-row.is-active .epay-boot__status-state {
    color: #8fc6ff;
  }

  .epay-boot__status-mark {
    display: inline-grid;
    width: 18px;
    height: 18px;
    place-items: center;
    border: 1px solid rgb(116 145 183 / 0.24);
    border-radius: 50%;
    color: #6c86a6;
    font-size: 10px;
  }

  .is-done .epay-boot__status-mark {
    border-color: rgb(114 217 176 / 0.36);
    color: #72d9b0;
    background: rgb(114 217 176 / 0.08);
  }

  .is-active .epay-boot__status-mark {
    border-color: rgb(143 198 255 / 0.5);
  }

  .epay-boot__status-mark.is-spinner {
    border: 2px solid rgb(143 198 255 / 0.22);
    border-top-color: #c0e6ff;
    border-right-color: #579fff;
    animation: epay-boot-spin 0.85s linear infinite;
  }

  .epay-boot__status-row.is-error .epay-boot__status-state,
  .epay-boot__status-row.is-error .epay-boot__status-mark { color: #ffb6b6; }
  .epay-boot.is-error .epay-boot__progress-fill { background: #e88989; }
  .epay-boot.is-error .epay-boot__icon::after,
  .epay-boot.is-error .epay-boot__progress::after { animation: none; opacity: 0; }

  .epay-boot__footer {
    position: absolute;
    right: 32px;
    bottom: 24px;
    left: 32px;
    z-index: 1;
    color: #536b8b;
    font-size: 9px;
    font-weight: 700;
  }

  @keyframes epay-boot-progress {
    from { transform: translateX(-100%); }
    to { transform: translateX(365%); }
  }
  @keyframes epay-boot-spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 760px) {
    .epay-boot {
      display: block;
      padding: 30px 20px 24px;
    }

    .epay-boot__footer {
      position: relative;
      inset: auto;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 32px;
    }

    .epay-boot__shell {
      grid-template-columns: 1fr;
      gap: 34px;
      width: min(480px, 100%);
      margin: 8vh auto 0;
    }

    .epay-boot__brand h1 {
      font-size: 38px;
    }

    .epay-boot__signals {
      gap: 18px;
      margin-top: 24px;
    }

    .epay-boot__panel {
      padding: 24px;
      border-radius: 20px;
    }
  }

  /* 减少装饰动效时保留必要的加载指示，避免被误认为页面卡死。 */
  html[data-motion='reduced'] .epay-boot .epay-boot__status-mark.is-spinner {
    animation: epay-boot-spin 1.5s linear infinite !important;
  }
</style>
<main class="epay-boot" aria-label="正在启动${$t('system.title')}">
  <div class="epay-boot__shell">
    <section class="epay-boot__brand" aria-label="品牌信息">
      <div class="epay-boot__eyebrow"><span class="epay-boot__eyebrow-dot"></span>SENLIN OPERATIONS</div>
      <h1>${$t('system.title')}</h1>
      <p>多站点支付运营控制台<br />连接业务、策略与资金，让每一次运营动作都清晰可见。</p>
      <div class="epay-boot__signals" aria-hidden="true">
        <div class="epay-boot__signal"><strong>安全连接</strong><span>Encrypted session</span></div>
        <div class="epay-boot__signal"><strong>实时同步</strong><span>Live site sync</span></div>
      </div>
    </section>
    <section class="epay-boot__panel" aria-label="系统启动状态">
      <div class="epay-boot__panel-top"><span class="epay-boot__panel-kicker">Secure boot</span><span class="epay-boot__panel-code">EPAY / 01</span></div>
      <div class="epay-boot__icon" aria-hidden="true">${logoSvg}</div>
      <h2>正在启动运营服务</h2>
      <p class='epay-boot__panel-desc' role='status' aria-live='polite'></p>
      <div class='epay-boot__progress-meta'><span class='epay-boot__step-count'></span><strong class='epay-boot__percent'>0%</strong></div>
      <div class='epay-boot__progress' role='progressbar' aria-label='启动步骤完成进度' aria-valuemin='0' aria-valuemax='100' aria-valuenow='0'><span class='epay-boot__progress-fill'></span></div>
      <div class='epay-boot__activity'><span class='epay-boot__elapsed' aria-live='off'>已等待 0 秒</span><button class='epay-boot__retry' type='button' hidden>重新加载</button></div>
      <p class='epay-boot__hint' role='status' hidden>当前步骤等待较久，请检查网络连接，或重新加载。</p>
      <div class='epay-boot__statuses'>
        ${loadingSteps.map(step => '<div class=epay-boot__status-row><span class=epay-boot__status-label><span class=epay-boot__status-mark></span>' + step.label + '</span><span class=epay-boot__status-state>等待</span></div>').join('')}
      </div>
    </section>
  </div>
  <div class="epay-boot__footer"><span>SECURE · ENCRYPTED · READY</span><span>森林科技 · 运营平台</span></div>
</main>`;

  // 独立覆盖层保留到 Vue 挂载成功，挂载失败时仍能展示重试入口。
  const host = document.createElement('div');
  host.innerHTML = loading;
  document.body.append(host);

  const root = host.querySelector<HTMLElement>('.epay-boot')!;
  const title = host.querySelector<HTMLElement>('h2')!;
  const description = host.querySelector<HTMLElement>('.epay-boot__panel-desc')!;
  const progress = host.querySelector<HTMLElement>('.epay-boot__progress')!;
  const fill = host.querySelector<HTMLElement>('.epay-boot__progress-fill')!;
  const percent = host.querySelector<HTMLElement>('.epay-boot__percent')!;
  const count = host.querySelector<HTMLElement>('.epay-boot__step-count')!;
  const elapsed = host.querySelector<HTMLElement>('.epay-boot__elapsed')!;
  const hint = host.querySelector<HTMLElement>('.epay-boot__hint')!;
  const retry = host.querySelector<HTMLButtonElement>('.epay-boot__retry')!;
  const rows = host.querySelectorAll<HTMLElement>('.epay-boot__status-row');
  const startedAt = performance.now();
  let stepStartedAt = startedAt;
  let current = 0;
  let failed = false;
  let finished = false;

  retry.addEventListener('click', () => window.location.reload());

  function renderElapsed() {
    elapsed.textContent = '已等待 ' + Math.floor((performance.now() - startedAt) / 1000) + ' 秒';
    const slow = !failed && performance.now() - stepStartedAt >= 15000;
    hint.hidden = !slow;
    retry.hidden = !failed && !slow;
  }

  function render() {
    // 百分比只计算已完成的启动步骤；等待计时不会增加进度。
    const completed = finished ? loadingSteps.length : current;
    const value = Math.round(completed / loadingSteps.length * 100);
    progress.setAttribute('aria-valuenow', String(value));
    fill.style.width = value + '%';
    percent.textContent = value + '%';
    count.textContent = '已完成 ' + completed + ' / ' + loadingSteps.length + ' 项';
    root.classList.toggle('is-error', failed);
    root.setAttribute('aria-busy', String(!failed && !finished));
    title.textContent = failed ? '启动未完成' : '正在启动运营服务';
    description.textContent = failed
      ? loadingSteps[current].label + '未完成，请检查网络连接后重新加载。'
      : loadingSteps[current].detail;

    rows.forEach((row, index) => {
      const done = index < completed;
      const active = !finished && index === current;
      row.classList.toggle('is-done', done);
      row.classList.toggle('is-active', active && !failed);
      row.classList.toggle('is-error', active && failed);
      const mark = row.querySelector<HTMLElement>('.epay-boot__status-mark')!;
      const state = row.querySelector<HTMLElement>('.epay-boot__status-state')!;
      mark.classList.toggle('is-spinner', active && !failed);
      mark.textContent = done ? '✓' : active && failed ? '!' : '';
      state.textContent = done ? '完成' : active ? failed ? '未完成' : '加载中' : '等待';
    });
    renderElapsed();
  }

  render();
  const timer = window.setInterval(renderElapsed, 1000);

  return {
    setStep(step: LoadingStep) {
      const next = loadingSteps.findIndex(item => item.key === step);
      if (failed || finished || next <= current) return;
      current = next;
      stepStartedAt = performance.now();
      render();
    },
    fail() {
      if (failed || finished) return;
      failed = true;
      window.clearInterval(timer);
      render();
    },
    finish() {
      if (failed || finished) return;
      finished = true;
      window.clearInterval(timer);
      render();
      host.remove();
    }
  };
}
