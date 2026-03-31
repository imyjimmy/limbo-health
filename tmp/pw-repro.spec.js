const { test } = require('@playwright/test');

test('load console', async ({ page }) => {
  await page.goto('http://localhost:3020/internal/console');
});
