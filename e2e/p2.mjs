// 社内オーダー・15日締め/末締めのCSVレポートのE2E
import fs from 'node:fs'
import { launch, goto, ok, num, summary, switchUser } from './lib.mjs'
const { browser, page, errs } = await launch({ acceptDownloads: true })
const main = () => page.locator('main').innerText()
/** オーダー表の「オーダー番号」「オーダー名」の入力欄の値 */
const orderCodes = () => page.locator('.ord-cols input[aria-label="オーダー番号"]').evaluateAll((els) => els.map((e) => e.value))
const orderNames = () => page.locator('.ord-cols input[aria-label="オーダー名"]').evaluateAll((els) => els.map((e) => e.value))

// ---------- 社内オーダーの登録 ----------
await goto(page, '/projects/bmes')
ok('概要: 社内オーダーの番号が見える', (await page.locator('.ov__dl').innerText()).includes('IO-2601-001'))
await goto(page, '/projects/bmes/orders')
ok('タブ: 「社内オーダー」がある', (await page.locator('.tabs .tabs__tab').allInnerTexts()).includes('社内オーダー'))
ok('社内オーダー: 登録済み2件と、時間・人件費の累計', (await page.locator('.ord-cols:not(.admtable__row--head)').count()) === 2 && (await orderCodes()).includes('IO-2601-002') && (await main()).includes('72h'))
await page.getByLabel('新しいオーダー番号').fill('io-2601-001')
ok('社内オーダー: 番号の重複は登録できない（表記ゆれも同じ扱い）', (await page.getByRole('button', { name: '登録', exact: true }).isDisabled()) && (await main()).includes('既に使われています'))
await page.getByLabel('新しいオーダー番号').fill('io-9999-001')
await page.getByLabel('新しいオーダー名').fill('E2E オーダー')
await page.getByRole('button', { name: '登録', exact: true }).click()
await page.waitForTimeout(250)
ok('社内オーダー: 登録できる（番号は大文字にそろう）', (await page.locator('.ord-cols:not(.admtable__row--head)').count()) === 3 && (await orderCodes()).includes('IO-9999-001'))
// 他プロジェクトと重複する番号
await goto(page, '/projects/asaas/orders')
await page.getByLabel('新しいオーダー番号').fill('IO-9999-001')
ok('社内オーダー: 他プロジェクトの番号とも重複できない', await page.getByRole('button', { name: '登録', exact: true }).isDisabled())

// ---------- 作業にオーダーを設定 ----------
await goto(page, '/projects/bmes/wbs')
await page.locator('.wbs__row', { hasText: 'As-Is整理' }).click()
await page.waitForSelector('.drawer')
const sel = page.locator('.drawer').getByLabel('社内オーダー')
ok('ドロワー: 作業の社内オーダーが選べる（現状は 現状分析）', (await sel.inputValue()) !== '' && (await sel.locator('option').count()) === 4)
await sel.selectOption({ label: 'IO-9999-001 E2E オーダー' })
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
ok('ドロワー: 保存すると更新履歴にオーダーの変更が残る', (await page.locator('.drawer').innerText()).includes('社内オーダー IO-2601-001→IO-9999-001'))
await page.keyboard.press('Escape')

// ---------- 自分の作業 → オーダーに計上 ----------
await switchUser(page, 'Hさん')
await goto(page, '/my-work')
const card = page.locator('.wc', { hasText: 'As-Is整理' }).first()
ok('自分の作業: 作業のオーダーが初期値で選ばれている', (await card.getByLabel('社内オーダー').inputValue()) !== '')
await card.locator('.stepper input[type=number]').first().fill('2.5')
await card.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
ok('自分の作業: 今日の入力履歴にオーダー番号が出る', (await page.locator('.mywork__log').innerText()).includes('IO-9999-001'))
// 別のオーダーを選んで入力
const card2 = page.locator('.wc', { hasText: '課題整理' }).first()
await card2.getByLabel('社内オーダー').selectOption({ label: 'IO-2601-001 B社 MES構想（現状分析）' })
await card2.locator('.stepper input[type=number]').first().fill('1')
await card2.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
ok('自分の作業: 入力のたびにオーダーを選び直せる', (await page.locator('.mywork__log').innerText()).includes('IO-2601-001'))
// 担当メンバーはレポートに入れない
ok('権限(リーダー): レポートのメニューが出る', (await page.locator('.sidebar').getByText('レポート', { exact: true }).count()) === 1)
await switchUser(page, 'Kさん')

