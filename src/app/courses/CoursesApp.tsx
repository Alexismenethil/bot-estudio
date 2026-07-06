"use client";

import { useState, type FormEvent } from "react";

export interface CourseSummary {
  id: string;
  code: string;
  name: string;
}

export interface TopicSummary {
  id: string;
  courseId: string;
  name: string;
}

interface FlashcardDrafts {
  [topicId: string]: { front: string; back: string; count: number };
}

export function CoursesApp({
  initialCourses = [],
  initialTopics = [],
}: {
  initialCourses?: CourseSummary[];
  initialTopics?: TopicSummary[];
}) {
  const [courses, setCourses] = useState(initialCourses);
  const [topics, setTopics] = useState(initialTopics);
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourses[0]?.id ?? "");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [topicName, setTopicName] = useState("");
  const [flashcardDrafts, setFlashcardDrafts] = useState<FlashcardDrafts>({});

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/courses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: courseCode, name: courseName }),
    });
    if (!response.ok) {
      return;
    }
    const created = (await response.json()) as CourseSummary;
    setCourses((current) => [...current, created]);
    setSelectedCourseId(created.id);
    setCourseCode("");
    setCourseName("");
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCourseId) {
      return;
    }
    const response = await fetch("/api/topics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId: selectedCourseId, name: topicName }),
    });
    if (!response.ok) {
      return;
    }
    const created = (await response.json()) as TopicSummary;
    setTopics((current) => [...current, created]);
    setTopicName("");
  }

  async function createFlashcard(event: FormEvent<HTMLFormElement>, topicId: string) {
    event.preventDefault();
    const draft = flashcardDrafts[topicId] ?? { front: "", back: "", count: 0 };
    const response = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topicId, front: draft.front, back: draft.back }),
    });
    if (!response.ok) {
      return;
    }
    setFlashcardDrafts((current) => ({
      ...current,
      [topicId]: { front: "", back: "", count: (current[topicId]?.count ?? 0) + 1 },
    }));
  }

  function updateFlashcardDraft(topicId: string, field: "front" | "back", value: string) {
    setFlashcardDrafts((current) => {
      const previous = current[topicId] ?? { front: "", back: "", count: 0 };
      return {
        ...current,
        [topicId]: { ...previous, [field]: value },
      };
    });
  }

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-6 pb-24 text-slate-950">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[360px_1fr]">
        <section>
          <p className="text-sm font-medium text-blue-700">US2</p>
          <h1 className="mt-1 text-3xl font-semibold">Cursos y temas</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Organiza tus cursos y crea temas para guardar flashcards y colas de repaso.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <form onSubmit={createCourse} className="rounded-[8px] border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Nuevo curso</h2>
            <label htmlFor="course-code" className="mt-4 block text-sm font-medium">
              Codigo del curso
            </label>
            <input
              id="course-code"
              value={courseCode}
              onChange={(event) => setCourseCode(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <label htmlFor="course-name" className="mt-4 block text-sm font-medium">
              Nombre del curso
            </label>
            <input
              id="course-name"
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <button type="submit" className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Crear curso
            </button>
          </form>

          <form onSubmit={createTopic} className="rounded-[8px] border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Nuevo tema</h2>
            <label htmlFor="topic-course" className="mt-4 block text-sm font-medium">
              Curso
            </label>
            <select
              id="topic-course"
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            >
              <option value="">Selecciona un curso</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} - {course.name}
                </option>
              ))}
            </select>
            <label htmlFor="topic-name" className="mt-4 block text-sm font-medium">
              Nombre del tema
            </label>
            <input
              id="topic-name"
              value={topicName}
              onChange={(event) => setTopicName(event.target.value)}
              className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
            />
            <button type="submit" className="mt-4 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              Crear tema
            </button>
          </form>
        </section>

        <section className="lg:col-span-2">
          <h2 className="text-lg font-semibold">Temas</h2>
          {topics.length === 0 ? (
            <p className="mt-3 rounded-[8px] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
              Todavia no hay temas en este curso.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic) => (
                <li key={topic.id} className="rounded-[8px] border border-slate-200 bg-white p-4">
                  <p className="font-semibold">{topic.name}</p>
                  {(flashcardDrafts[topic.id]?.count ?? 0) === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">Aun no hay flashcards en este tema.</p>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      {flashcardDrafts[topic.id]?.count} flashcard creada para repasar hoy.
                    </p>
                  )}
                  <form onSubmit={(event) => createFlashcard(event, topic.id)} className="mt-4 border-t border-slate-100 pt-4">
                    <label htmlFor={`flashcard-front-${topic.id}`} className="block text-sm font-medium">
                      Frente de la flashcard
                    </label>
                    <input
                      id={`flashcard-front-${topic.id}`}
                      value={flashcardDrafts[topic.id]?.front ?? ""}
                      onChange={(event) => updateFlashcardDraft(topic.id, "front", event.target.value)}
                      className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
                    />
                    <label htmlFor={`flashcard-back-${topic.id}`} className="mt-3 block text-sm font-medium">
                      Reverso de la flashcard
                    </label>
                    <input
                      id={`flashcard-back-${topic.id}`}
                      value={flashcardDrafts[topic.id]?.back ?? ""}
                      onChange={(event) => updateFlashcardDraft(topic.id, "back", event.target.value)}
                      className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-2"
                    />
                    <button
                      type="submit"
                      className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                    >
                      Crear flashcard
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
