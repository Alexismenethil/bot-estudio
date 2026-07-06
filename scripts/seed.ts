import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bankQuestions,
  courses,
  documentChunks,
  documents,
  flashcards,
  topics,
} from "@/lib/db/schema";

const courseSeed = {
  code: "IS-481",
  name: "Pruebas de aseguramiento y calidad de software",
};

const topicSeed = {
  name: "TDD y aseguramiento de calidad",
};

const documentSeed = {
  title: "IS-481 fixture de estudio",
  blobUrl: "/fixtures/is481-sample.pdf",
  pageCount: 3,
  status: "ready",
};

const pages = [
  {
    pageNumber: 1,
    content:
      "TDD inicia con una prueba roja que expresa el comportamiento esperado antes de implementar codigo.",
  },
  {
    pageNumber: 2,
    content:
      "El patron Arrange Act Assert separa preparacion, accion y verificacion para hacer pruebas legibles.",
  },
  {
    pageNumber: 3,
    content:
      "Las preguntas de banco falladas en practica o examen se marcan para repaso prioritario con SM-2.",
  },
];

function vectorFor(index: number) {
  return new Array(384).fill(0).map((_, dimension) => (dimension === index ? 1 : 0));
}

async function getOrCreateCourse() {
  const [existing] = await db.select().from(courses).where(eq(courses.code, courseSeed.code));
  if (existing) {
    return existing;
  }
  const [created] = await db.insert(courses).values(courseSeed).returning();
  return created!;
}

async function getOrCreateTopic(courseId: string) {
  const [existing] = await db
    .select()
    .from(topics)
    .where(and(eq(topics.courseId, courseId), eq(topics.name, topicSeed.name)));
  if (existing) {
    return existing;
  }
  const [created] = await db.insert(topics).values({ courseId, name: topicSeed.name }).returning();
  return created!;
}

async function seedDocument(topicId: string) {
  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.topicId, topicId), eq(documents.title, documentSeed.title)));
  const document =
    existing ??
    (
      await db
        .insert(documents)
        .values({ ...documentSeed, topicId })
        .returning()
    )[0]!;

  const existingChunks = await db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, document.id));
  if (existingChunks.length === 0) {
    await db.insert(documentChunks).values(
      pages.map((page, index) => ({
        documentId: document.id,
        pageNumber: page.pageNumber,
        chunkIndex: index,
        content: page.content,
        embedding: vectorFor(index),
      })),
    );
  }

  return document;
}

async function seedFlashcards(topicId: string) {
  const samples = [
    {
      front: "Que exige el primer paso de TDD?",
      back: "Escribir una prueba roja antes de implementar.",
    },
    {
      front: "Que significa AAA en pruebas?",
      back: "Arrange, Act, Assert.",
    },
  ];

  for (const sample of samples) {
    const [existing] = await db
      .select()
      .from(flashcards)
      .where(and(eq(flashcards.topicId, topicId), eq(flashcards.front, sample.front)));
    if (!existing) {
      await db.insert(flashcards).values({ ...sample, topicId });
    }
  }
}

async function seedBankQuestions(topicId: string) {
  const samples = [
    {
      prompt: "Que verifica una prueba roja en TDD?",
      correctAnswer: "Que el comportamiento aun no existe.",
      explanation: "El rojo evita falsos positivos antes de escribir la implementacion.",
    },
    {
      prompt: "Por que AAA mejora la legibilidad de una prueba?",
      correctAnswer: "Porque separa preparacion, accion y verificacion.",
      explanation: "La separacion hace evidente que datos se preparan, que se ejecuta y que se comprueba.",
    },
  ];

  for (const sample of samples) {
    const [existing] = await db
      .select()
      .from(bankQuestions)
      .where(and(eq(bankQuestions.topicId, topicId), eq(bankQuestions.prompt, sample.prompt)));
    if (!existing) {
      await db.insert(bankQuestions).values({ ...sample, topicId });
    }
  }
}

async function main() {
  const course = await getOrCreateCourse();
  const topic = await getOrCreateTopic(course.id);
  const document = await seedDocument(topic.id);
  await seedFlashcards(topic.id);
  await seedBankQuestions(topic.id);

  console.log(
    JSON.stringify(
      {
        seeded: true,
        course: course.code,
        topic: topic.name,
        document: document.title,
        fixture: document.blobUrl,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
