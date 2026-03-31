const { test, expect } = require('@playwright/test');

test('pdf editor is standalone', async ({ page }) => {
  await page.goto('http://localhost:3020/internal/console');
  await page.waitForSelector('#state-select');
  await page.selectOption('#state-select', 'TX');
  await page.waitForTimeout(1800);
  await page.click('#pipeline-tab');
  await page.waitForSelector('#pipeline-system-select');
  const bswhValue = await page.$eval('#pipeline-system-select', (select) => {
    const option = Array.from(select.options).find((entry) => entry.textContent.includes('Baylor Scott & White Health'));
    return option ? option.value : '';
  });
  expect(bswhValue).not.toBe('');
  await page.selectOption('#pipeline-system-select', bswhValue);
  await page.waitForTimeout(1500);
  await page.click('#pipeline-results-tab');
  await page.waitForTimeout(1500);
  await page.locator('button:has-text("Open Mapping Editor")').first().click();
  await page.waitForSelector('#pdf-editor-panel:not(.hidden)');
  await page.waitForTimeout(1200);

  const result = {
    breadcrumb: await page.locator('#state-breadcrumb').textContent(),
    title: await page.locator('#state-title').textContent(),
    tabSwitcherVisible: await page.locator('#state-tab-switcher').isVisible(),
    pipelinePanelVisible: await page.locator('#pipeline-panel').isVisible(),
    editorPanelVisible: await page.locator('#editor-panel').isVisible(),
    backToResultsVisible: await page.locator('#back-to-results').isVisible(),
    metricsText: (await page.locator('#pdf-editor-metrics').textContent()).replace(/\s+/g, ' ').trim(),
  };
  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: '/tmp/pdf-editor-workspace.png', fullPage: true });
  await expect(page.locator('#state-tab-switcher')).toBeHidden();
  await expect(page.locator('#pipeline-panel')).toBeHidden();
  await expect(page.locator('#editor-panel')).toBeVisible();
  await expect(page.locator('#back-to-results')).toBeVisible();
});
