import { existsSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

// Use WeChat's own compiler: a successful uni-app build alone does not validate WXSS.
const root = resolve(process.argv[2] || 'dist/build/mp-weixin');
const compiler =
  process.env.WXSS_COMPILER ||
  (process.platform === 'win32'
    ? join(
        process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
        'Tencent',
        '微信web开发者工具',
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'wcc-exec',
        'wcsc.exe',
      )
    : '');
if (!compiler || !existsSync(compiler)) {
  console.error('找不到微信 WXSS 编译器，请安装微信开发者工具或设置 WXSS_COMPILER 为编译器路径。');
  process.exit(1);
}
if (!existsSync(root)) {
  console.error('构建目录不存在，请先运行 pnpm build:mp-weixin。');
  process.exit(1);
}
function collect(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? collect(path)
      : entry.name.endsWith('.wxss')
        ? [relative(root, path)]
        : [];
  });
}
const files = collect(root);
if (!files.length) throw new Error('构建目录内没有 WXSS 文件');
let failures = 0;
for (const file of files) {
  const result = spawnSync(compiler, [file], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  if (result.status !== 0) {
    failures++;
    console.error(`${file}: ${result.error?.message || result.stderr || 'WXSS 编译失败'}`);
  }
}
if (failures) process.exit(1);
console.log(`微信原生 WXSS 编译通过：${files.length} 个样式文件。`);
