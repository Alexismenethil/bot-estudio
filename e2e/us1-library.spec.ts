import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import citationSet from "../tests/fixtures/us1-citation-set.json" assert { type: "json" };

const samplePdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 72 720 Td (US1 PDF fixture) Tj ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000204 00000 n
trailer
<< /Root 1 0 R /Size 5 >>
startxref
298
%%EOF`;

async function unlock(page: import("@playwright/test").Page) {
  await page.goto("/unlock");
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function uploadPdf(page: import("@playwright/test").Page, testInfo: import("@playwright/test").TestInfo) {
  const pdfPath = path.join(testInfo.outputDir, "tesis_anemia.pdf");
  await fs.mkdir(testInfo.outputDir, { recursive: true });
  await fs.writeFile(pdfPath, samplePdf);
  await page.goto("/library");
  await page.getByLabel(/selecciona un pdf/i).setInputFiles(pdfPath);
  await page.getByRole("button", { name: /abrir visor/i }).click();
  await expect(page.getByText("Pagina 1 de 10")).toBeVisible();
}

async function mockAssistantRoutes(page: import("@playwright/test").Page) {
  await page.route("**/api/documents/*/messages", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    await route.fulfill({ status: 201, json: { id: crypto.randomUUID() } });
  });

  await page.route("**/api/assistant/retrieve", async (route) => {
    await route.fulfill({
      json: {
        chunks: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            pageNumber: 3,
            content: "Respuesta local desde el cache del documento.",
          },
        ],
      },
    });
  });

  await page.route("**/api/assistant/ask", async (route) => {
    const body = route.request().postDataJSON() as { question: string };
    const entry = citationSet.questions.find((question) => question.question === body.question);

    if (body.question.includes("forzar fallback")) {
      await route.fulfill({ status: 502, json: { failureClass: "network" } });
      return;
    }

    if (entry) {
      if (!entry.answerable) {
        await route.fulfill({
          json: {
            answer: "No puedo responder esta pregunta usando el contenido de este documento.",
            citations: [],
            engine: "gemini",
          },
        });
        return;
      }

      await route.fulfill({
        json: {
          answer: `Respuesta basada en la pagina ${entry.expectedPage}.`,
          citations: [{ page: entry.expectedPage, chunkId: "22222222-2222-4222-8222-222222222222" }],
          engine: "gemini",
        },
      });
      return;
    }

    await route.fulfill({
      json: {
        answer: "Las pruebas E2E simulan el flujo completo del usuario.",
        citations: [{ page: 4, chunkId: "22222222-2222-4222-8222-222222222222" }],
        engine: "gemini",
      },
    });
  });
}

test.describe("US1 Library UI and assistant [T038]", () => {
  test.beforeEach(async ({ page }) => {
    await mockAssistantRoutes(page);
    await unlock(page);
  });

  test("full journey: upload, viewer controls, cited answer, refusal, fallback drills, and SC-002 UI acceptance", async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { value: {}, configurable: true });
    });

    await uploadPdf(page, testInfo);

    await page.getByRole("button", { name: /pagina siguiente/i }).click();
    await expect(page.getByText("Pagina 2 de 10")).toBeVisible();
    await page.getByRole("button", { name: /aumentar zoom/i }).click();
    await expect(page.getByText("110%")).toBeVisible();

    await page.getByRole("tab", { name: /asistente/i }).click();
    await expect(page.getByRole("dialog", { name: /tutorpdf/i })).toBeVisible();

    await page.getByLabel(/escribe tu duda/i).fill("¿Que simulan las pruebas E2E?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/pagina 4/i)).toBeVisible();
    await page.getByRole("button", { name: /ir a pagina 4/i }).click();
    await expect(page.getByText("Pagina 4 de 10")).toBeVisible();

    await page.getByLabel(/escribe tu duda/i).fill("¿Cual es la capital de Francia?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/no puedo responder/i)).toBeVisible();

    await page.getByLabel(/escribe tu duda/i).fill("forzar fallback local");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText("Motor: local")).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
    });
    await page.getByLabel(/escribe tu duda/i).fill("forzar fallback doble");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/temporalmente no disponible/i)).toBeVisible();
    await expect(page.getByText("forzar fallback doble").first()).toBeVisible();

    let answerableOk = 0;
    let unanswerableOk = 0;
    for (const entry of citationSet.questions) {
      await page.getByLabel(/escribe tu duda/i).fill(entry.question);
      await page.getByRole("button", { name: "Enviar" }).click();

      if (entry.answerable) {
        await expect(page.getByRole("button", { name: `Ir a pagina ${entry.expectedPage}` }).last()).toBeVisible();
        answerableOk += 1;
      } else {
        await expect(page.getByText(/no puedo responder esta pregunta/i).last()).toBeVisible();
        unanswerableOk += 1;
      }
    }

    expect(answerableOk).toBe(citationSet.questions.filter((question) => question.answerable).length);
    expect(unanswerableOk).toBe(citationSet.questions.filter((question) => !question.answerable).length);
  });
});
