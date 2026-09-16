// 模板只引用显式导出的平台对象，避免依赖运行时全局解析。
const platform = uni;
export { platform as uni };
