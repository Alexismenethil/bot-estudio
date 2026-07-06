import { expect, test, type Page } from "@playwright/test";

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: "11111111-1111-4111-8111-111111111111",
  name: "Feynman",
  courseCode: "IS-481",
};

const geminiEvaluation = {
  correctPoints: ["Identifica el objetivo del patron AAA."],
  missingPoints: ["Falta conectar la idea con un ejemplo propio."],
  wrongPoints: [],
  reviewSuggestions: ["Reescribe la explicacion con una analogia corta."],
  citations: [{ documentId: "33333333-3333-4333-8333-333333333333", page: 2 }],
};

async function unlock(page: Page) {
  await page.goto("/unlock");
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function mockUs5Api(page: Page) {
  const submissions = new Map<string, { id: string; topicId: string; explanation: string }>();
  let counter = 0;

  await page.route("**/api/topics", async (route) => {
    await route.fulfill({ json: [topic] });
  });

  await page.route("**/api/review/due**", async (route) => {
    await route.fulfill({
      json: {
        items: [],
        counts: { total: 0, byType: { flashcard: 0, bankQuestion: 0 }, byCourse: [], byTopic: [] },
      },
    });
  });

  await page.route("**/api/feynman/submissions", async (route) => {
    const body = route.request().postDataJSON() as { topicId: string; explanation: string };
    counter += 1;
    const submission = {
      id: `55555555-5555-4555-8555-55555555555${counter}`,
      topicId: body.topicId,
      explanation: body.explanation,
      status: "submitted",
    };
    submissions.set(submission.id, submission);
    await route.fulfill({ status: 201, json: submission });
  });

  await page.route("**/api/feynman/submissions/*/evaluate", async (route) => {
    const id = route.request().url().split("/").at(-2)!;
    const submission = submissions.get(id)!;
    if (submission.explanation.includes("fallback local")) {
      await route.fulfill({ status: 502, json: { failureClass: "quota" } });
      return;
    }
    if (submission.explanation.includes("doble fallo")) {
      await route.fulfill({ status: 502, json: { failureClass: "network" } });
      return;
    }
    await route.fulfill({ json: { engine: "gemini", evaluation: geminiEvaluation } });
  });

  await page.route("**/api/feynman/retrieve", async (route) => {
    const body = route.request().postDataJSON() as { submissionId: string };
    const submission = submissions.get(body.submissionId)!;
    if (submission.explanation.includes("doble fallo")) {
      await route.fulfill({ status: 500, json: { error: { code: "cache_missing" } } });
      return;
    }
    await route.fulfill({
      json: {
        chunks: [
          {
            chunkId: "44444444-4444-4444-8444-444444444444",
            documentId: "33333333-3333-4333-8333-333333333333",
            pageNumber: 4,
            content: "AAA divide la prueba en preparar, actuar y verificar.",
          },
        ],
      },
    });
  });

  await page.route("**/api/feynman/submissions/*/evaluations", async (route) => {
    const body = route.request().postDataJSON() as { evaluation: typeof geminiEvaluation };
    await route.fulfill({ status: 201, json: { engine: "local", evaluation: body.evaluation } });
  });

  await page.route("**/api/feynman/submissions/*/retry-state", async (route) => {
    await route.fulfill({
      json: {
        id: route.request().url().split("/").at(-2),
        status: "pending_retry",
        failureClasses: route.request().postDataJSON().failureClasses,
      },
    });
  });
}

test.describe("US5 Feynman flow [T074]", () => {
  test.beforeEach(async ({ page }) => {
    await mockUs5Api(page);
    await unlock(page);
    await page.evaluate(() => window.localStorage.clear());
  });

  test("quickstart scenario 5: Gemini evaluation, local fallback, and pending retry preserve draft", async ({
    page,
  }) => {
    await page.goto("/feynman");
    await expect(page.getByRole("heading", { name: /modo feynman/i })).toBeVisible();

    await page.getByLabel(/tu explicacion/i).fill("AAA separa preparar, ejecutar y verificar.");
    await expect(page.getByRole("button", { name: /evaluar explicacion/i })).toBeEnabled();
    await page.getByRole("button", { name: /evaluar explicacion/i }).click();
    await expect(page.getByText(/motor: gemini/i)).toBeVisible();
    await expect(page.getByText(/pag\. 2/i)).toBeVisible();

    await page.getByLabel(/tu explicacion/i).fill("fallback local: AAA separa preparar, actuar y verificar.");
    await page.getByRole("button", { name: /evaluar explicacion/i }).click();
    await expect(page.getByText(/motor: local/i)).toBeVisible();
    await expect(page.getByText(/pag\. 4/i)).toBeVisible();

    const preserved = "doble fallo: mi explicacion queda para reintento.";
    await page.getByLabel(/tu explicacion/i).fill(preserved);
    await page.getByRole("button", { name: /evaluar explicacion/i }).click();
    await expect(page.getByRole("status")).toContainText(/intenta de nuevo mas tarde/i);
    await expect(page.getByLabel(/tu explicacion/i)).toHaveValue(preserved);

    await page.reload();
    await expect(page.getByLabel(/tu explicacion/i)).toHaveValue(preserved);
  });
});
