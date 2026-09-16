import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Node.js 24 可直接读取无运行时依赖的 TypeScript 品牌配置。
export async function syncBrand(root = new URL('../', import.meta.url)) {
  const { brandConfig } = await import(new URL('src/config/brand.ts', root).href);
  if (typeof brandConfig.name !== 'string' || !brandConfig.name.trim()) {
    throw new Error('brandConfig.name 必须是非空字符串（支持中文）。');
  }
  if (typeof brandConfig.slogan !== 'string') {
    throw new Error('brandConfig.slogan 必须是字符串，可留空。');
  }

  const manifestUrl = new URL('src/manifest.json', root);
  const manifestText = await readFile(manifestUrl, 'utf8');
  const manifest = JSON.parse(manifestText);
  manifest.name = brandConfig.name;
  manifest.description = `${brandConfig.name} 微信小程序`;

  // 无变化时不写入，避免开发构建产生无意义的文件修改。
  if (JSON.stringify(JSON.parse(manifestText)) !== JSON.stringify(manifest)) {
    await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await syncBrand();
}
