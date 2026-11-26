/** 停止仍是成功操作，只改变状态颜色，保留成功图标。 */
export function showSwitchMessage(enabled: boolean, message: string) {
  return window.$message?.success({ message, customClass: enabled ? '' : 'epay-message-stopped' });
}
