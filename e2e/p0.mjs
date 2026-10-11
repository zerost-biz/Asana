// P0（ホーム・プロジェクト・作業一覧・ドロワー・タイムライン・稼働状況・自分の作業・リスク・週次レビュー・保存）のE2E
import { launch, goto, ok, num, stat, switchUser, summary, BASE } from './lib.mjs'
const { browser, page, errs } = await launch()

// ---------- 全画面が描画される ----------
const routes = [
  ['/', 'ホーム'], ['/pipeline', '受注見込み'], ['/pipeline/o-c', 'C社'], ['/pipeline/o-c/evaluation', 'PJ化の評価'],
  ['/projects', 'プロジェクト'], ['/projects/bmes', 'B社 MES構想'], ['/projects/bmes/wbs', 'B社 MES構想'],
  ['/projects/bmes/timeline', 'B社 MES構想'], ['/projects/bmes/dashboard', 'B社 MES構想'], ['/projects/bmes/workload', 'B社 MES構想'],
  ['/projects/bmes/risks', 'B社 MES構想'], ['/projects/aold/close', 'A社 業務診断'], ['/workload', '稼働状況'], ['/assignments', '配置'],
  ['/people', 'メンバー'], ['/people/u-h', 'Hさん'], ['/people/skills', 'スキルマップ'], ['/my-work', '自分の作業'], ['/review', '週次レビュー'], ['/admin', '管理'],
]
for (const [p, h] of routes) {
  await goto(page, p)
  const t = await page.locator('h1').first().innerText().catch(() => '')
  ok(`画面が表示される ${p}`, t.includes(h), t)
}
await goto(page, '/no-such-page')
ok('存在しないURLは案内を表示', (await page.locator('main').innerText()).includes('見つかりません'))

// ---------- ホーム ----------
await goto(page, '/')
ok('ホーム: 重点テーマ・KPI・要判断・稼働の見通し・次の期限・成果・成長', (await page.locator('main').innerText()).match(/今週の重点テーマ[\s\S]*要判断[\s\S]*稼働の見通し[\s\S]*次の期限[\s\S]*最近の成果[\s\S]*成長/) !== null)
const decisions0 = num(await page.locator('.kpi', { hasText: '要判断件数' }).locator('.kpi__value').innerText())
ok('ホーム: 要判断件数が表示される', decisions0 > 0, String(decisions0))
// 重点テーマの編集
await page.getByRole('button', { name: '重点テーマを編集' }).click()
await page.getByLabel('今週の重点テーマ').last().fill('E2E: 今週の重点テーマ')
await page.getByRole('button', { name: '保存', exact: true }).click()
ok('ホーム: 重点テーマを編集できる', (await page.locator('.mission__text').innerText()).includes('E2E'))
await page.reload()
await page.waitForSelector('.mission__text')
ok('ホーム: 重点テーマが再読み込み後も残る', (await page.locator('.mission__text').innerText()).includes('E2E'))
// 見込み込みの切替
await page.locator('.wo').getByRole('radio', { name: '確定のみ' }).click()
const committed = (await page.locator('.wo__pill').allInnerTexts()).join()
await page.locator('.wo').getByRole('radio', { name: '受注見込みを含む' }).click()
const forecast = (await page.locator('.wo__pill').allInnerTexts()).join()
ok('ホーム: 確定のみ/見込み込みで負荷率が変わる', committed !== forecast)

// ---------- 通知ベル ----------
await page.getByRole('button', { name: /^通知/ }).click()
ok('通知ベル: 一覧が開く', (await page.locator('.alerts__item').count()) > 5)
await page.locator('.alerts__item').first().click()
ok('通知ベル: クリックで該当画面へ移動', page.url().includes('/workload') || page.url().includes('/projects') || page.url().includes('/pipeline'), page.url())

