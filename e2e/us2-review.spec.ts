import { expect, test, type Page } from "@playwright/test";

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

const course = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "IS-481",
  name: "Software QA",
};

const topic = {
  id: "22222222-2222-4222-8222-222222222222",
  courseId: course.id,
  name: "SM-2",
};

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function counts(items: QueueItem[]) {
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
  await page.getByLabel("Código de acceso").fill("test-passcode");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("/");
}

async function mockUs2Api(page: Page) {
  const items: QueueItem[] = [
    {
      itemType: "bank_question",
      itemId: "44444444-4444-4444-8444-444444444444",
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      nextReviewAt: "2026-07-08",
      intervalDays: 2,
      easeFactor: 2.5,
      repetitions: 1,
      prompt: "Pregunta de banco",
      correctAnswer: "Respuesta",
      explanation: "Explicacion",
    },
  ];

  await page.route("**/api/courses", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, json: course });
      return;
    }
    await route.fulfill({ json: [course] });
  });

  await page.route("**/api/topics", async (route) => {
    await route.fulfill({ status: 201, json: topic });
  });

  await page.route("**/api/flashcards", async (route) => {
    const body = route.request().postDataJSON() as { front: string; back: string };
    const item: QueueItem = {
      itemType: "flashcard",
      itemId: "33333333-3333-4333-8333-333333333333",
      topicId: topic.id,
      topicName: topic.name,
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      nextReviewAt: "2026-07-06",
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      front: body.front,
      back: body.back,
    };
    items.push(item);
    await route.fulfill({ status: 201, json: item });
  });

  await page.route("**/api/review/due**", async (route) => {
    const url = new URL(route.request().url());
    const today = url.searchParams.get("today") ?? "2026-07-06";
    const horizon = url.searchParams.get("horizon") ?? "today";
    const through = horizon === "week" ? addDays(today, 7) : today;
    const due = items
      .filter((item) => item.nextReviewAt <= through)
      .sort((a, b) => a.nextReviewAt.localeCompare(b.nextReviewAt));
    await route.fulfill({ json: { items: due, counts: counts(due) } });
  });

  await page.route("**/api/review/answer", async (route) => {
    const body = route.request().postDataJSON() as {
      itemId: string;
      outcome: "correct" | "incorrect" | "hard";
      today: string;
    };
    const item = items.find((candidate) => candidate.itemId === body.itemId);
    if (item) {
      if (body.outcome === "correct") {
        item.repetitions += 1;
        item.intervalDays = item.repetitions === 1 ? 1 : 6;
        item.nextReviewAt = addDays(body.today, item.intervalDays);
      } else if (body.outcome === "incorrect") {
        item.repetitions = 0;
        item.intervalDays = 1;
        item.easeFactor = Math.max(1.3, item.easeFactor - 0.2);
        item.nextReviewAt = addDays(body.today, 1);
      }
    }
    await route.fulfill({
      json: {
        state: item,
        scheduleChanged: true,
      },
    });
  });

  return { items };
}

test.describe("US2 review flow [T049]", () => {
  test.beforeEach(async ({ page }) => {
    await mockUs2Api(page);
    await unlock(page);
  });

  test("quickstart scenario 2: create card, review over simulated days, and keep due queue drift-free", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await page.goto("/courses");
    await page.getByLabel(/codigo del curso/i).fill(course.code);
    await page.getByLabel(/nombre del curso/i).fill(course.name);
    await page.getByRole("button", { name: /crear curso/i }).click();
    await page.getByLabel(/nombre del tema/i).fill(topic.name);
    await page.getByRole("button", { name: /crear tema/i }).click();
    await page.getByLabel(/frente de la flashcard/i).fill("¿Que exige TDD?");
    await page.getByLabel(/reverso de la flashcard/i).fill("Pruebas primero.");
    await page.getByRole("button", { name: /crear flashcard/i }).click();
    await expect(page.getByText(/flashcard creada/i)).toBeVisible();

    await page.goto("/?today=2026-07-06");
    await expect(page.getByLabel(/total vencido: 1/i)).toBeVisible();
    await expect(page.getByText(/flashcards/i)).toBeVisible();

    await page.goto("/review?today=2026-07-06");
    await expect(page.getByText("¿Que exige TDD?")).toBeVisible();
    await page.getByRole("button", { name: /revelar respuesta/i }).click();
    await expect(page.getByText("Pruebas primero.")).toBeVisible();
    await page.getByRole("button", { name: /marcar correcto/i }).click();

    await page.goto("/?today=2026-07-06");
    await expect(page.getByText(/nada pendiente/i)).toBeVisible();

    await page.goto("/review?today=2026-07-09");
    await page.getByRole("button", { name: /revelar respuesta/i }).click();
    await page.getByRole("button", { name: /marcar fallo/i }).click();

    await page.goto("/?today=2026-07-10");
    await expect(page.getByLabel(/total vencido: 2/i)).toBeVisible();

    for (let day = 0; day < 10; day++) {
      const today = addDays("2026-07-06", day);
      await page.goto(`/?today=${today}`);
      const expectedDue = day < 2 ? 0 : day < 4 ? 1 : 2;
      await expect(page.getByLabel(new RegExp(`total vencido: ${expectedDue}`, "i"))).toBeVisible();
    }
  });
});
