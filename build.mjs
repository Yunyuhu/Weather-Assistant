/* 將獨立來源檔打包成單一 Worker ESM，靜態檔以字串嵌入，無須額外套件。 */
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd(), assets = {};
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
for (const name of await readdir('public')) assets['/' + name] = { type: types[path.extname(name)] || 'text/plain', content: await readFile(path.join('public', name), 'utf8') };
const common = (await readFile('runtime.mjs', 'utf8')).replace(/^export /gm, '');
const app = (await readFile('worker.mjs', 'utf8')).replace(/^import .*from '.\/runtime.mjs';\n/gm, '');
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js', `const ASSETS = ${JSON.stringify(assets)};\n${common}\n${app}`);
// Vercel 只發布 API；公開介面由 GitHub Pages 提供。
await mkdir('dist/empty', { recursive: true });
await writeFile('dist/empty/status.txt', 'API service');
console.log('API 與本機展示已完成建置。');
