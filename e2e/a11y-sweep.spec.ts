import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { expectNoA11yViolations } from "./helpers/a11y";

type QueueItem = {
  itemType: "flashcard" | "bank_question";
  itemId: string;
  topicId: string;
  topicName: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  front?: string;
  back?: string;
  prompt?: string;
  correctAnswer?: string;
  explanation?: string;
};

type BankQuestion = {
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
  courseCode: course.code,
  name: "TDD y aseguramiento de calidad",
};

const questions: BankQuestion[] = [
  {
    id: "33333333-3333-4333-8333-333333333333",
    topicId: topic.id,
    prompt: "Que verifica el rojo en TDD?",
    correctAnswer: "Que el comportamiento aun no existe.",
    explanation: "El rojo evita falsos positivos antes de implementar.",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    topicId: topic.id,
    prompt: "Que hace el verde?",
    correctAnswer: "Implementa lo minimo.",
    explanation: "El verde satisface el test.",
  },
];

const geminiEvaluation = {
  correctPoints: ["Identifica el objetivo del patron AAA."],
  missingPoints: ["Falta conectar la idea con un ejemplo propio."],
  wrongPoints: [],
  reviewSuggestions: ["Reescribe la explicacion con una analogia corta."],
  citations: [{ documentId: "55555555-5555-4555-8555-555555555555", page: 2 }],
};

function queueCounts(items: QueueItem[]) {
  return {
    total: items.length,
    byType: {
      flashcard: items.filter((item) => item.itemType === "flashcard").length,
      bankQuestion: items.filter((item) => item.itemType === "bank_question").length,
    },
    byCourse: items.length
      ? [{
          courseId: course.id,
          courseCode: course.code,
          courseName: course.name,
          dueCount: items.length,
          flashcards: items.filter((item) => item.itemType === "flashcard").length,
          bankQuestions: items.filter((item) => item.itemType === "bank_question").length,
        }]
      : [],
    byTopic: items.length
      ? [{
          topicId: topic.id,
          topicName: topic.name,
          courseId: course.id,
          courseCode: course.code,
          dueCount: items.length,
          flashcards: items.filter((item) => item.itemType === "flashcard").length,
          bankQuestions: items.filter((item) => item.itemType === "bank_question").length,
        }]
      : [],
  };
}

