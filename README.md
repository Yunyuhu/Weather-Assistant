# 氣象資料與 AI 助理

[直接開啟公開 Demo](https://yunyuhu.github.io/Weather-Assistant/)

展示介面與正式 API 已接通，可讀取官方預報並取得即時 AI 說明。

由 [2024 氣象與 LINE／GPT 練習](https://github.com/Yunyuhu/AI-Practice-2024/blob/main/practice/weather_crawler_linebot_gpt.ipynb)延伸的公開網頁，將官方預報、欄位驗證與 AI 說明串成完整操作。

## 操作流程

1. 選擇臺灣縣市，查看三個預報時段的溫度、降雨機率、天氣與舒適度。
2. 輸入帶傘、穿著等問題。
3. 伺服器重新取得相同地區的官方預報，將驗證後資料送入 OpenAI API。
4. 回覆下方標示使用的地區與資料更新時間，可對照數值核對。

## 資料來源與版本範圍

原始 Notebook 使用中央氣象署開放資料 API，並另有 LINE webhook 與 GPT 回覆區塊。2026 展示版使用[中央氣象署縣市預報網頁](https://www.cwa.gov.tw/V8/C/W/County/index.html)本身公開載入的 [36 小時預報資料](https://www.cwa.gov.tw/Data/js/TableData_36hr_County_C.js)，免額外氣象金鑰，仍沿用官方來源。

伺服器只解析特定資料物件，不執行上游 JavaScript。包含縣市白名單、數值驗證、五分鐘快取及資料更新時間檢查。來源格式變更或資料超過十二小時未更新時會顯示錯誤，避免繼續使用異常資料。

這次新增的網頁串接與原始 Notebook 分開交代。原始 LINE 程式保留於原 repo；目前未提供已上線的 LINE 帳號，未將網頁展示宣稱為 LINE 已部署成果。

## 部署方式

[後端部署步驟與環境變數](DEPLOYMENT.md)

展示介面由 GitHub Pages 發布，正式 API 為 `https://weather-assistant-three.vercel.app`，由 Vercel Functions 執行。前端只保存公開 API 網址，金鑰保存在後端秘密環境變數。`DEMO_ALLOWED_ORIGIN` 限定為 `https://yunyuhu.github.io`。

- `.github/workflows/pages.yml`：發布 `public/`。
- `api/index.mjs`：檢查來源並處理跨來源預檢。
- `vercel.json`：指定 API 路由與執行期限。

## 程式與執行

`public/` 放操作介面，`worker.mjs` 處理官方資料與 AI 請求，`runtime.mjs` 處理共用 HTTP 限制與 API。`build.mjs` 與 `dev.mjs` 提供無第三方依賴的建置及本機伺服器。

```sh
# 先建置可部署的 Worker。
node build.mjs
# 從既有的本機設定檔讀取金鑰，設定檔不可提交。
DEMO_ENV_FILE=/absolute/path/to/.env.local PORT=8767 node dev.mjs
```

本機設定使用 `OPENAI_API_KEY`，預設模型為 `gpt-4.1-mini`，可透過 `OPENAI_MODEL` 調整。部署設定保存在託管平台的秘密環境變數，瀏覽器不會取得金鑰。

## 驗證與限制

- 已實際取得臺北市三個預報時段，並以真實 API 回覆核對第一時段的溫度、降雨機率與帶傘建議。
- 未知縣市會拒絕處理，不接受使用者提供的遠端資料網址。
- 頁面切換地區時取消舊請求，避免前一地區覆蓋目前的結果。
- 預報涵蓋範圍以官方時段為準，不提供逐小時觀測、即時警報或超出資料日期的資訊。
- AI 仍可能產生不精確推論，使用前請對照官方資料。
- 單一 Worker 執行個體內的每 IP 限制不是分散式全域費用上限。

## 官方文件

[中央氣象署](https://www.cwa.gov.tw/V8/C/W/County/index.html) · [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
