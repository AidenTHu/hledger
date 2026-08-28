// Browser end-to-end tests for the hledger-web UI.
//
// Covers the core write flows (add a transaction, edit the journal) including
// after in-page (AJAX) navigation, and the client-side behaviors that server
// tests (Hledger/Web/Test.hs) cannot see because they never run javascript.
//
// Run with: npx playwright test  (see README.md)
const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Collect uncaught page errors in every test; individual tests assert on them.
let pageErrors;
test.beforeEach(({ page }) => {
  pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));
});

// Open the add-transaction modal via its keyboard shortcut and wait for it.
async function openAddForm(page) {
  await page.locator('body').press('a');
  await expect(page.locator('#addmodal')).toBeVisible();
}

test.describe('page initialization', () => {

  test('journal page loads without javascript errors', async ({ page }) => {
    await page.goto('/journal');
    await openAddForm(page);
    expect(pageErrors).toEqual([]);
  });

  // Register rows use bare-numeric ids (id="3"), and '#3' is not a valid CSS
  // selector, so any code passing location.hash to querySelector must guard it.
  // A broken startup here leaves the page half-initialized (no date picker,
  // no sidebar row handlers, no in-page navigation).
  test('register url with a transaction hash initializes fully', async ({ page }) => {
    await page.goto('/register?q=inacct:assets:bank:checking#3');
    // startup completed: the add form date field was upgraded to a date input
    await openAddForm(page);
    await expect(page.locator('#addform input[name=date]')).toHaveAttribute('type', 'date');
    // and today's date was prefilled
    await expect(page.locator('#addform input[name=date]')).not.toHaveValue('');
    expect(pageErrors).toEqual([]);
  });

});

test.describe('add form', () => {

  test('typing in the last amount field adds a posting row', async ({ page }) => {
    await page.goto('/journal');
    await openAddForm(page);
    await expect(page.locator('#addform .account-group')).toHaveCount(4);
    await page.locator('#addform input[name=amount]').last().press('5');
    await expect(page.locator('#addform .account-group')).toHaveCount(5);
    expect(pageErrors).toEqual([]);
  });

  test('account field autocompletes account names', async ({ page }) => {
    await page.goto('/journal');
    await openAddForm(page);
    await page.locator('#account-1').pressSequentially('che', { delay: 30 });
    // typeahead suggestions (or any visible replacement) should offer the account
    await expect(
      page.locator('.tt-suggestion, .tt-menu li, [role=listbox] [role=option]').first()
    ).toBeVisible({ timeout: 3000 });
  });

  test('adds a transaction (create)', async ({ page }) => {
    await page.goto('/journal');
    await openAddForm(page);
    await page.locator('#addform input[name=description]').fill('E2eCreatePlain');
    await page.locator('#account-1').fill('expenses:food:dining');
    await page.locator('#amount-1').fill('12.34');
    await page.locator('#account-2').fill('assets:bank:checking');
    await page.locator('#addform button[type=submit]').click();
    await expect(page.locator('#message')).toContainText('Transaction added.');
    expect(fs.readFileSync(process.env.E2E_JOURNAL, 'utf8')).toContain('E2eCreatePlain');
  });

  test('adds a transaction after in-page (ajax) navigation', async ({ page }) => {
    await page.goto('/journal');
    // navigate via a main-pane register link, and prove it was in-page:
    // a js marker survives ajax navigation but not a full page load
    await page.evaluate(() => { window.__e2eMarker = 'alive'; });
    await page.locator('#main-content .desktop-account a[title="expenses:food:groceries"]').first().click();
    await expect(page).toHaveURL(/register/);
    expect(await page.evaluate(() => window.__e2eMarker)).toBe('alive');
    // the swapped-in page's add form must still work end to end
    await openAddForm(page);
    await expect(page.locator('#addform input[name=date]')).not.toHaveValue('');
    await page.locator('#addform input[name=description]').fill('E2eCreateAfterAjax');
    await page.locator('#account-1').fill('expenses:food:dining');
    await page.locator('#amount-1').fill('5.67');
    await page.locator('#account-2').fill('assets:bank:checking');
    await page.locator('#addform button[type=submit]').click();
    await expect(page.locator('#message')).toContainText('Transaction added.');
    expect(fs.readFileSync(process.env.E2E_JOURNAL, 'utf8')).toContain('E2eCreateAfterAjax');
  });

});

test.describe('edit form', () => {

  test('edits the journal file (update) after in-page navigation', async ({ page }) => {
    await page.goto('/journal');
    await page.evaluate(() => { window.__e2eMarker = 'alive'; });
    await page.locator('#main-content .desktop-account a[title="expenses:food:groceries"]').first().click();
    await expect(page).toHaveURL(/register/);
    expect(await page.evaluate(() => window.__e2eMarker)).toBe('alive');
    await page.locator('a[title="Manage journal files"]').click();
    await page.locator('a.btn', { hasText: 'Edit' }).first().click();
    const ta = page.locator('textarea');
    const text = await ta.inputValue();
    expect(text).toContain('Metro Transit');
    await ta.fill(text.replace('Metro Transit', 'Metro Transit EDITED'));
    await page.locator('input[type=submit][value=Save]').click();
    await expect(page.locator('#message')).toContainText('Saved journal');
    expect(fs.readFileSync(process.env.E2E_JOURNAL, 'utf8')).toContain('Metro Transit EDITED');
  });

});

test.describe('search', () => {

  test('accepts documented query syntax containing slashes', async ({ page }) => {
    await page.goto('/journal');
    let dialogMessage = null;
    page.on('dialog', d => { dialogMessage = d.message(); d.dismiss().catch(() => {}); });
    await page.locator('#searchform input[name=q]').fill('date:2025/1/5');
    await page.locator('#searchform input[name=q]').press('Enter');
    await expect(page).toHaveURL(/date%3A2025/);
    expect(dialogMessage).toBeNull();
    // the filter was applied: only the matching transaction remains
    await expect(page.locator('#main-content')).toContainText('weekly shop');
    await expect(page.locator('#main-content')).not.toContainText('Cafe Luna');
  });

});

test.describe('in-page (ajax) navigation', () => {

  test('sidebar account links navigate in-page, preserving sidebar state', async ({ page }) => {
    await page.goto('/journal');
    await page.evaluate(() => { window.__e2eMarker = 'alive'; });
    await page.locator('#sidebar-menu a.acct-name[data-account-name="expenses:food:groceries"]').click();
    await expect(page).toHaveURL(/register/);
    expect(await page.evaluate(() => window.__e2eMarker)).toBe('alive');
  });

  test('navigating to a transaction link scrolls it into view', async ({ page }) => {
    // small viewport so the register page must actually scroll
    await page.setViewportSize({ width: 1200, height: 350 });
    await page.goto('/journal');
    // newest checking posting links to the last row of the checking register
    const link = page.locator('#main-content .desktop-account a[title="assets:bank:checking"]').first();
    const hash = (await link.getAttribute('href')).split('#')[1];
    await link.click();
    await expect(page).toHaveURL(/register/);
    const inView = await page.evaluate(id => {
      const el = document.getElementById(id);
      if (!el) return 'target not found';
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    }, hash);
    expect(inView).toBe(true);
  });

  test('browser back returns to the previous view', async ({ page }) => {
    await page.goto('/journal');
    await page.locator('#main-content .desktop-account a[title="expenses:food:groceries"]').first().click();
    await expect(page).toHaveURL(/register/);
    await page.goBack();
    await expect(page).toHaveURL(/journal/);
    await expect(page.locator('#main-content .transactionsreport')).toBeVisible();
  });

});
