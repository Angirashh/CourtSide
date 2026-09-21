import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = path.join(dirname, 'screenshots')
const email = `op-demo-organiser-${Date.now()}@example.com`
const opEmail = `op-demo-operator-${Date.now()}@example.com`
const errors = []

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotsDir, name) })
  console.log('screenshot:', name)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } })
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()))
  page.on('pageerror', (err) => errors.push(String(err)))

  try {
    // --- Organiser: sign up, create tournament, add players, schedule ---
    await page.goto('http://localhost:5173/login')
    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByPlaceholder('Rhythm Mahajan').fill('Op Demo Organiser')
    await page.getByPlaceholder('you@club.com').fill(email)
    await page.getByPlaceholder('At least 4 characters').fill('1234')
    await page.getByRole('button', { name: 'Create organiser account' }).click()
    await page.waitForURL('**/organiser', { timeout: 15000 })

    await page.getByRole('link', { name: /New tournament/ }).click()
    await page.getByPlaceholder('City Open Badminton Championship 2026').fill('Operator Flow Test Cup')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Create tournament' }).click()
    await page.waitForURL('**/organiser/TOURN_*', { timeout: 15000 })
    const tournamentUrl = page.url()
    const tournamentId = tournamentUrl.split('/').pop()

    await page.getByRole('tab', { name: 'Roster' }).click()
    for (const name of ['Alex Rivera', 'Jordan Blake', 'Casey Fox', 'Riley Storm']) {
      await page.getByRole('button', { name: 'Add player' }).click()
      await page.getByPlaceholder('Player name').fill(name)
      await page.getByRole('button', { name: 'Add player' }).last().click()
      await page.waitForTimeout(300)
    }
    await page.getByRole('button', { name: 'Finalize seeding' }).click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Generate schedule' }).click()
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForTimeout(2000)

    // --- Invite operator ---
    await page.getByRole('tab', { name: 'Operators' }).click()
    await page.getByRole('button', { name: 'Invite operator' }).click()
    await page.getByPlaceholder('Operator name').fill('Court Op One')
    await page.getByPlaceholder('operator@example.com').fill(opEmail)
    await page.getByRole('button', { name: 'Generate invite' }).click()
    await page.waitForTimeout(500)
    await shot(page, '10-operator-invited.png')

    const codeText = await page.locator('button.font-mono').first().innerText()
    const inviteCode = codeText.trim().replace(/[^0-9]/g, '')
    console.log('Captured invite code:', inviteCode, 'tournamentId:', tournamentId)

    // --- Log out, log in as operator ---
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL('**/login', { timeout: 10000 })
    await page.getByRole('button', { name: 'Court Operator' }).click()
    await page.getByPlaceholder('you@example.com').fill(opEmail)
    await page.getByPlaceholder('TOURN_xxxxxxxx').fill(tournamentId)
    await page.getByPlaceholder('••••••').fill(inviteCode)
    await page.getByRole('button', { name: 'Log in to score matches' }).click()

    await page.waitForURL('**/operator', { timeout: 15000 })
    await page.waitForSelector('text=Operator Flow Test Cup')
    await shot(page, '11-operator-matches.png')

    // --- Start + score a match ---
    await page.getByRole('tab', { name: /Upcoming/ }).click()
    await page.waitForTimeout(500)
    await shot(page, '12-operator-upcoming.png')

    const startBtn = page.getByRole('button', { name: 'Start match' }).first()
    if (await startBtn.count()) {
      await startBtn.click()
      await page.waitForTimeout(600)
      await shot(page, '13-operator-started.png')
    }

    await page.getByRole('button', { name: 'Submit score' }).first().click()
    await page.waitForSelector('text=Submit score')
    await page.waitForTimeout(500)
    await shot(page, '14-score-dialog.png')
    const winnerOptions = page.locator('button').filter({ hasText: /Alex Rivera|Jordan Blake|Casey Fox|Riley Storm/ })
    await winnerOptions.first().click()
    await page.getByRole('button', { name: 'Confirm result' }).click()
    await page.waitForTimeout(1000)
    await shot(page, '15-after-score.png')

    console.log('SUCCESS')
  } catch (err) {
    console.error('DRIVER_FAILED:', err.message)
    await shot(page, 'FAILURE-operator.png').catch(() => {})
    console.log('URL:', page.url())
    console.log('BODY:', (await page.locator('body').innerText().catch(() => '')).slice(0, 800))
  } finally {
    console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2))
    await browser.close()
  }
}

main()
