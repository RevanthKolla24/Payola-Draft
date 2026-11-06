// Exercise real navigation before interacting with controls on another page.
export async function visitControl(page, selector) {
  if (!await page.locator(selector).count()) return;
  const path = await page.locator(selector).first().evaluate(el => el.closest('[data-page]')?.dataset.page);
  if (!path || new URL(page.url()).pathname === path) return;
  const link = path === '/' ? page.locator('header .brand') : page.locator(`nav a[href="${path}"]`);
  await link.click();
  await page.waitForFunction(path => document.body.dataset.currentPage === path, path);
}