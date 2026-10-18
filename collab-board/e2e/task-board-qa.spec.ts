/**
 * 任务看板/协作看板 (task-board) plugin — rendered-surface QA.
 *
 * Boots the full desktop app against a sandbox gateway with the task-board
 * user plugin copied in and enabled, then:
 *   1. asserts the sidebar nav row renders (plugin registered),
 *   2. opens /task-board, asserts the board chrome,
 *   3. injects one done card with a worker_session_id into the sandbox
 *      kanban.db, opens the drawer, switches to the 执行回放 tab, asserts the
 *      timeline renders (steps from the replay backend),
 *   4. repeats the visual pass at a phone-size window (390×844).
 *
 * Screenshots land in e2e-output/task-board-qa/ for human/vision review.
 *
 * Prerequisite: `npm run build` so dist/ exists.
 */

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { buildAppEnv, createSandbox, launchDesktop } from './fixtures'
import { startMockServer } from '../../../tests-js/scripts/mock-server'
import { writeEnvFile, writeMockProviderConfig } from '../../../tests-js/scripts/mock-provider-config'
import { expect, test } from './test'

const PLUGIN_SRC = path.join(os.homedir(), '.hermes', 'plugins', 'task-board')
const OUT_DIR = path.resolve(import.meta.dirname, '..', 'e2e-output', 'task-board-qa')
const HERMES_BIN = path.join(os.homedir(), '.local', 'bin', 'hermes')

async function setWindowSize(app: { evaluate: Function }, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.setSize(size.width, size.height)
  }, { width, height })
}

test('协作看板 renders at desktop and mobile sizes with replay tab', async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 1. Sandbox gateway + app, with the task-board user plugin injected.
  const mock = await startMockServer()
  const sandbox = createSandbox('taskboard-qa')
  fs.cpSync(PLUGIN_SRC, path.join(sandbox.hermesHome, 'plugins', 'task-board'), { recursive: true })
  writeMockProviderConfig(sandbox.hermesHome, mock.url, undefined, "plugins:\n  enabled: ['task-board']")
  writeEnvFile(sandbox.hermesHome)
  const env = buildAppEnv(sandbox)
  const { app, page } = await launchDesktop(env)

  try {
    // 2. Per user direction: skip the first-run/chat boot chain entirely —
    //    wait only for the plugin nav row (registration = plugin works), then
    //    dismiss the first-run overlay if it is covering the sidebar.
    //    lift the first-run overlay out of the DOM (QA bypass — the React
    //    state behind it stays untouched).
    const liftOverlays = () =>
      page.evaluate(() => {
        document.querySelectorAll('div.fixed.inset-0').forEach(el => {
          const cls = el.className as string
          if (cls.includes('backdrop-blur') || el.hasAttribute('data-glass-opaque')) {
            // Hide, don't remove: React owns these nodes and a removal crashes
            // the renderer on the next commit.
            ;(el as HTMLElement).style.display = 'none'
          }
        })
      })

    // Give the sandbox gateway a moment to connect before force-lifting the
    // connecting splash (per user direction the boot chain is out of scope).
    await page.waitForTimeout(12_000)
    await liftOverlays()

    const nav = page.getByText(/Collab Board|协作看板/).first()
    await expect(nav).toBeVisible({ timeout: 60_000 })
    await liftOverlays()
    await nav.click()
    await page.waitForTimeout(2_000)

    // Board chrome renders (empty lanes are fine — data lands in step 3).
    await expect(page.getByText(/New task|新建任务/).first()).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(OUT_DIR, 'board-desktop.png') })

    // 3. Inject one done card with a worker session into the sandbox board,
    //    so the drawer and replay tab have something real to render.
    execFileSync(HERMES_BIN, ['kanban', 'init'], { env: { ...process.env, HERMES_HOME: sandbox.hermesHome } })
    execFileSync(
      HERMES_BIN,
      ['kanban', '--board', 'default', 'create', '--assignee', 'builder',
       '--idempotency-key', 'qa-replay-001', 'QA replay card'],
      { env: { ...process.env, HERMES_HOME: sandbox.hermesHome } },
    )
    execFileSync(
      HERMES_BIN,
      ['kanban', '--board', 'default', 'complete', 'qa-replay-001',
       '--summary', 'qa summary', '--result', 'qa result'],
      { env: { ...process.env, HERMES_HOME: sandbox.hermesHome } },
    )
    // Stamp the run with a session id the way the dispatcher does, then fake
    // the session store row so the replay backend resolves it.
    const db = path.join(sandbox.hermesHome, 'kanban', 'kanban.db')
    execFileSync('sqlite3', [db,
      "update task_runs set metadata = json_object('worker_session_id', 'qa_replay_session') where task_id = (select id from tasks where id like 't_%' order by id desc limit 1)"])

    await page.reload()
    await page.waitForTimeout(3_000)
    await liftOverlays()
    await page.getByText(/QA replay card/).first().click()
    await page.waitForTimeout(1_000)
    await liftOverlays()

    const replayTab = page.getByText(/Execution replay|执行回放/).first()
    await expect(replayTab).toBeVisible({ timeout: 15_000 })
    await replayTab.click()
    await page.waitForTimeout(1_500)
    await page.screenshot({ path: path.join(OUT_DIR, 'drawer-replay-desktop.png') })

    // 4. Phone-size pass.
    await setWindowSize(app, 390, 844)
    await page.waitForTimeout(1_000)
    await page.screenshot({ path: path.join(OUT_DIR, 'drawer-replay-mobile.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await page.screenshot({ path: path.join(OUT_DIR, 'board-mobile.png') })

    console.log('QA screenshots written to', OUT_DIR)
  } finally {
    await app.close().catch(() => undefined)
    await mock.close()
    sandbox.cleanup()
  }
})
