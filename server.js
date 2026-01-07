import express from "express";
import { chromium } from "playwright";

const app = express();
app.use(express.json({ limit: "1mb" }));

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

async function tryAcceptCookies(page) {
  const selectors = [
    'button:has-text("Accept All")',
    'button:has-text("Accept all")',
    'button:has-text("Accept")',
    'button:has-text("I agree")',
    'button:has-text("Agree")',
    'button:has-text("Got it")',
    '[aria-label*="accept" i]'
  ];

  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) {
        await loc.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(800);
        return true;
      }
    } catch {}
  }
  return false;
}

app.get("/health", (_, res) => res.send("ok"));

app.post("/render", async (req, res) => {
  const { url, waitMs = 5000, timeoutMs = 25000, tryAcceptCookies: doConsent = true } = req.body || {};
  if (!url) return res.status(400).json({ error: "Missing url" });

  const browser = await chromium.launch({
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    userAgent: UA,
    locale: "en-US",
    viewport: { width: 1365, height: 768 },
  });

  const page = await context.newPage();

  const requests = [];
  page.on("request", (r) => requests.push(r.url()));

  let finalUrl = url;
  let status = null;

  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    status = resp?.status() ?? null;
    finalUrl = page.url();

    await page.waitForTimeout(1500);

    if (doConsent) {
      await tryAcceptCookies(page);
      await page.waitForTimeout(1500);
    }

    await page.waitForTimeout(waitMs);

    const html = await page.content();

    await browser.close();

    return res.json({
      finalUrl,
      status,
      html,
      requests: Array.from(new Set(requests)).slice(0, 5000),
    });
  } catch (e) {
    await browser.close();
    return res.json({
      finalUrl,
      status,
      html: "",
      requests: Array.from(new Set(requests)).slice(0, 5000),
      error: String(e?.message || e),
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Renderer listening on ${port}`));
