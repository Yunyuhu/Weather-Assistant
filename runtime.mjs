/* 共用的 HTTP、輸入驗證與 OpenAI 請求工具。每個專案建置時會帶入自己的副本。 */
export class DemoError extends Error {
  constructor(message, status = 400, code = 'invalid_request') { super(message); this.status = status; this.code = code; }
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

export async function readBody(request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new DemoError('請使用頁面上的操作送出內容。', 415);
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new DemoError('請由本展示頁面操作。', 403);
  // 同時檢查宣告長度及實際串流長度，避免未帶 Content-Length 的過大請求。
  if (Number(request.headers.get('content-length')) > 24000) throw new DemoError('內容過長，請縮短後再試。', 413);
  let size = 0; const chunks = []; const reader = request.body?.getReader();
  if (!reader) throw new DemoError('請先輸入內容。');
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 24000) { await reader.cancel(); throw new DemoError('內容過長，請縮短後再試。', 413); }
    chunks.push(value);
  }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  try { const value = JSON.parse(new TextDecoder().decode(joined)); if (!value || Array.isArray(value) || typeof value !== 'object') throw Error(); return value; }
  catch { throw new DemoError('輸入格式有誤，請重新整理頁面。'); }
}

export function text(value, max = 2000) {
  if (typeof value !== 'string' || !value.trim()) throw new DemoError('請先輸入內容。');
  if (value.length > max) throw new DemoError(`內容請控制在 ${max} 字以內。`);
  return value.trim();
}

/* 限制單一執行個體內的操作頻率；不將此機制宣稱為帳戶的全域費用上限。 */
const rates = new Map();
export function limit(request) {
  const now = Date.now(), key = request.headers.get('cf-connecting-ip') || 'local';
  for (const [id, state] of rates) if (state.until < now) rates.delete(id);
  const state = rates.get(key) || { count: 0, until: now + 60000 };
  if (state.count >= 8) throw new DemoError('操作較頻繁，請稍候一分鐘再試。', 429, 'demo_rate_limit');
  state.count++; rates.set(key, state);
}

async function apiKey(env) {
  if (env.OPENAI_API_KEY) return env.OPENAI_API_KEY;
  // 部署時使用受保護的加密設定，避免本機金鑰出現在工具輸出或原始碼。
  if (env.OPENAI_API_KEY_ENCRYPTED && env.OPENAI_KEY_DECRYPTION_KEY) {
    try {
      const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
      const payload = JSON.parse(env.OPENAI_API_KEY_ENCRYPTED);
      const key = await crypto.subtle.importKey('raw', bytes(env.OPENAI_KEY_DECRYPTION_KEY), 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(payload.iv) }, key, bytes(payload.ciphertext));
      return new TextDecoder().decode(plain);
    } catch { throw new DemoError('AI 回覆暫時無法使用，請稍後再試。', 503, 'invalid_key_configuration'); }
  }
  throw new DemoError('AI 回覆暫時無法使用，請稍後再試。', 503, 'missing_key');
}

export async function generate(env, instructions, input, maxTokens = 650) {
  const key = await apiKey(env);
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(35000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-4.1-mini', instructions, input, max_output_tokens: maxTokens, store: false }),
    });
  } catch { throw new DemoError('等待 AI 回覆逾時，請稍後再試。', 504, 'provider_timeout'); }
  let body; try { body = await response.json(); } catch { throw new DemoError('暫時無法取得 AI 回覆。', 502); }
  if (!response.ok) throw new DemoError('AI 回覆暫時無法使用，請稍後再試。', 503, body.error?.code || 'provider_error');
  const answer = (body.output || []).flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('\n').trim();
  if (!answer) throw new DemoError('這次沒有取得完整回覆，請重新送出。', 502, 'empty_output');
  if (body.status === 'incomplete') throw new DemoError('這次回覆超過展示長度，請縮短輸入後再試。', 502, 'incomplete_output');
  return answer;
}

export function failure(error) {
  if (error instanceof DemoError) return json({ error: error.message, code: error.code }, error.status);
  return json({ error: '服務暫時無法使用，請稍後再試。', code: 'internal_error' }, 500);
}

export function asset(path, assets) {
  const name = path === '/' ? '/index.html' : path;
  const item = assets[name]; if (!item) return new Response('找不到頁面', { status: 404 });
  return new Response(item.content, { headers: { 'Content-Type': item.type, 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors *" } });
}
