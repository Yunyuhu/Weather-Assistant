// 公開頁面與 API 分開部署；本機未指定時沿用同源路徑。
const API_BASE = (document.querySelector('meta[name="api-base"]')?.content || '').replace(/\/+$/, '');
// Pages 尚未接妥後端時停止請求，避免把靜態站的錯誤頁當成 API 回應。
const API_READY = Boolean(API_BASE) || !location.hostname.endsWith('github.io');
const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
let currentForecast = null, forecastController, adviceController, slowTimer;

/* 常用縣市做成晶片，其餘留在下拉選單 */
const QUICK_CITIES = [['63', '臺北'], ['65', '新北'], ['68', '桃園'], ['66', '臺中'], ['67', '臺南'], ['64', '高雄']];
for (const [id, name] of QUICK_CITIES) {
  const chip = document.createElement('button');
  chip.type = 'button'; chip.className = 'chip'; chip.dataset.city = id; chip.textContent = name;
  chip.setAttribute('role', 'radio');
  chip.addEventListener('click', () => { $('city').value = id; loadForecast(); });
  $('city-chips').append(chip);
}
function syncChips() {
  for (const chip of $('city-chips').children) chip.setAttribute('aria-checked', String(chip.dataset.city === $('city').value));
}

function status(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
async function read(response) {
  let data; try { data = await response.json(); } catch { throw Error('暫時無法讀取服務資料，請稍後再試。'); }
  if (!response.ok) throw Error(data.error || '暫時無法取得資料。'); return data;
}
function sourceText(data) {
  return `資料：中央氣象署 ${data.issuedAt} 發布・${new Date(data.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 更新`;
}

/* 時段字串「11/26-18:00 ~ 11/27-06:00」轉成「今晚」「明天白天」這類說法 */
function periodLabel(time) {
  const m = time.match(/(\d+)\/(\d+)-(\d+):(\d+)\s*~\s*(\d+)\/(\d+)-(\d+):(\d+)/);
  if (!m) return { name: time, range: '' };
  const [, mo, d, h, , , , h2] = m.map(Number);
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const start = new Date(now.getFullYear(), mo - 1, d);
  if (now.getMonth() === 11 && mo === 1) start.setFullYear(now.getFullYear() + 1);
  const days = Math.round((start - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  const night = h >= 18 || h < 6;
  const day = days === 0 ? '今' : days === 1 ? '明' : days === 2 ? '後' : `${mo}/${d} `;
  const name = night ? (days <= 2 ? `${day}晚` : `${day}晚上`) : `${day}${days <= 2 ? '天' : ''}白天`;
  return { name, range: `${String(h).padStart(2, '0')}:00–${String(h2).padStart(2, '0')}:00`, night };
}

/* 依天氣描述決定圖示與背景 */
function kind(weather, rain) {
  if (/雷/.test(weather)) return 'storm';
  if (/雨/.test(weather) || rain >= 60) return 'rain';
  if (/晴/.test(weather) && /雲/.test(weather)) return 'partly';
  if (/晴/.test(weather)) return 'clear';
  if (/陰/.test(weather)) return 'overcast';
  return 'cloudy';
}
function icon(type, night = false) {
  const s = document.createElementNS(SVG, 'svg'); s.setAttribute('viewBox', '0 0 64 64'); s.setAttribute('class', `wx wx-${type}`);
  const add = (tag, attrs) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); s.append(el); return el; };
  const sunOrMoon = (cx, cy, r) => {
    if (night) { add('path', { class: 'moon', d: `M${cx + 4} ${cy - r}a${r} ${r} 0 1 0 ${r - 2} ${r * 1.6}a${r * 0.8} ${r * 0.8} 0 0 1 -${r - 2} -${r * 1.6}z` }); return; }
    add('circle', { class: 'sun', cx, cy, r });
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add('line', { class: 'ray', x1: cx + Math.cos(a) * (r + 4), y1: cy + Math.sin(a) * (r + 4), x2: cx + Math.cos(a) * (r + 8), y2: cy + Math.sin(a) * (r + 8) }); }
  };
  const cloud = (dx = 0, dy = 0, cls = 'cl') => add('path', { class: cls, d: `M${18 + dx} ${48 + dy}h28a9 9 0 0 0 0-18a13 13 0 0 0-25 3a7.5 7.5 0 0 0-3 15z` });
  if (type === 'clear') sunOrMoon(32, 32, 12);
  else if (type === 'partly') { sunOrMoon(24, 22, 9); cloud(4, 4); }
  else if (type === 'cloudy') { cloud(-6, -8, 'cl back'); cloud(2, 2); }
  else if (type === 'overcast') { cloud(-6, -8, 'cl dark'); cloud(2, 2, 'cl dark2'); }
  else {
    cloud(0, -6, type === 'storm' ? 'cl dark' : 'cl');
    for (const x of [22, 32, 42]) add('line', { class: 'drop', x1: x, y1: 50, x2: x - 3, y2: 58 });
    if (type === 'storm') add('path', { class: 'bolt', d: 'M33 40l-6 10h6l-3 9 9-13h-6l3-6z' });
  }
  return s;
}
function setSky(first) {
  const type = kind(first.weather, first.rain), label = periodLabel(first.time);
  const sky = type === 'rain' || type === 'storm' ? 'rain' : type === 'clear' || type === 'partly' ? 'clear' : 'cloudy';
  document.body.dataset.sky = sky; document.body.dataset.night = String(Boolean(label.night));
}

