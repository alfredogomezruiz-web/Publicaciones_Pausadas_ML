const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.status(200).send("Servidor activo");
});

app.get("/health/mercadolibre", async (req, res) => {
  let browser;

  try {
    const TARGET_URL =
      process.env.ML_TARGET_URL ||
      "https://www.mercadolibre.com.mx/publicaciones/lista";

    browser = await chromium.launch({
      headless: true
    });

    const page = await browser.newPage();

    await page.goto(TARGET_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });

    await page.waitForTimeout(5000);

    const bodyText = await page.locator("body").innerText();

    const pausedMatches = bodyText.match(/Pausada/g) || [];
    const pausedCount = pausedMatches.length;

    await browser.close();

    if (pausedCount > 0) {
      return res.status(500).json({
        ok: false,
        pausedCount,
        message: "Hay publicaciones pausadas"
      });
    }

    return res.status(200).json({
      ok: true,
      pausedCount: 0,
      message: "No hay publicaciones pausadas"
    });
  } catch (error) {
    if (browser) {
      await browser.close();
    }

    return res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
