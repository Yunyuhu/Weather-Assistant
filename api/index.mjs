import application from '../dist/server/index.js';

/* Pages 只承載介面，這個入口負責檢查來源並在伺服器讀取秘密設定。 */
export default {
  async fetch(request) {
    const origin = request.headers.get('origin');
    const allowed = process.env.DEMO_ALLOWED_ORIGIN;
    if (origin && origin !== allowed) return new Response('不允許的請求來源', { status: 403 });
    const cors = { 'Vary': 'Origin' };
    if (origin && origin === allowed) {
      cors['Access-Control-Allow-Origin'] = origin;
      cors['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      cors['Access-Control-Allow-Headers'] = 'Content-Type';
      cors['Access-Control-Max-Age'] = '600';
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // API-only 部署不提供靜態介面，避免出現另一組展示入口。
    if (!new URL(request.url).pathname.startsWith('/api/')) return new Response('找不到此操作', { status: 404 });
    const response = await application.fetch(request, process.env);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
