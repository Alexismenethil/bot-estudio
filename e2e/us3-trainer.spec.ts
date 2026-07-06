import { expect, test, type Page } from "@playwright/test";

type BankQuestion = {
  id: string;
  topicId: string;
  prompt: string;
  correctAnswer: string;
  explanation: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
};

const course = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "IS-481",
  name: "Software QA",
};

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: course.id,
  name: "Entrenador",
  courseCode: course.code,
};

async function unlock(page: Page) {
  await page.goto("/unlock");
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function mockUs3Api(page: Page) {
  const questions: BankQuestion[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      topicId: topic.id,
      prompt: "Que verifica el rojo en TDD?",
      correctAnswer: "Que el comportamiento aun no existe.",
      explanation: "El rojo evita falsos positivos antes de implementar.",
      nextReviewAt: "2026-08-20",
      intervalDays: 15,
      easeFactor: 2.4,
      repetitions: 3,
    },
  ];
  let sessionQuestionIds: string[] = [];
  let currentIndex = 0;
  let status: "active" | "finished" = "active";

  await page.route("**/api/topics", async (route) => {
    await route.fulfill({ json: [topic] });
  });

  await page.route("**/api/bank-questions**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Pick<
        BankQuestion,
        "topicId" | "prompt" | "correctAnswer" | "explanation"
      >;
      const created: BankQuestion = {
        id: "44444444-4444-4444-8444-444444444444",
        ...body,
        nextReviewAt: "2026-07-06",
        intervalDays: 0,
        easeFactor: 2.5,
        repetitions: 0,
      };
      questions.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({ json: { bankQuestions: questions } });
  });

  await page.route("**/api/trainer/sessions", async (route) => {
    if (questions.length === 0) {
      await route.fulfill({ status: 422, json: { error: { code: "empty_bank" } } });
      return;
    }

    sessionQuestionIds = questions.map((question) => question.id);
    currentIndex = 0;
    status = "active";
    await route.fulfill({
      status: 201,
      json: {
        id: "55555555-5555-4555-8555-555555555555",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: sessionQuestionIds,
        currentIndex,
        status,
      },
    });
  });

  await page.route("**/api/trainer/sessions/*/answers", async (route) => {
    const body = route.request().postDataJSON() as { questionId: string; givenAnswer: string };
    const question = questions.find((candidate) => candidate.id === body.questionId) ?? questions[0];
    const isCorrect =
      body.givenAnswer.trim().toLocaleLowerCase("es") === question.correctAnswer.toLocaleLowerCase("es");

    if (!isCorrect) {
      question.nextReviewAt = "2026-07-07";
      question.intervalDays = 1;
      question.repetitions = 0;
      question.easeFactor = 2.2;
    }

    const questionIndex = sessionQuestionIds.indexOf(question.id);
    currentIndex = Math.max(currentIndex, questionIndex + 1);
    status = currentIndex >= sessionQuestionIds.length ? "finished" : "active";

    await route.fulfill({
      json: {
        isCorrect,
        explanation: question.explanation,
        review: {
          scheduleChanged: !isCorrect,
          state: {
            nextReviewAt: question.nextReviewAt,
            intervalDays: question.intervalDays,
            easeFactor: question.easeFactor,
            repetitions: question.repetitions,
          },
        },
      },
    });
  });

  await page.route("**/api/trainer/sessions/*", async (route) => {
    await route.fulfill({
      json: {
        id: "55555555-5555-4555-8555-555555555555",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: sessionQuestionIds,
        currentIndex,
        status,
      },
    });
  });

  await page.route("**/api/review/due**", async (route) => {
    const url = new URL(route.request().url());
    const today = url.searchParams.get("today") ?? "2026-07-06";
    const due = questions.filter((question) => question.nextReviewAt <= today);
    await route.fulfill({
      json: {
        items: due.map((question) => ({
          itemType: "bank_question",
          itemId: question.id,
          topicId: topic.id,
          topicName: topic.name,
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          nextReviewAt: question.nextReviewAt,
          intervalDays: question.intervalDays,
          easeFactor: question.easeFactor,
          repetitions: question.repetitions,
          prompt: question.prompt,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
        })),
        counts: {
          total: due.length,
          byType: { flashcard: 0, bankQuestion: due.length },
          byCourse: due.length
            ? [{
                courseId: course.id,
                courseCode: course.code,
                courseName: course.name,
                dueCount: due.length,
                flashcards: 0,
                bankQuestions: due.length,
              }]
            : [],
          byTopic: due.length
            ? [{
                topicId: topic.id,
                topicName: topic.name,
                courseId: course.id,
                courseCode: course.code,
                dueCount: due.length,
                flashcards: 0,
                bankQuestions: due.length,
              }]
            : [],
        },
      },
    });
  });
}

test.describe("US3 trainer flow [T055]", () => {
  test.beforeEach(async ({ page }) => {
    await mockUs3Api(page);
    await unlock(page);
  });

  test("quickstart scenario 3: untimed practice shows feedback and failed questions enter due queue", async ({
    page,
  }) => {
    await page.goto("/trainer");

    await expect(page.getByRole("heading", { name: /entrenador/i })).toBeVisible();
    await expect(page.getByText(/temporizador|cronometro|tiempo restante/i)).toHaveCount(0);

    await page.getByRole("button", { name: /iniciar practica/i }).click();
    await expect(page.getByText(/pregunta 1 de 1/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Que verifica el rojo en TDD?" })).toBeVisible();

    await page.getByLabel(/tu respuesta/i).fill("Otra cosa");
    await page.getByRole("button", { name: /responder/i }).click();

    await expect(page.getByText(/incorrecto/i)).toBeVisible();
    await expect(page.getByText("El rojo evita falsos positivos antes de implementar.")).toBeVisible();
    await expect(page.getByText(/repaso prioritario/i)).toBeVisible();
    await expect(page.getByText(/temporizador|cronometro|tiempo restante/i)).toHaveCount(0);

    await page.goto("/?today=2026-07-07");
    await expect(page.getByLabel(/total vencido: 1/i)).toBeVisible();
    await expect(page.getByLabel(/bank questions: 1/i)).toBeVisible();
  });

  test("resumes an in-progress trainer session at the same question after reload [FR-029]", async ({
    page,
  }) => {
    await page.goto("/trainer");

    await page.getByLabel(/enunciado/i).fill("Que hace el verde en TDD?");
    await page.getByLabel(/respuesta correcta/i).fill("Implementa lo minimo.");
    await page.getByLabel(/explicacion/i).fill("El verde satisface el test.");
    await page.getByRole("button", { name: /crear pregunta/i }).click();
    await expect(page.getByText("Que hace el verde en TDD?")).toBeVisible();

    await page.getByRole("button", { name: /iniciar practica/i }).click();
    await expect(page.getByText(/pregunta 1 de 2/i)).toBeVisible();

    await page.getByLabel(/tu respuesta/i).fill("Que el comportamiento aun no existe.");
    await page.getByRole("button", { name: /responder/i }).click();
    await expect(page.getByText(/correcto/i)).toBeVisible();
    await page.getByRole("button", { name: /continuar/i }).click();
    await expect(page.getByText(/pregunta 2 de 2/i)).toBeVisible();

    await page.reload();

    await expect(page.getByText(/pregunta 2 de 2/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Que hace el verde en TDD?" })).toBeVisible();
  });
});