// ---------- プロジェクト一覧 ----------
await goto(page, '/projects')
ok('一覧: 状態の悪い順（C社 SCADA が先頭）', (await page.locator('a.pf__row').first().innerText()).includes('C社 SCADA'))
await page.getByLabel('絞り込みと並べ替え').locator('select').first().selectOption('WATCH')
ok('一覧: 状態=注意 で絞り込み', (await page.locator('a.pf__row').count()) === 1 && (await page.locator('a.pf__row').first().innerText()).includes('B社'))
await page.getByLabel('絞り込みと並べ替え').locator('select').first().selectOption('all')
await page.getByRole('radio', { name: /カード/ }).click()
ok('一覧: カード表示に切り替わる', (await page.locator('a.pfc').count()) >= 4)
await page.getByRole('radio', { name: /表/ }).click()
await page.getByLabel('絞り込みと並べ替え').locator('select').nth(4).selectOption('all')
ok('一覧: ステータス=すべてで完了PJも出る', (await page.locator('a.pf__row').count()) === 5)
await page.getByLabel('絞り込みと並べ替え').locator('select').nth(5).selectOption('variance')
ok('一覧: 見込み差異が大きい順', (await page.locator('a.pf__row').first().innerText()).includes('C社 SCADA'))

// ---------- 概要 ----------
await goto(page, '/projects/bmes')
const ovText = await page.locator('main').innerText()
ok('概要: 基本情報・マイルストーン・メンバーの負荷・リスク・更新履歴', /プロジェクト情報[\s\S]*マイルストーン[\s\S]*最近の更新/.test(ovText) && /メンバーと今後の負荷/.test(ovText))
ok('概要: タブ（概要/一覧/タイムライン/ダッシュボード/稼働状況/リスク）', (await page.locator('.tabs .tabs__tab').allInnerTexts()).join('|') === '概要|一覧|タイムライン|ダッシュボード|稼働状況|リスク')

// ---------- WBS: 表示と編集 ----------
await goto(page, '/projects/bmes/wbs')
const asis = page.locator('.wbs__row', { hasText: 'As-Is整理' })
ok('WBS: As-Is整理 = 計画36 実績24 残り16 見込み40 +4', /36h\s*24h\s*16h\s*40h/.test((await asis.innerText()).replace(/\n/g, '')) && (await asis.innerText()).includes('+4h'))
ok('WBS: 3階層の番号（2.2.1）と種別アイコン・先行/成果物/リスクの印', (await page.locator('.wbs__code', { hasText: '2.2.1' }).count()) === 1 && (await page.locator('.wtype--milestone').count()) >= 3 && (await page.locator('.wbs__ind').count()) >= 3)
const planTotal0 = await stat(page, '計画')
const eacTotal0 = await stat(page, '見込み')
await asis.click()
await page.waitForSelector('.drawer')
const dr = page.locator('.drawer')
ok('ドロワー: 基本/日程/工数/進捗/成果物/リスク/更新履歴の区分', ['基本', '日程', '工数', '進捗', '成果物', 'リスク・課題', '更新履歴・コメント'].every((t) => ['', ''].length && true) && (await dr.innerText()).match(/基本[\s\S]*日程[\s\S]*工数[\s\S]*進捗[\s\S]*成果物[\s\S]*リスク・課題[\s\S]*更新履歴・コメント/) !== null)
ok('ドロワー: 当初の計画（ベースライン）が表示される', (await dr.innerText()).includes('当初の計画'))
// 残りを +10h
const etcInput = dr.getByLabel('残り（あと何時間かかるか h）', { exact: false }).first()
await dr.locator('input[type=number]').nth(1).fill('26')
ok('ドロワー: 保存前にライブで 見込み・差異 が更新される', (await dr.locator('.metrics').innerText()).includes('50h') && (await dr.locator('.metrics').innerText()).includes('+14h'))
await dr.locator('input[placeholder^="例: 顧客レビュー"]').fill('レビュー待ちのため再見積り')
await page.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
ok('ドロワー: 保存すると プロジェクト合計の見込みが +10h', (await stat(page, '見込み')) === eacTotal0 + 10)
ok('ドロワー: 計画は変わらない', (await stat(page, '計画')) === planTotal0)
ok('ドロワー: 更新履歴とコメントに残る', (await dr.innerText()).includes('残り 16h→26h') && (await dr.innerText()).includes('レビュー待ちのため再見積り'))
// コメント
await dr.getByLabel('コメント', { exact: true }).fill('確認しました')
await dr.getByRole('button', { name: 'コメントする' }).click()
ok('ドロワー: コメントを追加できる', (await dr.innerText()).includes('確認しました'))
// 成果物URLの検証
const urlInput = dr.locator('input[placeholder^="https://drive"]')
await urlInput.fill('not-a-url')
ok('ドロワー: 成果物URLの形式エラー', (await dr.locator('.form__errors').innerText()).includes('http'))
await urlInput.fill('')
// 先行タスクの日程矛盾
await dr.locator('select').filter({ hasText: 'なし' }).first().selectOption({ index: 1 })
await page.waitForTimeout(150)
// リスク追加
await dr.getByLabel('リスクの内容').fill('E2E リスク')
await dr.locator('.irisks__add').getByRole('button', { name: '追加' }).click()
ok('ドロワー: 作業にリスクを紐づけられる', (await dr.innerText()).includes('E2E リスク'))
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
ok('ドロワー: Esc で閉じる', (await page.locator('.drawer').count()) === 0)

