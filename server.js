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

async function openMercadoLibrePage(context) {
  const page = await context.newPage();

  await page.goto(TARGET_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(8000);

  return page;
}

function looksLikeLoggedOut(text) {
  return (
    text.includes("Iniciar sesion") ||
    text.includes("Inicia sesion") ||
    text.includes("Ingresa") ||
    text.includes("Crear cuenta")
  );
}

async function getPageDiagnostics(page) {
  const title = await page.title();
  const url = page.url();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const bodyHtml = await page.locator("body").innerHTML().catch(() => "");

  const pausedTextCount = (bodyText.match(/Pausada/g) || []).length;
  const pausedHtmlCount = (bodyHtml.match(/Pausada/g) || []).length;

  const hasGestion =
    bodyText.includes("Gestion de publicaciones") ||
    bodyHtml.includes("Gestion de publicaciones");

  const hasModificarMasivo =
    bodyText.includes("Modificar en Editor masivo") ||
    bodyHtml.includes("Modificar en Editor masivo");

  const hasNecesitoAyuda =
    bodyText.includes("Necesito ayuda") ||
    bodyHtml.includes("Necesito ayuda");

  return {
    title,
    url,
    pausedTextCount,
    pausedHtmlCount,
    hasGestion,
    hasModificarMasivo,
    hasNecesitoAyuda,
    bodyPreview: bodyText.slice(0, 2000)
  };
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

    const page = await openMercadoLibrePage(context);
    const diagnostics = await getPageDiagnostics(page);

    await browser.close();

    if (looksLikeLoggedOut(diagnostics.bodyPreview)) {
      return res.status(500).json({
        ok: false,
        message: "La sesion no es valida o Mercado Libre pidio iniciar sesion otra vez",
        diagnostics
      });
    }

    const pausedCount = Math.max(
      diagnostics.pausedTextCount,
      diagnostics.pausedHtmlCount
    );

    if (pausedCount > 0) {
      return res.status(500).json({
        ok: false,
        pausedCount,
        message: "Hay publicaciones pausadas",
        diagnostics
      });
    }

    return res.status(200).json({
      ok: true,
      pausedCount: 0,
      message: "No hay publicaciones pausadas",
      diagnostics
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

app.get("/debug/mercadolibre", async (req, res) => {
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

    const page = await openMercadoLibrePage(context);
    const diagnostics = await getPageDiagnostics(page);

    await browser.close();

    return res.status(200).json({
      ok: true,
      diagnostics
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
