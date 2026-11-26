<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

const motionLayer = ref<HTMLDivElement | null>(null);

let canvas: HTMLCanvasElement | null = null;
let context: CanvasRenderingContext2D | null = null;
let visualPanel: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let frameId = 0;
let lastFrame = 0;
let width = 0;
let height = 0;
let targetX = 0;
let targetY = 0;
let currentX = 0;
let currentY = 0;

function drawBackdrop(time: number) {
  if (!context || !width || !height) return;

  const phase = time * 0.00018;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(currentX * 0.18, currentY * 0.16);

  const haze = context.createRadialGradient(
    width * (0.34 + Math.sin(phase) * 0.12),
    height * (0.48 + Math.cos(phase * 0.7) * 0.11),
    0,
    width * 0.38,
    height * 0.48,
    width * 0.82
  );
  haze.addColorStop(0, 'rgba(35, 132, 255, 0.18)');
  haze.addColorStop(0.56, 'rgba(25, 91, 180, 0.07)');
  haze.addColorStop(1, 'rgba(8, 21, 42, 0)');
  context.fillStyle = haze;
  context.fillRect(-30, -30, width + 60, height + 60);

  context.globalCompositeOperation = 'screen';
  for (let layer = 0; layer < 4; layer += 1) {
    context.beginPath();
    for (let x = -4; x <= width + 4; x += 12) {
      const progress = x / width;
      const wave =
        height * (0.2 + layer * 0.16) +
        Math.sin(progress * 5 + phase + layer * 0.8) * height * 0.065 +
        Math.cos(progress * 2.4 - phase * 0.65 + layer) * height * 0.024;
      if (x < 0) context.moveTo(x, wave);
      else context.lineTo(x, wave);
    }

    const ribbon = context.createLinearGradient(0, 0, width, height * 0.1);
    ribbon.addColorStop(0, 'rgba(83, 174, 255, 0)');
    ribbon.addColorStop(0.45, 'rgba(75, 161, 255, 0.09)');
    ribbon.addColorStop(0.72, 'rgba(125, 202, 255, 0.23)');
    ribbon.addColorStop(1, 'rgba(83, 174, 255, 0)');
    context.strokeStyle = ribbon;
    context.lineWidth = layer === 1 ? 1.4 : 0.8;
    context.shadowColor = '#55aaff';
    context.shadowBlur = layer === 1 ? 13 : 7;
    context.stroke();
  }

  context.shadowBlur = 0;
  for (let point = 0; point < 9; point += 1) {
    const seed = point * 2.17;
    const x = width * (0.08 + point * 0.102) + Math.sin(phase * 0.65 + seed) * 13;
    const y = height * (0.14 + ((point * 37) % 67) / 100) + Math.cos(phase + seed) * 12;
    const glow = context.createRadialGradient(x, y, 0, x, y, point % 3 === 0 ? 15 : 10);
    glow.addColorStop(0, 'rgba(157, 214, 255, 0.56)');
    glow.addColorStop(0.18, 'rgba(85, 167, 255, 0.24)');
    glow.addColorStop(1, 'rgba(55, 140, 255, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, 15, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function updateFrame(time: number) {
  frameId = 0;
  if (document.hidden) return;
  if (time - lastFrame < 32) {
    frameId = requestAnimationFrame(updateFrame);
    return;
  }

  lastFrame = time;
  currentX += (targetX - currentX) * 0.09;
  currentY += (targetY - currentY) * 0.09;
  visualPanel?.style.setProperty('--senlin-px', `${currentX.toFixed(2)}px`);
  visualPanel?.style.setProperty('--senlin-py', `${currentY.toFixed(2)}px`);
  drawBackdrop(time);
  frameId = requestAnimationFrame(updateFrame);
}

function syncPlayback() {
  if (frameId) cancelAnimationFrame(frameId);
  frameId = 0;
  if (document.hidden) return;
  frameId = requestAnimationFrame(updateFrame);
}

function resizeCanvas() {
  if (!canvas || !context || !visualPanel) return;
  const bounds = visualPanel.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 1.5);
  width = bounds.width;
  height = bounds.height;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  drawBackdrop(performance.now());
}

function handlePointerMove(event: PointerEvent) {
  if (event.pointerType === 'touch' || !visualPanel) return;
  const bounds = visualPanel.getBoundingClientRect();
  targetX = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)) * 15;
  targetY = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)) * 15;
}

function resetPointer() {
  targetX = 0;
  targetY = 0;
}

function handleVisibilityChange() {
  syncPlayback();
}

onMounted(() => {
  canvas = motionLayer.value?.querySelector('canvas') ?? null;
  context = canvas?.getContext('2d', { alpha: true }) ?? null;
  visualPanel = motionLayer.value?.parentElement ?? null;
  if (!canvas || !context || !visualPanel) return;

  resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(visualPanel);
  visualPanel.addEventListener('pointermove', handlePointerMove, { passive: true });
  visualPanel.addEventListener('pointerleave', resetPointer, { passive: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('resize', resizeCanvas, { passive: true });
  resizeCanvas();
  syncPlayback();
});

onUnmounted(() => {
  if (frameId) cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  visualPanel?.removeEventListener('pointermove', handlePointerMove);
  visualPanel?.removeEventListener('pointerleave', resetPointer);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('resize', resizeCanvas);
});
</script>

<template>
  <div ref="motionLayer" class="senlin-motion-layer" aria-hidden="true">
    <canvas />
  </div>
</template>

<style scoped>
.senlin-motion-layer {
  position: fixed;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  opacity: 0.55;
}

.senlin-motion-layer canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