// ---------- 作業の追加・マイルストーン・複製・移動・削除 ----------
await page.getByRole('button', { name: 'マイルストーン', exact: true }).first().click()
await page.waitForSelector('.drawer')
await page.locator('.drawer input.input').first().fill('E2E マイルストーン')
await page.getByRole('button', { name: '追加', exact: true }).last().click()
await page.waitForTimeout(300)
ok('マイルストーン: 追加できる（達成/未達成の表示）', (await page.locator('.wbs__row--ms', { hasText: 'E2E マイルストーン' }).count()) === 1)
await page.keyboard.press('Escape')
await page.getByRole('button', { name: '作業を追加' }).first().click()
await page.waitForSelector('.drawer')
await page.locator('.drawer input.input').first().fill('E2E 作業')
await page.getByRole('button', { name: '追加', exact: true }).last().click()
await page.waitForTimeout(300)
ok('作業: 追加できる（計画8h・ETC8h）', /8h\s*0h\s*8h\s*8h/.test((await page.locator('.wbs__row', { hasText: 'E2E 作業' }).first().innerText()).replace(/\n/g, '')))
await page.keyboard.press('Escape')
const eacBefore = await stat(page, '見込み')
const row = page.locator('.wbs__row', { hasText: 'E2E 作業' }).first()
await row.getByRole('button', { name: /の操作/ }).click()
await page.locator('.menu__item', { hasText: '複製' }).click()
await page.waitForTimeout(300)
ok('作業: 複製できる（見込みが +8h）', (await page.locator('.wbs__row', { hasText: 'E2E 作業（コピー）' }).count()) === 1 && (await stat(page, '見込み')) === eacBefore + 8)
await page.keyboard.press('Escape')
const dup = page.locator('.wbs__row', { hasText: 'E2E 作業（コピー）' }).first()
await dup.getByRole('button', { name: /の操作/ }).click()
await page.locator('.menu__item', { hasText: '上へ移動' }).click()
await page.waitForTimeout(200)
const order = await page.locator('.wbs__title').allInnerTexts()
ok('作業: 上へ移動できる', order.indexOf('E2E 作業（コピー）') < order.indexOf('E2E 作業'))
await page.locator('.wbs__row', { hasText: 'E2E 作業（コピー）' }).first().getByRole('button', { name: /の操作/ }).click()
await page.locator('.menu__item', { hasText: '削除' }).click()
await page.getByRole('button', { name: '削除する' }).click()
await page.waitForTimeout(300)
ok('作業: 削除でき、見込みが元に戻る', (await page.locator('.wbs__row', { hasText: 'E2E 作業（コピー）' }).count()) === 0 && (await stat(page, '見込み')) === eacBefore)
// 警告のある行だけ
await page.getByLabel('警告のある行だけ').check()
const warnRows = await page.locator('.wbs__row:not(.wbs__row--head):not(.wbs__row--total):not(.wbs__row--parent)').count()
ok('WBS: 「警告のある行だけ」で絞り込める', warnRows > 0 && warnRows < 14, String(warnRows))
await page.getByLabel('警告のある行だけ').uncheck()
await page.getByRole('radio', { name: '金額（円）' }).click()
ok('WBS: 時間/金額の切替', (await page.locator('.wbs__row--total').innerText()).includes('万'))
await page.getByRole('radio', { name: '時間' }).click()
// テンプレート
await goto(page, '/projects/asaas/wbs')

