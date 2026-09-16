// 运行时判断也可供离线测试使用，不在模块加载时调用原生 API。
export function isNativeApp() {
  return typeof plus !== 'undefined' && !!plus.os;
}
export function clientSource() {
  return isNativeApp() ? 'uniapp-app' : 'uniapp-wechat';
}
export function clearNativeCookies() {
  if (isNativeApp()) plus.navigator.removeAllCookie();
}
export function albumPermissionMessage() {
  return isNativeApp()
    ? '没有相册权限，请在系统设置中允许本应用访问相册'
    : '没有相册权限，请在小程序设置中允许保存';
}
export function audioPickerHint() {
  return isNativeApp() ? '从系统文件选择音频' : '从微信聊天文件选择音频';
}
