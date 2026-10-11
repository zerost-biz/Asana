// 単一HTMLのビルド結果を、Apps Script に載せる場所（gas/index.html）へコピーする
import { copyFileSync, existsSync } from 'node:fs'

if (!existsSync('dist-single/index.html')) {
  console.error('dist-single/index.html がありません。先に npm run build:single を実行してください')
  process.exit(1)
}
copyFileSync('dist-single/index.html', 'gas/index.html')
console.log('gas/index.html を更新しました')