// ---------- タイムライン ----------
await goto(page, '/projects/bmes/timeline')
ok('タイムライン: マイルストーンの◇・先行→後続の矢印・今日線', (await page.locator('.tl__ms').count()) >= 3 && (await page.locator('.tl__dep').count()) >= 3 && (await page.locator('.tl__today').count()) === 1)
const wWeek = await page.locator('.tl__inner').evaluate((e) => e.getBoundingClientRect().width)
await page.getByRole('radio', { name: '月' }).click()
const wMonth = await page.locator('.tl__inner').evaluate((e) => e.getBoundingClientRect().width)
ok('タイムライン: 週/月の切替で幅が変わる', wMonth < wWeek, `${wWeek} -> ${wMonth}`)
await page.locator('.tl__row', { hasText: 'As-Is整理' }).first().click()
await page.waitForSelector('.drawer', { timeout: 3000 }).catch(() => {})
ok('タイムライン: 行クリックで作業ドロワー', (await page.locator('.drawer').count()) === 1)
await page.keyboard.press('Escape')

// ---------- 稼働状況 ----------
await goto(page, '/workload')
const cellK1 = page.getByRole('cell', { name: /Kさん 来週/ })
ok('稼働: Kさん 来週は過負荷（118%以上）', num((await cellK1.getAttribute('aria-label')).match(/負荷(\d+)%/)[1]) >= 118 && (await cellK1.getAttribute('aria-label')).includes('過負荷'))
await page.getByRole('radio', { name: '確定のみ' }).click()
const hist = (await page.locator('.wl__cell .wl__pct').allInnerTexts()).join()
await page.getByRole('radio', { name: '受注見込みを含む' }).click()
ok('稼働: 確定のみ/見込み込みの切替で負荷率が変わる', hist !== (await page.locator('.wl__cell .wl__pct').allInnerTexts()).join())
await page.getByRole('radio', { name: '12週' }).click()
ok('稼働: 12週表示', (await page.locator('.wl__colhead').count()) === 12)
await page.getByRole('radio', { name: '4週' }).click()
ok('稼働: 未配置の需要の行', (await page.locator('.wl__row--unassigned').count()) === 1)
await cellK1.click()
await page.waitForSelector('.drawer')
ok('稼働ドロワー: 確定・見込み・稼働可能と内訳', (await page.locator('.drawer').innerText()).match(/確定[\s\S]*見込み[\s\S]*稼働可能[\s\S]*確定の内訳/) !== null)
// 休暇を入れる → 稼働可能が減り負荷率が上がる
await page.locator('.drawer .wd-cap input[type=number]').fill('16')
await page.locator('.drawer .wd-cap input[type=number]').blur()
await page.waitForTimeout(250)
const afterCap = await cellK1.getAttribute('aria-label')
ok('稼働: 休暇16hを入れると稼働可能が減り負荷率が上がる', num(afterCap.match(/負荷(\d+)%/)[1]) > 118, afterCap)
// 手修正
const mine = page.locator('.drawer .wd-edit .wd-edit__num').first()
if (await mine.count()) {
  const before = num(await mine.inputValue())
  await mine.fill(String(before + 4))
  await page.waitForTimeout(250)
  ok('稼働: 週別の手修正が反映され「手修正」と表示される', (await page.locator('.drawer .wd-edit__reset').count()) >= 1)
  await page.locator('.drawer .wd-edit__reset').first().click()
  await page.waitForTimeout(200)
  ok('稼働: 自動に戻せる', (await page.locator('.drawer .wd-edit__reset').count()) === 0)
} else ok('稼働: 手修正の入力欄（K は管理者）', false, 'no input')
await page.keyboard.press('Escape')

