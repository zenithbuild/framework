import { chromium } from 'playwright';

const results = {
  paths: [],
  history: [],
  documentRequests: 0,
  consoleErrors: [],
  pageErrors: [],
  user42Rendered: null
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('request', (req) => {
  if (req.resourceType() === 'document') results.documentRequests += 1;
});
page.on('console', (msg) => {
  if (msg.type() === 'error') results.consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => {
  results.pageErrors.push(err.message);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

await page.goto('http://localhost:4000/', { waitUntil: 'networkidle' });
results.paths.push(await page.evaluate(() => location.pathname));
results.history.push(await page.evaluate(() => history.length));

await page.click('#link-about');
await sleep(250);
results.paths.push(await page.evaluate(() => location.pathname));
results.history.push(await page.evaluate(() => history.length));

await page.evaluate(() => history.back());
await sleep(250);
results.paths.push(await page.evaluate(() => location.pathname));
results.history.push(await page.evaluate(() => history.length));

await page.evaluate(() => history.forward());
await sleep(250);
results.paths.push(await page.evaluate(() => location.pathname));
results.history.push(await page.evaluate(() => history.length));

await page.click('#link-user');
await sleep(250);
results.paths.push(await page.evaluate(() => location.pathname));
results.history.push(await page.evaluate(() => history.length));
results.user42Rendered = await page.evaluate(() => (document.body.textContent || '').includes('42'));

await browser.close();
console.log(JSON.stringify(results, null, 2));
