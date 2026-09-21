import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = path.join(dirname, 'screenshots')

const email = `demo-organiser-${Date.now()}@example.com`
const pin = '1234'

const errors = []

async function shot(page, name) {
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`), fullPage: false })
  console.log('screenshot:', name)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } })
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  page.on('requestfailed', (req) => errors.push(`REQUEST_FAILED: ${req.url()} ${req.failure()?.errorText}`))

  try {
    await page.goto('http://localhost:5173/login')
    await page.waitForSelector('text=Courtside')
    await shot(page, '01-login')

    await page.getByRole('button', { name: 'Create account' }).click()
    await page.getByPlaceholder('Rhythm Mahajan').fill('Demo Organiser')
    await page.getByPlaceholder('you@club.com').fill(email)
    await page.getByPlaceholder('At least 4 characters').fill(pin)
    await page.getByRole('button', { name: 'Create organiser account' }).click()

    await page.waitForURL('**/organiser', { timeout: 15000 })
    await shot(page, '02-post-signup')
    await page.waitForSelector('text=Your tournaments', { timeout: 15000 })
    await shot(page, '02b-dashboard-empty')

    await page.getByRole('link', { name: /New tournament/ }).click()
    await page.waitForSelector('text=Create a tournament')
    await page.getByPlaceholder('City Open Badminton Championship 2026').fill('Riverside Badminton Open 2026')
    await shot(page, '03-create-step1')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForSelector('text=Average minutes per match')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.waitForSelector('text=Courts available')
    await shot(page, '04-create-step3')
    await page.getByRole('button', { name: 'Create tournament' }).click()

    await page.waitForURL('**/organiser/TOURN_*', { timeout: 15000 })
    await page.waitForSelector('text=Riverside Badminton Open 2026')
    await shot(page, '05-tournament-detail-empty')

    await page.getByRole('tab', { name: 'Roster' }).click()
    const names = ['Ava Chen', 'Marcus Diallo', 'Priya Nair', 'Tom Becker', 'Lena Kowalski', 'Sam Okafor']
    for (const name of names) {
      await page.getByRole('button', { name: 'Add player' }).click()
      await page.waitForSelector('text=Add a player')
      await page.getByPlaceholder('Player name').fill(name)
      await page.getByRole('button', { name: 'Add player' }).last().click()
      await page.waitForTimeout(400)
    }
    await shot(page, '06-roster-filled')

    await page.getByRole('button', { name: 'Finalize seeding' }).click()
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: 'Generate schedule' }).click()
    await page.waitForSelector('text=Generate court schedule')
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await page.waitForTimeout(3000)
    await shot(page, '07-after-schedule')

    await page.getByRole('tab', { name: 'Fixtures' }).click()
    await page.waitForTimeout(500)
    await shot(page, '08-fixtures-groups')

    await page.getByRole('tab', { name: 'Knockout' }).click()
    await page.waitForTimeout(500)
    await shot(page, '09-fixtures-knockout')

    console.log('SUCCESS')
  } catch (err) {
    console.error('DRIVER_FAILED:', err.message)
    await shot(page, 'FAILURE').catch(() => {})
    console.log('PAGE_URL:', page.url())
    const bodyText = await page.locator('body').innerText().catch(() => '<no body>')
    console.log('BODY_TEXT_SNIPPET:', bodyText.slice(0, 800))
  } finally {
    console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2))
    await browser.close()
  }
}

main()
