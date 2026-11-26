// 公開頁面與 API 分開部署；本機未指定時沿用同源路徑。
const API_BASE = document.querySelector('meta[name="api-base"]')?.content || '';
/* 更換地區時取消舊請求，避免較晚回傳的上一個縣市覆蓋目前畫面。 */
const $ = id => document.getElementById(id);
let currentForecast = null, forecastController, adviceController;
function status(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
async function read(response) { let data; try { data = await response.json(); } catch { throw Error('暫時無法讀取服務資料，請稍後再試。'); } if (!response.ok) throw Error(data.error || '暫時無法取得資料。'); return data; }
function sourceText(data) { return `${data.city} · 氣象署發布 ${data.issuedAt} · 資料更新 ${new Date(data.updatedAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}（臺北時間）`; }
function renderForecast(data) {
  $('forecast').replaceChildren();
  for (const period of data.periods) {
    const card = document.createElement('article'); card.className = 'forecast-card';
    const time = document.createElement('h3'); time.textContent = period.time;
    const temperature = document.createElement('div'); temperature.className = 'temperature'; temperature.textContent = `${period.low}～${period.high} °C`;
    const weather = document.createElement('p'); weather.textContent = period.weather;
    const rain = document.createElement('span'); rain.className = 'pill'; rain.textContent = `降雨機率 ${period.rain}%`;
    const comfort = document.createElement('p'); comfort.className = 'small'; comfort.textContent = period.comfort;
    card.append(time, temperature, weather, rain, comfort); $('forecast').append(card);
  }
  $('source-info').textContent = sourceText(data);
}
async function loadForecast() {
  forecastController?.abort(); adviceController?.abort(); adviceController = null;
  const current = new AbortController(); forecastController = current; currentForecast = null;
  $('ask').disabled = true; $('forecast').replaceChildren(); $('source-info').textContent = '';
  $('answer').textContent = '提出問題後，回覆會顯示在這裡。'; $('answer-source').textContent = '';
  status('forecast-status', '正在讀取中央氣象署預報…'); status('advice-status', '只回答目前三個預報時段能支持的內容。');
  try {
    const data = await read(await fetch(API_BASE + '/api/forecast?city=' + encodeURIComponent($('city').value), { signal: current.signal }));
    if (forecastController !== current) return;
    currentForecast = data; renderForecast(data); $('ask').disabled = false; status('forecast-status', '預報已更新。');
  } catch (error) { if (error.name !== 'AbortError') status('forecast-status', error.message, true); }
}
async function ask() {
  const question = $('question').value.trim();
  if (!question) return status('advice-status', '請先輸入想知道的問題。', true);
  if (!currentForecast) return status('advice-status', '請先取得預報資料。', true);
  const current = new AbortController(); adviceController = current; $('ask').disabled = true;
  status('advice-status', '正在根據預報整理說明…'); $('answer').textContent = '正在讀取資料並生成回覆…'; $('answer-source').textContent = '';
  try {
    const data = await read(await fetch(API_BASE + '/api/advice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: $('city').value, question }), signal: current.signal }));
    if (adviceController !== current) return;
    currentForecast = data.forecast; renderForecast(data.forecast); $('answer').textContent = data.answer;
    $('answer-source').textContent = '本次回答依據：' + sourceText(data.forecast); status('advice-status', '回答完成。可以對照上方數值核對。');
  } catch (error) { if (error.name !== 'AbortError') { $('answer').textContent = '這次未取得回覆，預報資料仍可直接閱讀。'; status('advice-status', error.message, true); } }
  finally { if (adviceController === current) { adviceController = null; $('ask').disabled = !currentForecast; } }
}
$('city').addEventListener('change', loadForecast); $('refresh').addEventListener('click', loadForecast); $('ask').addEventListener('click', ask);
$('clear').addEventListener('click', () => { adviceController?.abort(); adviceController = null; $('question').value = ''; $('answer').textContent = '提出問題後，回覆會顯示在這裡。'; $('answer-source').textContent = ''; $('ask').disabled = !currentForecast; status('advice-status', '只回答目前三個預報時段能支持的內容。'); });
$('umbrella').addEventListener('click', () => { $('question').value = '接下來出門需要帶傘嗎？請依每個預報時段說明。'; });
$('clothes').addEventListener('click', () => { $('question').value = '依目前預報的溫度，衣服怎麼準備比較合適？'; });
loadForecast();
