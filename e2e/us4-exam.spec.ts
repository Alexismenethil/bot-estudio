import { expect, test, type Page } from "@playwright/test";

type Question = {
  id: string;
  topicId: string;
  prompt: string;
  correctAnswer: string;
  explanation: string;
};

const course = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "IS-481",
  name: "Software QA",
};

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: course.id,
  name: "Examen",
  courseCode: course.code,
};

const questions: Question[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    topicId: topic.id,
    prompt: "Que verifica el rojo en TDD?",
    correctAnswer: "Que el comportamiento aun no existe.",
    explanation: "El rojo evita falsos positivos.",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    topicId: topic.id,
    prompt: "Que hace el verde?",
    correctAnswer: "Implementa lo minimo.",
    explanation: "El verde satisface el test.",
  },
];

async function unlock(page: Page) {
  await page.goto("/unlock");
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function mockUs4Api(page: Page) {
  let startedAt = 0;
  let durationSeconds = 2;
  let status: "active" | "finished" = "active";
  const answers: { questionId: string; isCorrect: boolean }[] = [];

  await page.route("**/api/review/due**", async (route) => {
    await route.fulfill({
      json: {
        items: [],
        counts: { total: 0, byType: { flashcard: 0, bankQuestion: 0 }, byCourse: [], byTopic: [] },
      },
    });
  });

  function remainingMs() {
    return status === "finished" ? 0 : Math.max(0, startedAt + durationSeconds * 1000 - Date.now());
  }

  function report() {
    status = "finished";
    const failed = questions.filter(
      (question) => answers.find((answer) => answer.questionId === question.id)?.isCorrect !== true,
    );
    const correctCount = answers.filter((answer) => answer.isCorrect).length;
    return {
      totalQuestions: questions.length,
      answeredCount: answers.length,
      correctCount,
      scorePct: (correctCount / questions.length) * 100,
      failed: failed.map((question) => ({
        questionId: question.id,
        topicId: question.topicId,
        prompt: question.prompt,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      })),
    };
  }

  await page.route("**/api/topics", async (route) => {
    await route.fulfill({ json: [topic] });
  });

  await page.route("**/api/bank-questions**", async (route) => {
    await route.fulfill({ json: { bankQuestions: questions } });
  });

  await page.route("**/api/exam/sessions", async (route) => {
    const body = route.request().postDataJSON() as { durationSeconds: number };
    durationSeconds = body.durationSeconds;
    startedAt = Date.now();
    status = "active";
    answers.splice(0);
    await route.fulfill({
      status: 201,
      json: {
        id: "55555555-5555-4555-8555-555555555555",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        durationSeconds,
        startedAt: new Date(startedAt).toISOString(),
        status,
        remainingMs: remainingMs(),
        answers,
      },
    });
  });

  await page.route("**/api/exam/sessions/*/answers", async (route) => {
    if (remainingMs() === 0) {
      await route.fulfill({ status: 409, json: { error: { code: "expired" }, report: report() } });
      return;
    }
    const body = route.request().postDataJSON() as { questionId: string; givenAnswer: string };
    const question = questions.find((candidate) => candidate.id === body.questionId)!;
    const answer = {
      questionId: question.id,
      isCorrect: body.givenAnswer.trim().toLocaleLowerCase("es") === question.correctAnswer.toLocaleLowerCase("es"),
    };
    answers.push(answer);
    await route.fulfill({ status: 201, json: answer });
  });

  await page.route("**/api/exam/sessions/*/finalize", async (route) => {
    await route.fulfill({ json: report() });
  });

  await page.route("**/api/exam/sessions/*", async (route) => {
    const expired = remainingMs() === 0;
    const currentReport = expired || status === "finished" ? report() : undefined;
    await route.fulfill({
      json: {
        id: "55555555-5555-4555-8555-555555555555",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        durationSeconds,
        startedAt: new Date(startedAt).toISOString(),
        status,
        remainingMs: remainingMs(),
        answers,
        report: currentReport,
      },
    });
  });
}

test.describe("US4 exam flow [T064]", () => {
  test.beforeEach(async ({ page }) => {
    await mockUs4Api(page);
    await unlock(page);
    await page.evaluate(() => window.localStorage.clear());
  });

  test("quickstart scenario 4: timed exam resumes, expires, and renders report within 5 seconds", async ({
    page,
  }) => {
    await page.goto("/exam");
    await expect(page.getByRole("heading", { name: /simulador de examen/i })).toBeVisible();
    await page.getByLabel(/duracion/i).fill("2");
    await expect(page.getByRole("button", { name: /iniciar examen/i })).toBeEnabled();
    await page.getByRole("button", { name: /iniciar examen/i }).click();

    await expect(page.getByLabel(/tiempo restante/i)).toBeVisible();
    await page.getByLabel(/tu respuesta/i).fill(questions[0].correctAnswer);
    await page.getByRole("button", { name: /guardar respuesta/i }).click();
    await expect(page.getByText(questions[1].prompt)).toBeVisible();

    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByLabel(/tiempo restante/i)).toHaveText(/00:0[12]/);

    const reportStartedAt = Date.now();
    await expect(page.getByRole("heading", { name: /reporte de examen/i })).toBeVisible({ timeout: 5_000 });
    expect(Date.now() - reportStartedAt).toBeLessThanOrEqual(5_000);
    await expect(page.getByLabel(/puntaje/i)).toHaveText("50%");
    await expect(page.getByText(questions[1].prompt)).toBeVisible();
    await expect(page.getByText(/repaso prioritario/i)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: /reporte de examen/i })).toBeVisible();
    await expect(page.getByLabel(/puntaje/i)).toHaveText("50%");
  });

  test("lets a student start a new exam after finishing one [FR-019]", async ({ page }) => {
    await page.goto("/exam");
    await page.getByLabel(/duracion/i).fill("120");
    await page.getByRole("button", { name: /iniciar examen/i }).click();

    await page.getByLabel(/tu respuesta/i).fill(questions[0].correctAnswer);
    await page.getByRole("button", { name: /guardar respuesta/i }).click();
    await expect(page.getByText(questions[1].prompt)).toBeVisible();
    await page.getByLabel(/tu respuesta/i).fill(questions[1].correctAnswer);
    await page.getByRole("button", { name: /guardar respuesta/i }).click();

    await page.getByRole("button", { name: /finalizar ahora/i }).click();
    await expect(page.getByRole("heading", { name: /reporte de examen/i })).toBeVisible();

    await page.getByRole("button", { name: /configurar nuevo examen/i }).click();
    await expect(page.getByRole("heading", { name: /simulador de examen/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /iniciar examen/i })).toBeEnabled();

    await page.getByLabel(/duracion/i).fill("120");
    await page.getByRole("button", { name: /iniciar examen/i }).click();
    await expect(page.getByLabel(/tiempo restante/i)).toBeVisible();
    await expect(page.getByText(questions[0].prompt)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/tiempo restante/i)).toBeVisible();
    await expect(page.getByText(questions[0].prompt)).toBeVisible();
    await expect(page.getByRole("heading", { name: /reporte de examen/i })).not.toBeVisible();
  });
});
