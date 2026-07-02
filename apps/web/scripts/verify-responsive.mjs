import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const targetUrl = process.argv[2] ?? process.env.CONTROLLER_URL ?? "http://localhost:5173/";
const outputDir = process.env.RESPONSIVE_OUTPUT_DIR ?? "/tmp/codex-remote-responsive";

const viewports = [
  { name: "320", width: 320, height: 720 },
  { name: "390", width: 390, height: 844 },
  { name: "480", width: 480, height: 900 },
];

mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];
const results = [];

function assertMetric(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

for (const viewport of viewports) {
  const page = await browser.newPage({ viewport });
  await page.goto(targetUrl, { waitUntil: "networkidle" });

  const metrics = await page.evaluate(() => {
    const rectOf = (selector) => {
      const element = document.querySelector(selector);
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    };

    return {
      htmlClientWidth: document.documentElement.clientWidth,
      htmlScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      frame: rectOf(".controller-frame"),
      statusBar: rectOf(".status-bar"),
      outputPanel: rectOf(".output-panel"),
      inputPanel: rectOf(".input-panel"),
      pairingPanel: rectOf(".pairing-panel"),
      composer: rectOf(".composer"),
      wheel: rectOf(".wheel-dots"),
    };
  });

  await page.screenshot({ path: `${outputDir}/${viewport.name}-default.png`, fullPage: false });

  const hasWheel = await page.locator(".wheel-dots").count() > 0;
  let popover = null;

  if (hasWheel) {
    await page.locator(".wheel-dots").click();
    popover = await page.evaluate(() => {
      const element = document.querySelector(".slash-popover");
      if (!element) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    });
  }

  await page.screenshot({ path: `${outputDir}/${viewport.name}-commands.png`, fullPage: false });
  await page.close();

  assertMetric(metrics.htmlScrollWidth <= viewport.width, `${viewport.name}: document has horizontal overflow`);
  assertMetric(metrics.bodyScrollWidth <= viewport.width, `${viewport.name}: body has horizontal overflow`);
  assertMetric(metrics.frame?.width <= Math.min(viewport.width, 480), `${viewport.name}: frame is wider than expected`);
  if (metrics.inputPanel) {
    assertMetric(metrics.inputPanel.bottom <= viewport.height + 1, `${viewport.name}: input panel extends below viewport`);
  }

  if (!hasWheel) {
    assertMetric(metrics.pairingPanel !== null, `${viewport.name}: pairing panel did not render`);
  }
  if (metrics.inputPanel && metrics.outputPanel) {
    assertMetric(metrics.outputPanel.bottom <= metrics.inputPanel.top + 1, `${viewport.name}: output panel overlaps input panel`);
  }

  if (metrics.composer) {
    assertMetric(metrics.composer.width >= 250 || viewport.width === 320, `${viewport.name}: composer is too narrow`);
  }

  if (hasWheel) {
    assertMetric(popover !== null, `${viewport.name}: command popover did not open`);
    assertMetric(popover?.left >= 0, `${viewport.name}: command popover overflows left edge`);
    assertMetric(popover?.right <= viewport.width, `${viewport.name}: command popover overflows right edge`);
    assertMetric(popover?.top >= 0, `${viewport.name}: command popover overflows top edge`);
    assertMetric(popover?.bottom <= viewport.height, `${viewport.name}: command popover overflows bottom edge`);
  }

  results.push({
    viewport: viewport.name,
    documentWidth: metrics.htmlScrollWidth,
    frameWidth: metrics.frame?.width,
    outputHeight: metrics.outputPanel?.height,
    inputHeight: metrics.inputPanel?.height,
    composerWidth: metrics.composer?.width,
    mode: hasWheel ? "controller" : "pairing",
    popover,
  });
}

await browser.close();

console.log(JSON.stringify({ targetUrl, outputDir, results }, null, 2));

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
