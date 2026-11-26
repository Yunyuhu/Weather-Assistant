# 後端部署

前端已由 GitHub Pages 發布於 https://yunyuhu.github.io/Weather-Assistant/ 。這份設定只將 API 部署到 Vercel。

## 匯入專案

1. 在 Vercel 新增專案，匯入 `Yunyuhu/Weather-Assistant`。
2. Project Name 可使用 `weather-assistant`。
3. Framework Preset 選 `Other`，Root Directory 保持專案根目錄。
4. 專案已附 `vercel.json`。Build Command 為 `node build.mjs`，Output Directory 為 `dist/empty`，Node.js 使用 22 或更新版。
5. 保留一般建置資源，無須啟用付費資料庫或其他服務。

## 環境變數

在部署前加入以下設定，套用至 Production。若要測試 Preview，另行設定對應環境。

| 名稱 | 值 | 用途 |
|---|---|---|
| `OPENAI_API_KEY` | 在 Vercel 直接填入自己的 API 金鑰，儲存為秘密 | 伺服器呼叫模型 |
| `OPENAI_MODEL` | `gpt-4.1-mini` | 使用的模型 |
| `DEMO_ALLOWED_ORIGIN` | `https://yunyuhu.github.io` | 允許的瀏覽器來源，結尾不加斜線 |

金鑰不得填入 `public/`、GitHub 檔案或聊天。需要長期展示時，請使用有效期限合適且有餘額的專案金鑰。

## 部署完成後

1. 使用正式 Production 網址，例如 `https://weather-assistant.vercel.app`。實際網址以 Vercel 部署結果為準。
2. 在網址後加上 `/api/health`，正常應顯示 `{"ready":true}`。這只確認設定存在，仍需實際呼叫驗證金鑰可用。
3. 將正式網址交回接續整合的人員。只需要網址，不需要提供金鑰。
4. 整合時將 `public/index.html` 的 `meta[name="api-base"]` 之 `content` 設為正式 API 網址，推送後由 Pages 自動更新。
5. 從 Pages 實際送出請求，核對瀏覽器、API、模型回覆與資料來源的完整往返。

目前 Pages 已連接 `https://weather-assistant-three.vercel.app`。後端目前以來源檔直接部署，尚未連接 Git 自動部署；更新後端程式時需重新部署。本機測試時可清空 `api-base` 並使用同源 API。

## 確認項目

- Production API 可供公開展示頁面呼叫，回應不能被登入頁攔截。
- Pages 來源的 OPTIONS 預檢回傳 204，並回傳正確的 `Access-Control-Allow-Origin`。
- 其他瀏覽器來源回傳 403。CORS 無法取代身分驗證或全域費用控管。
- 每次改環境變數後重新部署，讓新設定生效。

[GitHub Pages 說明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) · [Vercel Functions 說明](https://vercel.com/docs/functions/runtimes/node-js)
