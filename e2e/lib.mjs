// E2E 用の共通ヘルパー。Playwright は別途インストールしてください（npm i -D playwright / npx playwright install chromium）。
// 使い方: 開発サーバーを起動（npm run dev）した状態で  node e2e/p0.mjs  /  node e2e/p1.mjs
// BASE=http://localhost:5173  CHROMIUM_PATH=/path/to/chromium で上書きできます。
import fs from 'node:fs'
import { createRequire } from 'node:module'

let chromium
try {
  ;({ chromium } = await import('playwright'))
} catch {
  ;({ chromium } = createRequire('/opt/node-tools/node_modules/')('playwright'))
}

export const BASE = process.env.BASE || 'http://localhost:5173'
const exe = process.env.CHROMIUM_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => fs.existsSync(p))
const results = []

export const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '   <- ' + extra}`)
}

export async function launch(opts = {}) {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {})
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message))
  await page.goto(BASE + '/')
  await page.evaluate(() => localStorage.clear())
  await page.goto(BASE + '/')
  await page.waitForSelector('.app', { timeout: 10000 })
  return { browser, ctx, page, errs }
}

export const goto = async (page, path) => {
  await page.goto(BASE + path)
  await page.waitForSelector('.app', { timeout: 10000 })
  await page.waitForTimeout(250)
}

export const num = (s) => parseFloat(String(s).replace(/[^\d.\-+]/g, ''))

/** プロジェクトヘッダーの集計値（進捗・計画・実績・残り・見込み・差異）を数値で読む */
export const stat = async (page, label) =>
  num(await page.locator('.phead__stats > div', { has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) }).locator('dd').innerText())

export const switchUser = async (page, name) => {
  await page.getByRole('button', { name: 'ユーザー切替' }).click()
  await page.locator('.menu__item', { hasText: name }).click()
  await page.waitForTimeout(250)
}

export const summary = (errs) => {
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed; console errors: ${errs.length}`)
  if (errs.length) console.log(errs.slice(0, 10).join('\n'))
  return failed.length + errs.length
}
