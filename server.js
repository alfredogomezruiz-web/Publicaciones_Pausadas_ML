const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const TARGET_URL =
  process.env.ML_TARGET_URL ||
  "https://www.mercadolibre.com.mx/publicaciones/lista";

function getStorageStatePath() {
  const localPath = path.join(__dirname, "storage.json");

  if (fs.existsSync(localPath)) {
    return localPath;
  }

  const storageFromEnv = process.env.ML_STORAGE_STATE;

  if (!storageFromEnv) {
    return null;
  }

  const tempPath = path.join("/tmp", "ml-storage.json");
  fs.writeFileSync(tempPath, storageFromEnv, "utf8");
  return tempPath;
}

async function detectPausedCount(page) {
  await page.goto(TARGET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(7000);

  const pageText = await page.locator("body").innerText();

  if (
    pageText.includes("Ingresa") ||
    pageText.includes("Iniciar sesion") ||
    pageText.includes("Inicia sesion") ||
    (pageText.includes("Tu cuenta") && !pageText.includes("Gestion de publicaciones"))
  ) {
    throw new Error("La sesion no es valida o Mercado Libre pidio iniciar sesion otra vez");
  }

  const pausedMatches = pageText.match(/Pausada/g) || [];
  return pausedMatches.length;
}

app.get("/", (req, res) => {
  res.status(200).send("Servidor activo");
});

app.get("/health/mercadolibre", async (req, res) => {
  let browser;

  try {
    const storageStatePath = getStorageStatePath();

    if (!storageStatePath) {
      return res.status(500).json({
        ok: false,
        message: "Falta storage.json o la variable ML_STORAGE_STATE"
      });
    }

    browser = await chromium.launch({
      headless: true
    });

    const context = await browser.newContext({
      storageState: storageStatePath
    });

    const page = await context.newPage();
    const pausedCount = await detectPausedCount(page);

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
