import { expect, test, type Page } from '@playwright/test'

const ownerAKey = process.env.RAGPROOF_E2E_KEY_A ?? ''
const ownerBKey = process.env.RAGPROOF_E2E_KEY_B ?? ''

// API Key 只存在内存：整页加载后需要重新连接，页面内导航保持登录
async function connect(page: Page, apiKey: string): Promise<void> {
  await page.goto('/system')
  await page.getByTestId('api-key-input').fill(apiKey)
  await page.getByTestId('connect-button').click()
  await expect(page.getByTestId('connection-owner')).toBeVisible()
}

async function openRunsViaNav(page: Page): Promise<void> {
  await page.getByTestId('nav-runs').click()
  await expect(page.getByTestId('run-question-input')).toBeVisible()
}

test.describe('D1 应用壳、连接检查与持久化请求', () => {
  test.skip(ownerAKey.length === 0, '需要 RAGPROOF_E2E_KEY_A 指向服务端配置的应用 API Key')

  test('/system 显示 owner、readiness、四角色配置与真实检查结果', async ({ page }) => {
    await page.goto('/system')
    await expect(page.getByTestId('auth-panel')).toBeVisible()
    await page.getByTestId('api-key-input').fill('invalid-demo-key')
    await page.getByTestId('connect-button').click()
    await expect(page.getByTestId('connect-error-code')).toHaveText(
      'AUTHENTICATION_REQUIRED · HTTP 401',
    )

    await connect(page, ownerAKey)
    await expect(page.getByTestId('connection-owner')).toContainText('owner')

    await expect(page.getByTestId('health-status')).toHaveText('ok')
    await expect(page.getByTestId('ready-database')).toHaveText('ready')

    await expect(page.getByTestId('model-role-fast')).toBeVisible()
    await expect(page.getByTestId('model-role-grader')).toBeVisible()
    await expect(page.getByTestId('model-role-answer')).toBeVisible()
    await expect(page.getByTestId('model-role-evaluator')).toBeVisible()
    await expect(page.getByTestId('model-role-embedding')).toBeVisible()

    await page.getByTestId('model-check-button').click()
    // 结果只来自服务端落库的检查记录：成功或失败都如实呈现，冷却期同样显示真实 429
    await expect(page.getByTestId('model-check-table')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('check-item-fast')).toBeVisible()
    await expect(page.getByTestId('check-item-grader')).toBeVisible()
    await expect(page.getByTestId('check-item-answer')).toBeVisible()
    await expect(page.getByTestId('check-item-evaluator')).toBeVisible()
    await expect(page.getByTestId('check-item-embedding')).toBeVisible()
    await expect(page.getByTestId('check-status-badge')).toHaveText(/succeeded|failed/)
    await expect(page.getByTestId('model-check-error-code')).toHaveText(
      /PROVIDER_CHECK_FAILED · HTTP 503|PROVIDER_CAPABILITY_MISMATCH · HTTP 502|MODEL_CHECK_RATE_LIMITED · HTTP 429/,
    )
  })

  test('登记请求、事件序列与刷新后回到原资源', async ({ page }) => {
    await connect(page, ownerAKey)
    await openRunsViaNav(page)

    const question = `D1 浏览器验收问题 ${Date.now()}`
    await page.getByTestId('run-question-input').fill(question)
    await page.getByTestId('register-run-button').click()
    await expect(
      page.locator('[data-testid="register-result"]', { hasText: '已创建新 Run' }),
    ).toBeVisible()

    const row = page.locator('[data-testid="run-row"]', { hasText: question }).first()
    const runId = await row.getAttribute('data-run-id')
    expect(runId).toMatch(/^run_[0-9a-f]{32}$/)
    await expect(row.locator('[data-testid="run-status-badge"]')).toHaveText('queued')

    await row.click()
    await expect(page.getByTestId('detail-run-id')).toHaveText(runId ?? '')
    await expect(page.getByTestId('detail-question')).toHaveText(question)
    await expect(page.getByTestId('event-row-1')).toContainText('run.created')
    await expect(page.getByTestId('event-sequence-1')).toHaveText('1')
    await expect(page.getByTestId('snapshot-role-fast')).toBeVisible()
    await expect(page.getByTestId('snapshot-role-embedding')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('auth-panel')).toBeVisible()
    expect(page.url()).toContain(`/runs/${runId}`)
    await page.getByTestId('api-key-input').fill(ownerAKey)
    await page.getByTestId('connect-button').click()
    await expect(page.getByTestId('detail-run-id')).toHaveText(runId ?? '')
    expect(page.url()).toContain(`/runs/${runId}`)
  })

  test('幂等键复用、轮换与服务端 422', async ({ page }) => {
    await connect(page, ownerAKey)
    await openRunsViaNav(page)

    const question = `D1 幂等验收问题 ${Date.now()}`
    await page.getByTestId('run-question-input').fill(question)
    const firstKey = await page.getByTestId('idempotency-key').innerText()

    await page.getByTestId('register-run-button').click()
    await expect(
      page.locator('[data-testid="register-result"]', { hasText: '已创建新 Run' }),
    ).toBeVisible()

    await page.getByTestId('register-run-button').click()
    await expect(
      page.locator('[data-testid="register-result"]', { hasText: '幂等命中，返回原 Run' }),
    ).toBeVisible()
    expect(await page.getByTestId('idempotency-key').innerText()).toBe(firstKey)
    await expect(
      page.locator('[data-testid="run-row"]', { hasText: question }),
    ).toHaveCount(1)

    await page.getByTestId('run-question-input').fill(`${question} 变体`)
    expect(await page.getByTestId('idempotency-key').innerText()).not.toBe(firstKey)

    await page.getByTestId('run-question-input').fill('度'.repeat(4001))
    await page.getByTestId('register-run-button').click()
    await expect(page.getByTestId('register-error-code')).toHaveText('INVALID_REQUEST · HTTP 422')
    await expect(page.getByTestId('register-error-fields')).toContainText('body.question')
  })

  test('切换账号清空数据且跨 owner 读取 404', async ({ page }) => {
    test.skip(ownerBKey.length === 0, '需要 RAGPROOF_E2E_KEY_B 验证跨账号隔离')

    await connect(page, ownerAKey)
    await openRunsViaNav(page)
    const question = `D1 跨账号验收问题 ${Date.now()}`
    await page.getByTestId('run-question-input').fill(question)
    await page.getByTestId('register-run-button').click()
    await expect(page.getByTestId('register-result')).toBeVisible()
    const runId = await page
      .locator('[data-testid="run-row"]', { hasText: question })
      .first()
      .getAttribute('data-run-id')

    await page.getByTestId('disconnect-button').click()
    await expect(page.getByTestId('auth-panel')).toBeVisible()
    await expect(page.locator('[data-testid="run-row"]')).toHaveCount(0)

    await connect(page, ownerBKey)
    await openRunsViaNav(page)
    await expect(
      page.locator('[data-testid="run-row"]', { hasText: question }),
    ).toHaveCount(0)

    await page.goto(`/runs/${runId}`)
    await expect(page.getByTestId('auth-panel')).toBeVisible()
    await page.getByTestId('api-key-input').fill(ownerBKey)
    await page.getByTestId('connect-button').click()
    await expect(page.getByTestId('run-detail-error-code')).toHaveText('NOT_FOUND · HTTP 404')
  })
})
