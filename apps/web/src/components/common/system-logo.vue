<template>
  <span class="senlin-logo" role="img" aria-label="森林科技">
    <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="senlin-logo-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#42a5ff" />
          <stop offset="1" stop-color="#007aff" />
        </linearGradient>
      </defs>
      <path class="senlin-logo-tower" d="M2 17 7 9l5 8v15H2z" fill="url(#senlin-logo-gradient)" opacity=".78" />
      <path
        class="senlin-logo-tower senlin-logo-tower-center"
        d="m13 12 5-9 5 9v20H13z"
        fill="url(#senlin-logo-gradient)"
      />
      <path class="senlin-logo-tower" d="m24 17 5-8 5 8v15H24z" fill="url(#senlin-logo-gradient)" opacity=".9" />
    </svg>
  </span>
</template>

<style scoped>
.senlin-logo {
  position: relative;
  display: inline-flex;
  isolation: isolate;
  color: #007aff;
  flex: 0 0 auto;
  transition:
    transform 360ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 360ms ease;
}

.senlin-logo::before {
  position: absolute;
  z-index: -1;
  inset: 18% 12% 4%;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(0 122 255 / 0.34), rgb(0 122 255 / 0) 72%);
  filter: blur(8px);
  opacity: 0.62;
  transform: scale(0.92);
  transition:
    opacity 360ms ease,
    transform 360ms ease;
  content: '';
}

.senlin-logo::after {
  position: absolute;
  z-index: 2;
  top: -18%;
  bottom: -18%;
  left: -72%;
  width: 42%;
  background: linear-gradient(105deg, transparent, rgb(255 255 255 / 0.82), transparent);
  opacity: 0;
  pointer-events: none;
  transform: skewX(-18deg);
  animation: senlin-logo-shine 6s ease-in-out 1.2s infinite;
  content: '';
}

.senlin-logo svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 5px 8px rgb(0 98 210 / 0.2));
  transition: filter 360ms ease;
}

.senlin-logo-tower-center {
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: senlin-logo-core 4.8s ease-in-out infinite;
}

.senlin-logo:hover {
  filter: saturate(1.08);
  transform: translateY(-1px) scale(1.025);
}

.senlin-logo:hover::before {
  opacity: 0.92;
  transform: scale(1.08);
}

.senlin-logo:hover svg {
  filter: drop-shadow(0 8px 14px rgb(0 98 210 / 0.3));
}

@keyframes senlin-logo-shine {
  0%,
  14% {
    left: -72%;
    opacity: 0;
  }
  24% {
    opacity: 0.85;
  }
  38%,
  100% {
    left: 132%;
    opacity: 0;
  }
}

@keyframes senlin-logo-core {
  0%,
  100% {
    opacity: 0.9;
    transform: scaleY(1);
  }
  50% {
    opacity: 1;
    transform: scaleY(1.025);
  }
}

@media (prefers-reduced-motion: reduce) {
  .senlin-logo,
  .senlin-logo::before,
  .senlin-logo::after,
  .senlin-logo svg {
    transition: none;
  }

  .senlin-logo::after,
  .senlin-logo-tower-center {
    animation: none;
  }
}
</style>
