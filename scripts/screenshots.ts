/**
 * Captures the screenshots used in the project documentation.
 *
 * Run the dev server first, then: npm run screenshots
 * Files land in ./screenshots.
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.SCREENSHOT_BASE ?? "http://localhost:3000";
const OUT = "screenshots";

/** Desktop captures. Each is a figure in the documentation. */
const PAGES: {
  name: string;
  path: string;
  caption: string;
  /** Click here before capturing, to open a city panel. */
  click?: { x: number; y: number };
  /** Theme group to expand before looking for `metric`. */
  theme?: string;
  metric?: string;
}[] = [
  { name: "01-map", path: "/en", caption: "The map is the application: 66 cities, one measure at a time" },
  {
    name: "02-city-panel",
    path: "/en",
    caption: "Selecting a city opens a panel over the map rather than a new page",
    click: { x: 984, y: 400 },
  },
  { name: "03-map-affordability", path: "/en", theme: "Housing", metric: "Months of salary per m²", caption: "The same country, measured by how many months of local salary a square metre costs" },
  { name: "04-map-air", path: "/en", theme: "Environment", metric: "Air quality index", caption: "Air quality, averaged across each city's GIOŚ stations" },
  { name: "05-city-page", path: "/en/city/krakow", caption: "The full city profile, for linking and printing" },
  { name: "06-city-indicators", path: "/en/city/krakow", caption: "Indicator rows with rank gauge, deviation from the median and ten years of history" },
  { name: "07-warsaw-districts", path: "/en/city/warszawa", caption: "Warsaw district breakdown, with unpublished indicators named" },
  { name: "08-compare", path: "/en/compare", caption: "Weighted comparison with per-theme contributions" },
  { name: "09-about", path: "/en/about", caption: "Sources, method and limits" },
  { name: "10-cache", path: "/admin/cache", caption: "Response cache inspector" },
];

/** Sections captured on their own rather than as a full page. */
const CLIPS: Record<string, string> = {
  "06-city-indicators": "Earnings & economy",
  "07-warsaw-districts": "Districts of Warszawa",
};

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    // Wide enough for the control panel, the country and the detail panel to
    // sit side by side, which is the layout the application is designed around.
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
  });

  for (const { name, path, caption, click, metric, theme } of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    // The map animates in; wait for it to settle before capturing.
    await page.waitForTimeout(3500);

    if (theme) {
      // Only the theme holding the current measure is expanded, so the group
      // has to be opened before its measures exist in the DOM.
      await page.getByRole("button", { name: theme, exact: true }).click();
      await page.waitForTimeout(350);
    }
    if (metric) {
      await page.getByRole("button", { name: metric, exact: true }).click();
      await page.waitForTimeout(1500);
    }
    if (click) {
      await page.mouse.click(click.x, click.y);
      await page.waitForTimeout(1800);
    }

    const heading = CLIPS[name];
    if (heading) {
      const section = page.locator("section", { hasText: heading }).first();
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const box = await section.boundingBox();
      await page.screenshot({ path: `${OUT}/${name}.png`, clip: box ?? undefined });
    } else {
      await page.screenshot({ path: `${OUT}/${name}.png` });
    }
    console.log(`${name}.png — ${caption}`);
  }

  // Phone width, to show the layout holds.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/11-mobile.png` });
  console.log("11-mobile.png — the map fills a phone, controls become a sheet");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
