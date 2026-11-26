import type { Page } from 'playwright-core';

export function 旋转验证码可见(页面: Page) {
  return 页面.locator('.image-grid-container.clickpuzzle').first().isVisible();
}
