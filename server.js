const express = require("express");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const START_URL =
  "https://www.mercadolibre.com.mx/publicaciones/listado";

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

function looksLikeLoggedOut(text) {
  return (
    text.includes("Iniciar sesion") ||
    text.includes("Inicia sesion") ||
    text.includes("Ingresa") ||
    text.includes("Crear cuenta")
  );
}

function looksLikeErrorPage(text) {
  return (
    text.includes("Hubo un error accediendo a esta pagina") ||
    text.includes("Hubo un error accediendo a esta página") ||
    text.includes("Ir a la pagina principal") ||
    text.includes("Ir a la página principal")
  );
}

async function clickByText(page, text, timeout = 10000) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout });
  await locator.click();
}

async function tryClickByText(page, text, timeout = 5000) {
  try {
    await clickByText(page, text, timeout);
    return true;
  } catch (error) {
    return false;
  }
}

async function openPausedView(page) {
  await page.goto(START_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  await page.waitForTimeout(5000);

  if (await tryClickByText(page, "Gestion de stock Full", 12000) === false) {
    if (await tryClickByText(page, "Gestión de stock Full", 12000) === false) {
      throw new Error("No se encontro la opcion Gestion de stock Full");
    }
  }

  await page.waitForTimeout(4000);

  if (await tryClickByText(page, "Filtrar", 10000) === false) {
    throw new Error("No se encontro el boton Filtrar");
  }

  await page.waitForTimeout(2000);

  if (await tryClickByText(page, "Pausadas por ti", 10000) === false) {
    throw new Error("No se encontro el filtro Pausadas por ti");
  }

  await page.waitForTimeout(2000);

  if (await tryClickByText(page, "Aplicar", 10000) === false) {
    throw new Error("No se encontro el boton Aplicar");
  }

  await page.waitForTimeout(6000);

  return page;
}

async function getPageDiagnostics(page) {
  const title = await page.title().catch(() => "");
  const url = page.url();
  const bodyText = await page.locator("body").innerText().catch(() => "");

  const pausedCount = (bodyText.match(/Pausada/g) || []).length;
  const reactivaCount = (bodyText.match(/Reactiva el producto/g) || []).length;

  return {
    title,
    url,
    pausedCount,
    reactivaCount,
    hasGestionStockFull:
      bodyText.includes("Gestion de stock Full") ||
      bodyText.includes("Gestión de stock Full"),
    hasControlStock: bodyText.includes("Control de stock"),
    hasPausadasPorTi: bodyText.includes("Pausadas por ti"),
    hasReactivaProducto: bodyText.includes("Reactiva el producto"),
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

    const page = await context.newPage();
    await openPausedView(page);

    const diagnostics = await getPageDiagnostics(page);

    await browser.close();

    if (looksLikeLoggedOut(diagnostics.bodyPreview)) {
      return res.status(500).json({
        ok: false,
        message: "La sesion no es valida o Mercado Libre pidio iniciar sesion otra vez",
        diagnostics
      });
    }

    if (looksLikeErrorPage(diagnostics.bodyPreview)) {
      return res.status(500).json({
        ok: false,
        message: "Mercado Libre devolvio una pagina de error en vez del listado real",
        diagnostics
      });
    }

    const detectedCount = Math.max(
      diagnostics.reactivaCount,
      diagnostics.pausedCount
    );

    if (detectedCount > 0) {
      return res.status(500).json({
        ok: false,
        pausedCount: detectedCount,
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

    const page = await context.newPage();
    await openPausedView(page);

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
