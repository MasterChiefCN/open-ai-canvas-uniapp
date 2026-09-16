import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

function fixture(name: string, slogan = '') {
  const root = mkdtempSync(join(tmpdir(), 'canvas-brand-'));
  mkdirSync(join(root, 'src/config'), { recursive: true });
  writeFileSync(
    join(root, 'src/config/brand.ts'),
    `export const brandConfig = Object.freeze(${JSON.stringify({ name, slogan })});`,
    'utf8',
  );
  const pages = {
    pages: [
      { path: 'pages/create/index', style: { navigationBarTitleText: '创作', custom: true } },
      { path: 'pages/tasks/index', style: { navigationBarTitleText: '任务' } },
    ],
    tabBar: { color: '#ffffff' },
  };
  const manifest = {
    name: '旧品牌',
    description: '旧描述',
    'mp-weixin': { appid: 'wx-example', setting: { urlCheck: true } },
  };
  writeFileSync(join(root, 'src/pages.json'), JSON.stringify(pages));
  writeFileSync(join(root, 'src/manifest.json'), JSON.stringify(manifest));
  const run = () =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { syncBrand } from ${JSON.stringify(pathToFileURL(resolve('scripts/sync-brand.mjs')).href)}; await syncBrand(new URL(${JSON.stringify(pathToFileURL(root + sep).href)}));`,
      ],
      { encoding: 'utf8' },
    );
  return { root, pages, manifest, run };
}

it('preserves Chinese, mixed text and JSON special characters without changing unrelated settings', () => {
  const name = '灵感画布 AI「创作」"特别版"\\星河🌟';
  const f = fixture(name);
  try {
    const result = f.run();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    f.manifest.name = name;
    f.manifest.description = `${name} AI 创作客户端`;
    const pagesText = readFileSync(join(f.root, 'src/pages.json'), 'utf8');
    expect(pagesText).toBe(JSON.stringify(f.pages));
    expect(JSON.parse(pagesText)).toEqual(f.pages);
    expect(JSON.parse(readFileSync(join(f.root, 'src/manifest.json'), 'utf8'))).toEqual(f.manifest);
    expect(f.run().status).toBe(0);
    expect(readFileSync(join(f.root, 'src/pages.json'), 'utf8')).toBe(pagesText);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});

it('rejects blank names before modifying either JSON file', () => {
  const f = fixture('  ');
  try {
    const result = f.run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('brandConfig.name 必须是非空字符串');
    expect(readFileSync(join(f.root, 'src/pages.json'), 'utf8')).toBe(JSON.stringify(f.pages));
    expect(readFileSync(join(f.root, 'src/manifest.json'), 'utf8')).toBe(
      JSON.stringify(f.manifest),
    );
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
});
