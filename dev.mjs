/* 本機開發轉接器，讓 Worker 使用相同的請求處理程式，不另外模擬 API 行為。 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const worker = (await import(pathToFileURL(process.cwd() + '/dist/server/index.js'))).default;
const env = { ...process.env };
const envFile = process.env.DEMO_ENV_FILE;
if (envFile) {
  // 將設定視為純資料解析，禁止透過 shell 執行 env 檔內容。
  for (const line of (await readFile(envFile, 'utf8')).split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
}
const port = Number(process.env.PORT || 8766);
http.createServer(async (req, res) => {
  try {
    const chunks = []; for await (const part of req) chunks.push(part);
    const body = Buffer.concat(chunks), headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) if (value) headers.set(key, String(value));
    const request = new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body }) });
    const response = await worker.fetch(request, env, {});
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('本機服務錯誤'); }
}).listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
