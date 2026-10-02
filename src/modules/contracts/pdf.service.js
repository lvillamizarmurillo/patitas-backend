// puppeteer-core 25 es un paquete ESM, así que se carga con import() dinámico (Node 22 lo soporta de forma
// nativa; Jest necesita --experimental-vm-modules, ya incluido en `npm test`). Se carga solo al generar
// el primer PDF, no al arrancar la API, para no ocupar memoria si nunca se usa.
let browserPromise;
const getBrowser = () =>
  (browserPromise ??= import('puppeteer-core').then(({ default: puppeteer }) => puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })));

exports.htmlToPdf = async (html) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
};

// Cierra Chromium si se llegó a abrir (graceful shutdown y tests)
exports.close = async () => {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = undefined;
  await pending.then((b) => b.close()).catch(() => {});
};