async function unlock(page: Page) {
  await page.goto("/unlock");
  await expectNoA11yViolations(page);
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function mockSeededApi(page: Page) {
  const queueItems: QueueItem[] = [
    {
      itemType: "flashcard",
      itemId: "66666666-6666-4666-8666-666666666666",
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      nextReviewAt: "2026-07-06",
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      front: "Que exige TDD?",
      back: "Pruebas primero.",
    },
    {
      itemType: "bank_question",
      itemId: questions[0].id,
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      nextReviewAt: "2026-07-06",
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      prompt: questions[0].prompt,
      correctAnswer: questions[0].correctAnswer,
      explanation: questions[0].explanation,
    },
  ];
  const submissions = new Map<string, { id: string; explanation: string }>();
  let feynmanCounter = 0;
  let trainerCurrentIndex = 0;
  let examStartedAt = Date.now();
  let examDurationSeconds = 60;
  const examAnswers: { questionId: string; isCorrect: boolean }[] = [];

  await page.route("**/api/courses", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, json: course });
      return;
    }
    await route.fulfill({ json: [course] });
  });

  await page.route("**/api/topics", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, json: topic });
      return;
    }
    await route.fulfill({ json: [topic] });
  });

  await page.route("**/api/flashcards", async (route) => {
    await route.fulfill({ status: 201, json: queueItems[0] });
  });

  await page.route("**/api/bank-questions**", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Pick<BankQuestion, "topicId" | "prompt" | "correctAnswer" | "explanation">;
      const created = { id: "77777777-7777-4777-8777-777777777777", ...body };
      questions.push(created);
      await route.fulfill({ status: 201, json: created });
      return;
    }
    await route.fulfill({ json: { bankQuestions: questions } });
  });

  await page.route("**/api/review/due**", async (route) => {
    await route.fulfill({ json: { items: queueItems, counts: queueCounts(queueItems) } });
  });

  await page.route("**/api/review/answer", async (route) => {
    await route.fulfill({
      json: {
        scheduleChanged: true,
        state: { nextReviewAt: "2026-07-07", intervalDays: 1, easeFactor: 2.5, repetitions: 1 },
      },
    });
  });

  await page.route("**/api/trainer/sessions", async (route) => {
    trainerCurrentIndex = 0;
    await route.fulfill({
      status: 201,
      json: {
        id: "88888888-8888-4888-8888-888888888888",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        currentIndex: trainerCurrentIndex,
        status: "active",
      },
    });
  });

  await page.route("**/api/trainer/sessions/*/answers", async (route) => {
    trainerCurrentIndex += 1;
    await route.fulfill({
      json: {
        isCorrect: false,
        explanation: questions[0].explanation,
        review: {
          scheduleChanged: true,
          state: { nextReviewAt: "2026-07-07", intervalDays: 1, easeFactor: 2.3, repetitions: 0 },
        },
      },
    });
  });

  await page.route("**/api/trainer/sessions/*", async (route) => {
    await route.fulfill({
      json: {
        id: "88888888-8888-4888-8888-888888888888",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        currentIndex: trainerCurrentIndex,
        status: trainerCurrentIndex >= questions.length ? "finished" : "active",
      },
    });
  });

  function examRemainingMs() {
    return Math.max(0, examStartedAt + examDurationSeconds * 1000 - Date.now());
  }

  function examReport() {
    return {
      totalQuestions: questions.length,
      answeredCount: examAnswers.length,
      correctCount: examAnswers.filter((answer) => answer.isCorrect).length,
      scorePct: 50,
      failed: [questions[1]].map((question) => ({
        questionId: question.id,
        topicId: question.topicId,
        prompt: question.prompt,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
      })),
    };
  }

  await page.route("**/api/exam/sessions", async (route) => {
    const body = route.request().postDataJSON() as { durationSeconds: number };
    examStartedAt = Date.now();
    examDurationSeconds = body.durationSeconds;
    examAnswers.splice(0);
    await route.fulfill({
      status: 201,
      json: {
        id: "99999999-9999-4999-8999-999999999999",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        durationSeconds: examDurationSeconds,
        startedAt: new Date(examStartedAt).toISOString(),
        status: "active",
        remainingMs: examRemainingMs(),
        answers: examAnswers,
      },
    });
  });

  await page.route("**/api/exam/sessions/*/answers", async (route) => {
    const body = route.request().postDataJSON() as { questionId: string; givenAnswer: string };
    const question = questions.find((candidate) => candidate.id === body.questionId) ?? questions[0];
    const answer = {
      questionId: question.id,
      isCorrect: body.givenAnswer.trim().toLocaleLowerCase("es") === question.correctAnswer.toLocaleLowerCase("es"),
    };
    examAnswers.push(answer);
    await route.fulfill({ status: 201, json: answer });
  });

  await page.route("**/api/exam/sessions/*/finalize", async (route) => {
    await route.fulfill({ json: examReport() });
  });

  await page.route("**/api/exam/sessions/*", async (route) => {
    await route.fulfill({
      json: {
        id: "99999999-9999-4999-8999-999999999999",
        scopeType: "topic",
        scopeId: topic.id,
        questionIds: questions.map((question) => question.id),
        durationSeconds: examDurationSeconds,
        startedAt: new Date(examStartedAt).toISOString(),
        status: "active",
        remainingMs: examRemainingMs(),
        answers: examAnswers,
      },
    });
  });

  await page.route("**/api/feynman/submissions", async (route) => {
    const body = route.request().postDataJSON() as { explanation: string };
    feynmanCounter += 1;
    const submission = {
      id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${feynmanCounter}`,
      explanation: body.explanation,
      status: "submitted",
    };
    submissions.set(submission.id, submission);
    await route.fulfill({ status: 201, json: submission });
  });

  await page.route("**/api/feynman/submissions/*/evaluate", async (route) => {
    const id = route.request().url().split("/").at(-2)!;
    const submission = submissions.get(id);
    if (submission?.explanation.includes("doble fallo")) {
      await route.fulfill({ status: 502, json: { failureClass: "network" } });
      return;
    }
    await route.fulfill({ json: { engine: "gemini", evaluation: geminiEvaluation } });
  });

  await page.route("**/api/feynman/retrieve", async (route) => {
    await route.fulfill({ status: 500, json: { error: { code: "cache_missing" } } });
  });

  await page.route("**/api/feynman/submissions/*/retry-state", async (route) => {
    await route.fulfill({ json: { status: "pending_retry" } });
  });

  await page.route("**/api/documents/*/messages", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { messages: [] } });
      return;
    }
    await route.fulfill({ status: 201, json: { id: crypto.randomUUID() } });
  });

  await page.route("**/api/assistant/ask", async (route) => {
    await route.fulfill({
      json: {
        answer: "El patron TDD exige ver fallar la prueba antes de implementar.",
        citations: [{ page: 2, chunkId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }],
        engine: "gemini",
      },
    });
  });
}

test.describe("Polish a11y sweep [T076, SC-008, FR-028]", () => {
  test.beforeEach(async ({ page }) => {
    await mockSeededApi(page);
    await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
  });

  test("seeded app screens have no WCAG 2.1 A/AA violations", async ({ page }) => {
    test.setTimeout(180_000);

    await unlock(page);
    await expect(page.getByRole("heading", { name: /panel de estudio/i })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/courses");
    await page.getByLabel(/codigo del curso/i).fill(course.code);
    await page.getByLabel(/nombre del curso/i).fill(course.name);
    await page.getByRole("button", { name: /crear curso/i }).click();
    await page.getByLabel(/nombre del tema/i).fill(topic.name);
    await page.getByRole("button", { name: /crear tema/i }).click();
    await expect(page.getByText(topic.name)).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/review?today=2026-07-06");
    await expect(page.getByText("Que exige TDD?")).toBeVisible();
    await page.getByRole("button", { name: /revelar respuesta/i }).click();
    await expect(page.getByText("Pruebas primero.")).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/trainer");
    await expect(page.getByRole("heading", { name: /entrenador/i })).toBeVisible();
    await page.getByRole("button", { name: /iniciar practica/i }).click();
    await page.getByLabel(/tu respuesta/i).fill("No lo se");
    await page.getByRole("button", { name: /responder/i }).click();
    await expect(page.getByText(/repaso prioritario/i)).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/exam");
    await expect(page.getByRole("heading", { name: /simulador de examen/i })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByLabel(/duracion/i).fill("60");
    await page.getByRole("button", { name: /iniciar examen/i }).click();
    await expect(page.getByLabel(/tiempo restante/i)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByLabel(/tu respuesta/i).fill(questions[0].correctAnswer);
    await page.getByRole("button", { name: /guardar respuesta/i }).click();
    await expect(page.getByText(questions[1].prompt)).toBeVisible();
    await page.getByLabel(/tu respuesta/i).fill("otra respuesta");
    await page.getByRole("button", { name: /guardar respuesta/i }).click();
    await page.getByRole("button", { name: /finalizar ahora/i }).click();
    await expect(page.getByRole("heading", { name: /reporte de examen/i })).toBeVisible();
    await expectNoA11yViolations(page);

    await page.goto("/feynman");
    await expect(page.getByRole("heading", { name: /modo feynman/i })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByLabel(/tu explicacion/i).fill("AAA separa preparar, ejecutar y verificar.");
    await page.getByRole("button", { name: /evaluar explicacion/i }).click();
    await expect(page.getByText(/motor: gemini/i)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByLabel(/tu explicacion/i).fill("doble fallo: queda para reintento");
    await page.getByRole("button", { name: /evaluar explicacion/i }).click();
    await expect(page.getByRole("status")).toContainText(/intenta de nuevo mas tarde/i);
    await expectNoA11yViolations(page);

    await page.goto("/library");
    await expect(page.getByRole("heading", { name: /biblioteca sin documentos/i })).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByLabel(/selecciona un pdf/i).setInputFiles(path.join(process.cwd(), "public/fixtures/is481-sample.pdf"));
    await page.getByRole("button", { name: /abrir visor/i }).click();
    await expect(page.getByText(/pagina 1 de 10/i)).toBeVisible();
    await expectNoA11yViolations(page);
    await page.getByRole("tab", { name: /asistente/i }).click();
    await expect(page.getByRole("dialog", { name: /tutorpdf/i })).toBeVisible();
    await page.getByLabel(/escribe tu duda/i).fill("Que exige TDD?");
    await page.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByText(/motor: gemini/i)).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