// ---------- レポート ----------
await goto(page, '/reports')
const label0 = await page.locator('.rpt-period__label strong').innerText()
const periodIsFirst = label0.includes('前半')
ok('レポート: 今日を含む締め（前半/後半）が既定で選ばれる', /前半|後半/.test(label0) && (await page.getByRole('radio', { name: /前半/ }).getAttribute('aria-checked')) === (periodIsFirst ? 'true' : 'false'), label0)
ok('レポート: 今日の入力（2.5h と 1h）が、選んだオーダーで集計される', await (async () => {
  const t = await page.locator('table.rpt tbody').innerText()
  return t.includes('IO-9999-001') && t.includes('IO-2601-001')
})())
const rowsHours = (await page.locator('table.rpt tbody tr td:nth-last-child(3)').allInnerTexts()).map(num)
const totalShown = num(await page.locator('table.rpt tfoot th.num').first().innerText())
ok('レポート: 合計は行の合計と一致する', Math.abs(rowsHours.reduce((a, b) => a + b, 0) - totalShown) < 0.01, `${rowsHours} vs ${totalShown}`)

// 期間の切替: 前半 → 後半
await page.getByRole('radio', { name: /前半/ }).click()
const first = await page.locator('.rpt-period__label').innerText()
ok('締め: 前半は 1日〜15日（15日締め）', first.includes('1日〜15日・15日締め') && /-01 〜 \d{4}-\d\d-15（締め日 \d{4}-\d\d-15）/.test(first), first)
await page.getByRole('radio', { name: /後半/ }).click()
const second = await page.locator('.rpt-period__label').innerText()
ok('締め: 後半は 16日〜末日（末締め）', second.includes('末締め') && /-16 〜 \d{4}-\d\d-(28|29|30|31)（締め日 \d{4}-\d\d-(28|29|30|31)）/.test(second), second)
await page.getByRole('radio', { name: '月全体' }).click()
ok('締め: 月全体は 1日〜末日', /-01 〜 \d{4}-\d\d-(28|29|30|31)/.test(await page.locator('.rpt-period__label').innerText()))
// 前後へ
await page.getByRole('radio', { name: /前半/ }).click()
const a = await page.locator('.rpt-period__label strong').innerText()
await page.getByRole('button', { name: '次の期間' }).click()
const b = await page.locator('.rpt-period__label strong').innerText()
await page.getByRole('button', { name: '前の期間' }).click()
ok('締め: 次の期間 → 前の期間 で元に戻る（前半→後半）', a.includes('前半') && b.includes('後半') && (await page.locator('.rpt-period__label strong').innerText()) === a, `${a} → ${b}`)

// 今回の締めに戻す
await page.getByRole('button', { name: '今回の締めへ' }).click().catch(() => {})
await page.waitForTimeout(150)
ok('レポート: 「今回の締めへ」で今日を含む期間に戻る', (await page.locator('.rpt-period__label strong').innerText()) === label0)

// ---------- CSV ----------
const tableRows = await page.locator('table.rpt tbody tr').count()
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '集計をCSVで出力' }).click()])
const name = dl.suggestedFilename()
const text = fs.readFileSync(await dl.path(), 'utf8')
ok('CSV(集計): ファイル名に種類と締め期間が入る', name.startsWith('社内オーダー別集計_') && name.endsWith('.csv') && /(前半|後半)/.test(name), name)
ok('CSV(集計): UTF-8のBOM・CRLF・見出し', text.charCodeAt(0) === 0xfeff && text.includes('\r\n') && text.split('\r\n')[0].replace('﻿', '') === '締め期間,期間開始,期間終了,プロジェクト,顧客,社内オーダー番号,オーダー名,作業時間(h),人件費(円),件数', text.slice(0, 80))
const lines = text.split('\r\n').filter(Boolean)
ok('CSV(集計): 画面の表と同じ行数・オーダー番号を含む', lines.length - 1 === tableRows && text.includes('IO-9999-001') && text.includes('IO-2601-001'), `${lines.length - 1} vs ${tableRows}`)
await page.getByLabel('CSVに合計行を付ける').check()
const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '集計をCSVで出力' }).click()])
const text2 = fs.readFileSync(await dl2.path(), 'utf8')
ok('CSV: 「合計行を付ける」で末尾に合計が入る', text2.split('\r\n').filter(Boolean).at(-1).includes(',合計,'))
const [dl3] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '明細をCSVで出力' }).click()])
const text3 = fs.readFileSync(await dl3.path(), 'utf8')
ok('CSV(明細): 作業日・作業番号・担当者・コメントまで1件ずつ出る', dl3.suggestedFilename().startsWith('作業時間明細_') && text3.split('\r\n')[0].includes('作業日') && text3.includes('Hさん') && text3.includes('IO-9999-001'))
// プロジェクトで絞り込み
await page.getByLabel('プロジェクト', { exact: true }).selectOption({ label: 'A社 SaaS導入' })
const [dl4] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '集計をCSVで出力' }).click()])
const text4 = fs.readFileSync(await dl4.path(), 'utf8')
ok('CSV: プロジェクトで絞り込める（ファイル名にもプロジェクト名）', dl4.suggestedFilename().includes('A社SaaS導入') && !text4.includes('B社 MES構想') && text4.includes('IO-2601-010'), dl4.suggestedFilename())
await page.getByLabel('プロジェクト', { exact: true }).selectOption('all')
// 担当者別
await page.getByRole('radio', { name: '集計', exact: true }).click()
await page.getByLabel('担当者別に分ける').check()
ok('レポート: 担当者別に分けると「担当者」の列が出る', (await page.locator('table.rpt thead').innerText()).includes('担当者'))
// 明細タブ
await page.getByRole('radio', { name: '明細', exact: true }).click()
ok('レポート: 明細の表（作業日・コメント）', (await page.locator('table.rpt thead').innerText()).includes('作業日') && (await page.locator('table.rpt tbody tr').count()) > 5)

