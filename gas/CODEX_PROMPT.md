# Codex への依頼プロンプト

以下をそのまま Codex に渡してください（`gas-trial.zip` を添付、またはこのリポジトリを開いた状態で）。

---

あなたは Google Apps Script（GAS）に詳しいエンジニアです。React + TypeScript 製の社内向けWebアプリ「Project Delivery OS」を、**私個人のGoogleアカウントの Google Apps Script + スプレッドシート上で動かすトライアル**を完成させてください。UIはすべて日本語です。

## 現状（実装済み）
- `src/` … Vite + React 18 + TypeScript 製のアプリ本体（localStorage 保存）。`npm run build:gas` で単一HTML（`dist-single/index.html`）を作り、`gas/index.html` にコピーします。
- `gas/Code.gs` … サーバー側。`doGet`（`index` を配信）、`loadData` / `saveData`（アプリ全体のJSONを「Data」シートへ40,000文字ずつ分割保存。LockService で排他）、`clearData`、`saveToDrive`（CSV/JSONをマイドライブ「Project Delivery OS」フォルダへ保存しURLを返す）、`onOpen` と `exportReadableSheets`（閲覧用シート「表_◯◯」への書き出し）。
- `gas/appsscript.json` … V8、Asia/Tokyo、Webアプリ（実行：自分、アクセス：自分のみ）。
- `src/repository/GasRepository.ts` … `google.script.run` 経由で上記関数を呼ぶ。Apps Script 上（`google.script.run` が存在）で開くと自動で選ばれる。保存は直列化し、溜まった変更は最新1回にまとめる。
- `src/platform/saveFile.ts` … Apps Script 上ではCSVをブラウザのダウンロードではなく `saveToDrive` で保存。
- 手順書：`gas/README.md`。

## やってほしいこと
1. **私のGoogleアカウントに実際にデプロイして動かす**（`clasp` を使ってよい）。
   - 空のスプレッドシートに紐づく（コンテナバインド）スクリプトとして作成：`cd gas && clasp login && clasp create --type sheets --title "Project Delivery OS" && clasp push`。
   - Webアプリとしてデプロイ（実行：自分、アクセス：自分のみ）し、URLを私に伝える。
   - 認可（スプレッドシート・ドライブ）の承認が必要な場合は、私が操作する手順を日本語で案内する。
2. **実機で次を確認**し、問題があれば修正する（修正は最小限）。
   - 初回表示でデモデータが出る／操作して再読み込みしても内容が残る（「Data」シートに保存されている）。
   - 別端末・別ブラウザで同じURLを開いても同じ内容になる。
   - 「レポート」→「集計をCSVで出力」でドライブの「Project Delivery OS」フォルダにCSV（UTF-8 BOM付き、改行CRLF、ファイル名 `社内オーダー別集計_YYYY年M月前半.csv` など）ができ、メッセージの「開く」から開ける。
   - メニュー「Project Delivery OS → 内容をシートに書き出す」で「表_◯◯」シートが作られる。
   - ブラウザのコンソールにエラーが出ない（HTML Service の iframe 上でも `<script type="module">` のインラインが動くこと、`localStorage` が使えなくても落ちないことを特に確認）。
3. 動かなかった点があれば、原因・直した内容・残課題を報告する。

## 守ってほしいこと
- 画面の文言は日本語のまま。英語の追加は最小限。
- `src/domain/*`（計算ロジック）と既存の振る舞いは変えない。変えた場合は理由を書く。
- 変更後は `npx tsc -b`、`npx eslint .`、`npx vitest run` が通ること（現状 157 件通過）。
- `gas/index.html` は生成物。アプリ側を直したら `npm run build:gas` で作り直す。
- 秘密情報・個人情報をリポジトリやログに出さない。デプロイURLは私にだけ伝える。
- スコープ外：複数人の同時編集、本物のログイン/権限、差分保存（トライアルは「自分1人・全体保存」でよい）。

## 最後に報告してほしいこと
- デプロイしたWebアプリのURL（私だけが開ける設定であること）
- 上記確認項目ごとの結果（OK/NG）
- 修正したファイルと内容
- 本格運用に進むときの次の一手（表ごとのシート保存、差分更新、メールアドレスによる権限確認）