// ---------- 自分の作業 → ACT↑ → EAC → 全画面 ----------
await goto(page, '/my-work')
await switchUser(page, 'Hさん')
const card = page.locator('.wc', { hasText: '課題整理' }).first()
ok('自分の作業: 今日/今週/今後の区分', (await page.locator('.mw-sec__title').allInnerTexts()).some((t) => t.includes('今日やること')))
const sumToday0 = num(await page.locator('.sum').first().locator('b').innerText())
await goto(page, '/projects/bmes/wbs')
const act0 = await stat(page, '実績')
await goto(page, '/my-work')
await card.locator('.stepper input[type=number]').first().fill('2')
await card.locator('input[placeholder^="今日やった"]').fill('E2E 実績入力')
await card.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
ok('自分の作業: 保存結果（実績・見込み・差異）が表示される', (await card.locator('.wc__result').innerText()).includes('実績'))
await goto(page, '/projects/bmes/wbs')
ok('自分の作業 → 実績が +2h（プロジェクト合計）', (await stat(page, '実績')) === act0 + 2)
await goto(page, '/my-work')
// 完了にする → ETC=0
const c2 = page.locator('.wc', { hasText: '課題整理' }).first()
await c2.getByRole('button', { name: '完了にする' }).click()
await c2.getByRole('button', { name: '保存', exact: true }).click()
await page.waitForTimeout(300)
await goto(page, '/projects/bmes/wbs')
const dRow = await page.locator('.wbs__row', { hasText: '課題整理' }).first().innerText()
ok('自分の作業: 完了にすると 残り0h・完了', /0h/.test(dRow) && dRow.includes('完了'))
await switchUser(page, 'Kさん')

// ---------- リスク ----------
await goto(page, '/projects/bmes/risks')
const nRisk0 = await page.locator('.rtable__row:not(.rtable__row--head)').count()
await page.locator('.risksview__title input').fill('E2E 重大リスク')
const selects = page.locator('.risksview__form select')
await selects.nth(1).selectOption('high')
await page.getByRole('button', { name: '追加', exact: true }).last().click()
await page.waitForTimeout(250)
ok('リスク: 追加できる', (await page.locator('.rtable__row:not(.rtable__row--head)').count()) === nRisk0 + 1)
await goto(page, '/')
const decisions1 = num(await page.locator('.kpi', { hasText: '要判断件数' }).locator('.kpi__value').innerText())
ok('リスク: 重大リスクが ホームの「要判断」に出る', decisions1 > decisions0, `${decisions0} -> ${decisions1}`)

// ---------- 週次レビュー ----------
await goto(page, '/review')
await page.getByLabel('決定メモ', { exact: true }).fill('E2E: C社は人員追加で調整')
await page.getByRole('button', { name: 'メモを保存' }).click()
ok('週次レビュー: 決定メモを残せる', (await page.locator('.rnotes').first().innerText()).includes('E2E'))
ok('週次レビュー: 判断・受注見込みの動き・状態と工数・稼働・停止中リスク・成果・成長', (await page.locator('main').innerText()).match(/判断が必要なこと[\s\S]*受注見込みの動き[\s\S]*プロジェクトの状態と工数[\s\S]*稼働の見通し[\s\S]*停止中・リスク[\s\S]*最近の成果[\s\S]*成長/) !== null)

// ---------- 保存と復元 ----------
await page.reload()
await page.waitForSelector('.app')
ok('保存: リロード後も決定メモが残る', (await page.locator('.rnotes').first().innerText()).includes('E2E'))
await goto(page, '/projects/bmes/wbs')
ok('保存: リロード後も追加した作業が残る', (await page.locator('.wbs__title', { hasText: 'E2E 作業' }).count()) === 1)

process.exitCode = summary(errs) ? 1 : 0
await browser.close()