/* 數字從舊值滑到新值 */
function countTo(el, value) {
  const from = Number(el.textContent) || value, start = performance.now();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = value; return; }
  const step = now => { const t = Math.min(1, (now - start) / 600); el.textContent = Math.round(from + (value - from) * (1 - (1 - t) ** 3)); if (t < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function renderForecast(data) {
  const periods = data.periods, first = periods[0], firstLabel = periodLabel(first.time);
  $('place').textContent = data.city; setSky(first);
  $('now-when').textContent = `${firstLabel.name}・${firstLabel.range}`;
  $('now-icon').replaceChildren(icon(kind(first.weather, first.rain), firstLabel.night));
  countTo($('now-low'), first.low); countTo($('now-high'), first.high);
  $('now-desc').textContent = `${first.weather}，${first.comfort}`;
  $('now-rain').textContent = first.rain >= 50 ? `降雨機率 ${first.rain}%，記得帶傘` : `降雨機率 ${first.rain}%`;

  // 三個時段共用同一個溫度刻度，長條的高低可以直接比較
  const lo = Math.min(...periods.map(p => p.low)) - 2, hi = Math.max(...periods.map(p => p.high)) + 2;
  const pct = v => ((v - lo) / (hi - lo)) * 100;
  $('forecast').replaceChildren();
  periods.forEach((p, i) => {
    const label = periodLabel(p.time);
    const card = document.createElement('article'); card.className = 'period'; card.style.setProperty('--delay', `${i * 80}ms`);
    const head = document.createElement('header');
    const name = document.createElement('h3'); name.textContent = label.name;
    const range = document.createElement('span'); range.className = 'range'; range.textContent = label.range;
    head.append(name, range);
    const ic = document.createElement('div'); ic.className = 'p-icon'; ic.append(icon(kind(p.weather, p.rain), label.night));
    const desc = document.createElement('p'); desc.className = 'p-desc'; desc.textContent = p.weather;

    const temp = document.createElement('div'); temp.className = 'temp-bar'; temp.setAttribute('role', 'img'); temp.setAttribute('aria-label', `氣溫 ${p.low} 到 ${p.high} 度`);
    const track = document.createElement('div'); track.className = 'track';
    const fill = document.createElement('div'); fill.className = 'fill';
    fill.style.setProperty('--from', `${pct(p.low)}%`); fill.style.setProperty('--to', `${pct(p.high)}%`);
    track.append(fill);
    const lowT = document.createElement('span'); lowT.className = 't-low'; lowT.textContent = `${p.low}°`;
    const highT = document.createElement('span'); highT.className = 't-high'; highT.textContent = `${p.high}°`;
    temp.append(lowT, track, highT);

    const rain = document.createElement('div'); rain.className = 'rain'; rain.setAttribute('role', 'img'); rain.setAttribute('aria-label', `降雨機率 ${p.rain}%`);
    const drop = document.createElementNS(SVG, 'svg'); drop.setAttribute('viewBox', '0 0 20 24'); drop.setAttribute('class', 'droplet');
    const clip = `drop-${i}`;
    drop.innerHTML = `<defs><clipPath id="${clip}"><path d="M10 1C10 1 2 11 2 16a8 8 0 0 0 16 0C18 11 10 1 10 1z"/></clipPath></defs><path class="d-bg" d="M10 1C10 1 2 11 2 16a8 8 0 0 0 16 0C18 11 10 1 10 1z"/><rect class="d-fill" clip-path="url(#${clip})" x="0" y="${24 - 24 * p.rain / 100}" width="20" height="24"/>`;
    const rainText = document.createElement('span'); rainText.innerHTML = `<b>${Number(p.rain)}%</b> 降雨`;
    rain.append(drop, rainText);

    const comfort = document.createElement('p'); comfort.className = 'comfort'; comfort.textContent = p.comfort;
    card.append(head, ic, desc, temp, rain, comfort);
    $('forecast').append(card);
  });
  $('source-info').textContent = sourceText(data);
}

function skeleton() {
  $('forecast').replaceChildren(...[0, 1, 2].map(() => { const s = document.createElement('div'); s.className = 'period skeleton'; return s; }));
}

async function loadForecast() {
  syncChips();
  if (!API_READY) { status('forecast-status', '資料服務設定中，請稍後再試。'); return; }
  forecastController?.abort(); adviceController?.abort(); adviceController = null; clearTimeout(slowTimer);
  const current = new AbortController(); forecastController = current; currentForecast = null;
  $('ask').disabled = true; document.body.dataset.sky = 'loading'; skeleton(); $('source-info').textContent = '';
  $('place').textContent = $('city').selectedOptions[0].textContent; $('now-when').textContent = '正在讀取中央氣象署預報…';
  status('forecast-status', '');
  // 後端閒置後第一次呼叫需要喚醒，等太久時先說明原因
  slowTimer = setTimeout(() => { if (forecastController === current) status('forecast-status', '正在喚醒資料服務，第一次大約需要 5 秒。'); }, 1800);
  try {
    const data = await read(await fetch(API_BASE + '/api/forecast?city=' + encodeURIComponent($('city').value), { signal: current.signal }));
    if (forecastController !== current) return;
    currentForecast = data; renderForecast(data); $('ask').disabled = false; status('forecast-status', '');
  } catch (error) {
    if (error.name !== 'AbortError') { $('forecast').replaceChildren(); $('now-when').textContent = '預報暫時讀不到'; status('forecast-status', error.message, true); }
  } finally { clearTimeout(slowTimer); }
}

/* 回答裡的溫度、百分比標出來，方便對照上方數值 */
function renderAnswer(text) {
  const box = $('answer'); box.replaceChildren();
  for (const para of text.split(/\n+/).filter(Boolean)) {
    const p = document.createElement(/^\s*[-•*\d]+[.、)]?\s/.test(para) ? 'li' : 'p');
    const parts = para.replace(/^\s*[-•*]\s*/, '').split(/(\d+(?:[～~-]\d+)?\s*(?:°C|度|%|％))/);
    parts.forEach((part, i) => { if (!part) return; if (i % 2) { const m = document.createElement('mark'); m.textContent = part; p.append(m); } else p.append(part); });
    if (p.tagName === 'LI') { let list = box.lastElementChild; if (list?.tagName !== 'UL') { list = document.createElement('ul'); box.append(list); } list.append(p); }
    else box.append(p);
  }
}

async function ask(question) {
  question = (question ?? $('question').value).trim();
  if (!question) return status('advice-status', '請先選一個問題或輸入問題。', true);
  if (!currentForecast) return status('advice-status', '預報還沒讀到，請稍候。', true);
  adviceController?.abort();
  const current = new AbortController(); adviceController = current; $('ask').disabled = true;
  $('answer-q').textContent = question; $('answer-card').dataset.state = 'loading';
  $('answer').replaceChildren(Object.assign(document.createElement('span'), { className: 'typing', textContent: '正在對照預報' }));
  $('answer-source').textContent = ''; status('advice-status', '');
  try {
    const data = await read(await fetch(API_BASE + '/api/advice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: $('city').value, question }), signal: current.signal }));
    if (adviceController !== current) return;
    currentForecast = data.forecast; renderForecast(data.forecast); renderAnswer(data.answer);
    $('answer-card').dataset.state = 'done'; $('answer-source').textContent = '依據 ' + sourceText(data.forecast);
  } catch (error) {
    if (error.name !== 'AbortError') { $('answer-card').dataset.state = 'error'; $('answer').textContent = '這次沒有拿到回答，上方的預報數值仍然可以直接看。'; status('advice-status', error.message, true); }
  } finally { if (adviceController === current) { adviceController = null; $('ask').disabled = !currentForecast; } }
}

$('city').addEventListener('change', loadForecast);
$('refresh').addEventListener('click', loadForecast);
$('ask-form').addEventListener('submit', event => { event.preventDefault(); ask(); });
$('question').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); ask(); } });
for (const button of $('quick').querySelectorAll('button')) button.addEventListener('click', () => { $('question').value = button.dataset.q; ask(button.dataset.q); });
$('clear').addEventListener('click', () => {
  adviceController?.abort(); adviceController = null; $('question').value = '';
  $('answer-q').textContent = '還沒有問題'; $('answer').textContent = '選一個左邊的問題試試看，回答會出現在這裡。';
  $('answer-card').dataset.state = 'idle'; $('answer-source').textContent = ''; $('ask').disabled = !currentForecast; status('advice-status', '');
});
loadForecast();