// ---------- オーダー未設定 → まとめて割り当て ----------
await goto(page, '/projects/bmes/orders')
await page.getByRole('button', { name: 'IO-2601-002を削除' }).click()
await page.getByRole('button', { name: '削除する' }).click()
await page.waitForTimeout(300)
await goto(page, '/reports?project=bmes')
await page.getByRole('radio', { name: '月全体' }).click()
const unset = num(await page.locator('.kpi', { hasText: 'オーダー未設定の時間' }).locator('.kpi__value').innerText())
ok('削除したオーダーの作業時間は「未設定」になり、レポートで警告される', unset > 0 && (await main()).includes('オーダー未設定の作業時間が') && (await page.locator('table.rpt tr.is-unset').count()) >= 1, String(unset))
await page.getByRole('link', { name: '「社内オーダー」タブ' }).click()
await page.waitForURL(/\/orders/)
await page.getByLabel('割り当てるオーダー').selectOption({ label: 'IO-9999-001 E2E オーダー' })
await page.getByRole('button', { name: 'まとめて割り当てる' }).click()
await page.waitForTimeout(300)
ok('未設定の作業時間・作業をまとめて割り当てられる', (await main()).includes('オーダーが設定されていない作業時間・作業はありません'))

// ---------- プロジェクト追加でオーダー番号 ----------
await goto(page, '/')
await page.getByRole('button', { name: 'プロジェクトを追加' }).first().click()
await page.getByLabel('プロジェクト名').fill('G社 E2Eオーダー')
await page.locator('#pj-order').fill('IO-9999-001')
ok('プロジェクト追加: 既存と同じオーダー番号はエラー', (await page.locator('.form__errors').innerText()).includes('既に使われています'))
await page.locator('#pj-order').fill('IO-8888-001')
await page.getByRole('button', { name: /^追加|作成/ }).last().click()
await page.waitForURL(/\/projects\/p-.*\/wbs/)
await page.waitForTimeout(300)
const url = new URL(page.url()).pathname
await page.locator('.wbs__row', { hasText: '質問票の作成' }).first().click()
await page.waitForSelector('.drawer')
ok('プロジェクト追加: オーダー番号が登録され、テンプレートの作業に設定される', (await page.locator('.drawer').getByLabel('社内オーダー').locator('option:checked').innerText()).includes('IO-8888-001'))
await page.keyboard.press('Escape')
await goto(page, url.replace('/wbs', '/orders'))
ok('プロジェクト追加: オーダーは名称省略でプロジェクト名になる', (await orderNames()).includes('G社 E2Eオーダー') && (await orderCodes()).includes('IO-8888-001'))

// ---------- 履歴・保存 ----------
await goto(page, '/admin')
await page.getByRole('tab', { name: '更新履歴' }).click()
ok('管理: 更新履歴に「社内オーダー」の登録・割り当てが残る', (await main()).includes('社内オーダー「IO-9999-001 E2E オーダー」を追加') && (await main()).includes('割り当て'))
await page.reload()
await page.waitForSelector('.app')
await goto(page, '/projects/bmes/orders')
ok('保存: リロード後もオーダーが残る', (await orderCodes()).includes('IO-9999-001'))

// ---------- 権限 ----------
await switchUser(page, 'Uさん')
await goto(page, '/reports')
ok('権限(担当): レポートは出力できない（メニューも出ない）', (await main()).includes('リーダー以上') && (await page.locator('.sidebar').getByText('レポート', { exact: true }).count()) === 0)
await goto(page, '/projects/bmes/orders')
ok('権限(担当): オーダーの登録フォーム・削除は出ない（参照のみ）', (await page.getByLabel('新しいオーダー番号').count()) === 0 && (await page.getByRole('button', { name: /を削除$/ }).count()) === 0 && (await main()).includes('IO-9999-001'))
await goto(page, '/my-work')
const mine = page.locator('.wc').first()
ok('権限(担当): 自分の作業ではオーダーを選んで時間を入力できる', (await mine.getByLabel('社内オーダー').count()) === 1)

process.exitCode = summary(errs) ? 1 : 0
await browser.close()
