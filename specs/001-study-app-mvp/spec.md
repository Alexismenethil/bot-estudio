# Feature Specification: Personal Study App Core Features

**Feature Branch**: `001-study-app-mvp`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Aplicación de estudio personal 'bot-estudio', con cinco historias de usuario priorizadas, cada una independientemente entregable y testeable: P1 - Biblioteca de documentos con asistente que cita página exacta; P2 - Gestión de temas y motor de repetición espaciada; P3 - Entrenador (práctica libre sin tiempo); P4 - Simulador de examen cronometrado; P5 - Modo Feynman con evaluación por IA. Fuera de alcance por ahora: autenticación multiusuario (es una app personal de un solo usuario), notificaciones push nativas, soporte offline completo."

## Clarifications

### Session 2026-07-05

- Q: How does an uploaded PDF relate to Topics vs. Course? → A: A Document belongs to exactly one Topic, chosen at upload time; its Course is derived transitively through that Topic.
- Q: Where does study data (courses, topics, flashcards, documents, scores) live — single device only, or centrally accessible across devices? → A: A central store accessible from any device/browser the student uses; no offline-first requirement.
- Q: Should this spec include an explicit accessibility requirement, given the constitution mandates WCAG 2.1 AA? → A: Yes — add an explicit functional requirement and success criterion here rather than relying on an implicit constitution-wide rule.
- Q: What happens to an in-progress timed exam or trainer session if the student closes the app before finishing? → A: Progress auto-saves continuously; reopening resumes the session, with the exam timer reflecting real elapsed time (auto-grading at timeout if the limit lapsed while away).
- Q: What happens when both the primary AI service and the local fallback model fail to respond? → A: The system shows an explicit "temporarily unavailable" message, and the student's unanswered question (US1) or explanation (US5) is preserved so it can be retried later without being lost.
- Q: Do Bank Questions use the same spaced-repetition engine as Flashcards, and if a question already has a future scheduled review date but is failed again today in Trainer/Exam, does that override the existing schedule? → A: Yes, Bank Questions share the same engine (next-review date, interval, ease factor) as Flashcards; failing a question in any context (normal review, Trainer, or Exam) always applies the incorrect-outcome rule (FR-013) immediately, overriding any previously scheduled future date.
- Q: Does answering a Bank Question correctly in Trainer or Exam also advance its SM-2 schedule (longer interval), the same as failing it overrides the schedule? → A: No — a correct answer in Trainer/Exam MUST NOT modify the schedule (interval or ease factor) at all. Only incorrect answers touch the schedule from Trainer/Exam (via the FR-018 override); the schedule only advances on a correct answer through the official P2 spaced-repetition review.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Document Library with a page-citing assistant (Priority: P1)

As a student, I want to upload a course PDF, view it in a paginated reader, and ask an
assistant questions that it answers strictly from the document's content, always citing
the exact page the answer came from.

**Why this priority**: This is the foundation students touch first — getting course
material into the app and being able to interrogate it — and it de-risks the hardest
technical constraint (grounded, page-cited answers) before anything else is built on it.

**Independent Test**: Can be fully tested by uploading a single PDF to a topic, opening
it in the viewer, asking a question the document does answer and one it doesn't, and
confirming the citation and jump-to-page behavior — with no dependency on any other
story.

**Acceptance Scenarios**:

<!-- Per constitution Principle IV (Requirement Traceability), each scenario below MUST be linked to at least one automated test before its task is marked complete. -->

1. **Given** a student has selected a topic within a course, **When** they upload a PDF, **Then** the PDF is indexed into that topic's Library (with the course implied through the topic) and available to open.
2. **Given** a document is open in the viewer, **When** the student navigates pages or zooms, **Then** the document renders page-by-page with working zoom and page navigation.
3. **Given** a document is open in the viewer, **When** the student opens the assistant, **Then** it appears as an overlay on top of the viewer without navigating away from the document.
4. **Given** the assistant answers using the open document's content, **When** the answer is shown, **Then** it includes a citation to the exact source page.
5. **Given** an assistant response contains a page citation, **When** the student taps it, **Then** the viewer automatically jumps to that page.
6. **Given** a question cannot be answered from the document's content, **When** the student asks it, **Then** the assistant explicitly says it cannot answer from the document instead of inventing a response.
7. **Given** the assistant's AI service is unavailable (timeout, quota exhausted, or no connectivity), **When** the student asks a question, **Then** the system automatically falls back to the local model and still returns an answer without losing the document/chat context.
8. **Given** both the primary AI service and the local fallback model fail to respond, **When** the student asks a question, **Then** the assistant shows an explicit message that it is temporarily unavailable, and the question remains preserved in the chat for the student to retry later.

---

### User Story 2 - Topic management and spaced-repetition engine (Priority: P2)

As a student, I want to create and organize study topics by course and have the system
schedule my review items using a spaced-repetition algorithm, so I only see the
Flashcards and Bank Questions that are actually due.

**Why this priority**: This is the recurring habit loop of the whole app and the
business-logic core the course's testing rigor is measured against; every later feature
(trainer, exam, Feynman) feeds failures back into this engine.

**Independent Test**: Can be fully tested by creating a topic with Flashcards and Bank Questions, answering
them with each outcome (correct/incorrect/hard) over several simulated days, and
verifying the due-today/due-this-week counts and interval/ease-factor recalculation —
independent of Library, Trainer, Exam, or Feynman.

**Acceptance Scenarios**:

1. **Given** a student creates a new flashcard in a topic, **When** no review has happened yet, **Then** the card is due for review the same day it was created.
2. **Given** a student answers a card as correct, **When** the next review is recalculated, **Then** the new interval is greater than or equal to the previous interval (it never decreases).
3. **Given** a student answers a card as incorrect, **When** the next review is recalculated, **Then** the interval resets to a short value that is still a valid, non-negative, non-past date.
4. **Given** repeated incorrect or hard answers on a card, **When** its ease factor is recalculated, **Then** the ease factor never drops below 1.3.
5. **Given** a student opens a course or topic, **When** they view the review queue, **Then** they see counts of due spaced-repetition items today and this week, broken down by item type, topic, and course.
6. **Given** a Bank Question already has a future scheduled review date, **When** the student fails it in a Trainer or Exam session, **Then** its schedule is immediately reset by the incorrect-outcome rule, overriding the previously scheduled date.
7. **Given** a Bank Question already has a scheduled review date, **When** the student answers it correctly in a Trainer or Exam session (not the official P2 review), **Then** its next-review date, interval, and ease factor remain unchanged — only the official P2 review can advance the schedule on a correct answer.

---

### User Story 3 - Entrenador: untimed practice (Priority: P3)

As a student, I want to practice questions from a topic with no time limit or pressure,
to reinforce concepts before attempting a timed exam.

**Why this priority**: Depends on a question bank existing (introduced here) but is
lower risk and lower value than the Library/assistant and the repetition engine — it's a
practice layer on top of content that already needs to exist.

**Independent Test**: Can be fully tested by starting a trainer session on a topic with
existing bank questions, answering several questions, and confirming per-answer feedback
and that failed questions get flagged for priority review — independent of Exam or
Feynman.

**Acceptance Scenarios**:

1. **Given** a student has selected a topic, **When** they create or edit a Bank Question with a prompt, correct answer, and explanation, **Then** the question is saved in that topic's question bank and can be used by Trainer and Exam sessions.
2. **Given** a student selects a topic or course to practice, **When** the trainer session starts, **Then** questions are drawn from that topic/course's question bank.
3. **Given** a trainer session is in progress, **When** the student answers a question, **Then** there is no time limit and the student advances at their own pace.
4. **Given** the student submits an answer, **When** feedback is shown, **Then** it displays correct/incorrect plus an explanation before advancing to the next question.
5. **Given** the student answers a question incorrectly, **When** the answer is recorded, **Then** that question is marked for priority review in the spaced-repetition queue.

---

### User Story 4 - Timed exam simulator (Priority: P4)

As a student, I want to generate a mock exam from a topic or course with a configurable
time limit, to measure how ready I am before the real exam.

**Why this priority**: Builds directly on the question bank and repetition-queue
integration already proven in P3; it's the highest-pressure, most exam-like feature and
depends on those simpler pieces working first.

**Independent Test**: Can be fully tested by configuring an exam with a short time limit,
letting it run to timeout, and confirming automatic grading, the score report, and that
failed questions are queued for priority review — independent of Feynman.

**Acceptance Scenarios**:

1. **Given** a student configures an exam for a topic or course with a time limit, **When** the exam starts, **Then** questions are drawn from that topic/course's question bank.
2. **Given** an exam is in progress, **When** the configured time limit reaches zero, **Then** the exam automatically stops and grades whatever was answered up to that point.
3. **Given** an exam has ended, **When** the report is generated, **Then** it shows the total score and a breakdown of failed topics/questions.
4. **Given** the exam report identifies failed questions, **When** the report is saved, **Then** those questions are automatically marked for priority review in the spaced-repetition queue.
5. **Given** an exam is in progress, **When** the student closes and reopens the app before the time limit expires, **Then** the session resumes with the timer reflecting real elapsed time since it was left.
6. **Given** an exam is in progress, **When** the student closes the app and the time limit expires while away, **Then** reopening shows the exam as automatically stopped and graded at the moment it expired.

---

### User Story 5 - Feynman mode with AI evaluation (Priority: P5)

As a student, I want to explain a topic in my own words and have a language model
evaluate my explanation, flag knowledge gaps, and suggest what to review — optionally
grounded in the documents I uploaded for that topic.

**Why this priority**: The deepest, most valuable but also most failure-prone feature
(external AI dependency); it's built last so it can reuse the Library (for grounding) and
the repetition engine (for follow-up review) that the earlier stories establish.

**Independent Test**: Can be fully tested by submitting a topic explanation, confirming
structured feedback is returned, confirming citation to Library documents when
associated, and confirming the local-model fallback triggers and is disclosed when the
primary AI service is forced to fail — independent of Trainer/Exam.

**Acceptance Scenarios**:

1. **Given** a student writes a topic explanation in their own words, **When** they submit it, **Then** the system returns structured feedback covering what's correct, what's missing, and what's wrong.
2. **Given** the topic has documents associated in the Library, **When** the explanation is evaluated, **Then** the evaluation references those documents and can cite the relevant page.
3. **Given** the primary AI evaluation service fails due to timeout, quota exhaustion, or no connectivity, **When** the student submits an explanation, **Then** the system automatically falls back to the local model and the student does not lose their study session.
4. **Given** an evaluation has been returned, **When** it's displayed, **Then** the interface clearly indicates which engine (primary AI service or local fallback) produced it.
5. **Given** both the primary AI service and the local fallback model fail to respond, **When** the student submits an explanation, **Then** the system shows an explicit message that evaluation is temporarily unavailable, and preserves the explanation so the student can retry later without retyping it.

---

### Edge Cases

- What happens when a student uploads a non-PDF or corrupted file to the Library?
- What happens when a course/topic has no documents, no flashcards, or no bank questions yet and the student opens a feature that depends on them (assistant, trainer, exam, Feynman)?
- How does the system handle an empty or extremely long Feynman-mode explanation submission?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** (US1): System MUST allow a student to upload a PDF and associate it with exactly one topic, adding it to that topic's Library (the course is implied transitively through the topic).
- **FR-002** (US1): System MUST render an uploaded document in a paginated viewer with page navigation and zoom.
- **FR-003** (US1): System MUST let the student open an assistant as an overlay on the document viewer without leaving the document screen.
- **FR-004** (US1): The assistant MUST answer questions using only the content of the open document.
- **FR-005** (US1): Every assistant answer grounded in the document MUST include a citation to the specific source page.
- **FR-006** (US1): Tapping a page citation in an assistant answer MUST navigate the viewer to that page.
- **FR-007** (US1): When a question cannot be answered from the document's content, the assistant MUST state that explicitly instead of producing an unsupported answer.
- **FR-008** (US1, US5): Any call to the primary AI service MUST handle timeout, quota exhaustion, and no-connectivity by automatically falling back to a local model, without losing the student's in-progress session.
- **FR-009** (US2): System MUST let a student create and organize topics within a course.
- **FR-010** (US2): System MUST let a student create flashcards (front/back) within a topic.
- **FR-011** (US2): A newly created flashcard MUST be due for review on its creation date.
- **FR-012** (US2): System MUST let a student record one of three outcomes per flashcard review: correct, incorrect, or hard.
- **FR-013** (US2): System MUST recalculate each spaced-repetition item's (Flashcard or Bank Question) next-review interval and ease factor after every recorded outcome, such that a correct outcome never decreases the interval, an incorrect outcome resets the interval to a short non-negative, non-past value, and the ease factor never drops below 1.3. This rule applies uniformly to Flashcards and Bank Questions (see FR-018).
- **FR-014** (US2): System MUST show, per topic and per course, the count of spaced-repetition items due today and due within the current week, separated by item type (Flashcards and Bank Questions).
- **FR-015** (US3): System MUST let a student start an untimed trainer session scoped to a chosen topic or course.
- **FR-016** (US3): Trainer sessions MUST draw questions from the question bank of the chosen topic/course and MUST NOT impose a time limit.
- **FR-017** (US3): System MUST show immediate feedback (correct/incorrect plus explanation) after each trainer answer, before advancing to the next question.
- **FR-018** (US2, US3, US4): Bank Questions MUST be scheduled by the same spaced-repetition engine (next-review date, interval, ease factor) as Flashcards. An incorrectly answered Bank Question — whether in a Trainer session, an Exam session, or a normal spaced-repetition review — MUST immediately trigger the incorrect-outcome recalculation defined in FR-013, resetting its interval to a short non-negative, non-past value and re-applying the 1.3 ease-factor floor, overriding any previously scheduled future review date for that question. Conversely, a Bank Question answered correctly in a Trainer or Exam session MUST NOT modify its schedule (interval or ease factor) at all — the schedule only advances on a correct answer through the official P2 spaced-repetition review; Trainer/Exam correct answers are asymmetric with incorrect ones and leave the schedule untouched.
- **FR-019** (US4): System MUST let a student configure and start a timed exam scoped to a chosen topic or course, drawing questions from that topic/course's question bank.
- **FR-020** (US4): System MUST automatically stop an exam and grade all questions answered so far when the configured time limit reaches zero.
- **FR-021** (US4): System MUST produce a score report after an exam ends, showing total score and a breakdown of failed topics/questions.
- **FR-022** (US5): System MUST let a student submit a free-text explanation of a topic for AI evaluation.
- **FR-023** (US5): The evaluation MUST be structured to indicate what is correct, what is missing, and what is wrong in the submitted explanation.
- **FR-024** (US5): When the topic has associated Library documents, the evaluation MUST use them as reference and MUST be able to cite the relevant page.
- **FR-025** (US5): System MUST display which engine (primary AI service or local fallback model) produced each evaluation.
- **FR-026** (General): System MUST NOT require any user account beyond a single local user (no multi-user authentication).
- **FR-027** (General): System MUST persist all study data (courses, topics, flashcards, documents, question banks, session progress, scores) in a central store accessible from any device/browser the student uses.
- **FR-028** (General): All user-facing screens across the five user stories MUST meet WCAG 2.1 AA (color contrast, keyboard/touch navigation, screen-reader labels, focus management).
- **FR-029** (US3, US4): System MUST auto-save trainer and exam session progress continuously; reopening the app after closing MUST resume an in-progress trainer session at the same question, and MUST resume an in-progress exam session with its timer reflecting real elapsed time since it was left (auto-grading at timeout if the limit lapsed while away).
- **FR-030** (US1, US5): When both the primary AI service and the local fallback model fail to respond, the system MUST show an explicit message that the assistant/evaluation is temporarily unavailable, and MUST preserve the student's unanswered question (US1) or explanation (US5) so it can be retried later without being lost or requiring re-entry.
- **FR-031** (US3, US4): System MUST let the student manually create and edit Bank Questions within a topic, including the question prompt, correct answer, and explanation.

### Key Entities *(include if feature involves data)*

- **Course**: A university course the student is taking (e.g., IS-481); groups Topics.
- **Topic**: A study subject within a Course; has associated Documents, Flashcards, and Bank Questions.
- **Document**: An uploaded PDF, indexed for viewing and for assistant Q&A; belongs to exactly one Topic (its Course is implied transitively through that Topic).
- **Flashcard**: A front/back review item belonging to a Topic; carries scheduling state (next review date, current interval, ease factor, last recorded outcome).
- **Bank Question**: A question with a correct answer and explanation, belonging to a Topic; used by both Trainer and Exam sessions; scheduled by the same spaced-repetition engine as Flashcards (next review date, current interval, ease factor) — failing it in any context (normal review, Trainer, or Exam) immediately reschedules it via the incorrect-outcome rule (FR-013), overriding any previously computed future date; answering it correctly in Trainer/Exam leaves the schedule untouched, since only the official P2 review advances it on a correct answer.
- **Trainer Session**: An untimed practice run through a subset of a Topic/Course's Bank Questions.
- **Exam Session**: A timed run through a Topic/Course's Bank Questions, with a configured time limit, that produces a Score Report.
- **Score Report**: The total score and per-topic/per-question breakdown resulting from an Exam Session.
- **Feynman Submission**: A free-text explanation authored by the student for a Topic.
- **AI Evaluation**: Structured feedback (correct/missing/wrong) tied to a Feynman Submission or an assistant answer, tagged with which engine (primary AI service or local fallback) produced it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A student can go from opening a course to receiving an answer from the document assistant in under 2 minutes on a first attempt.
- **SC-002**: Across a test set of at least 20 representative questions, 100% of assistant answers grounded in a document include a correct page citation, and 100% of unanswerable questions are declined rather than answered with fabricated content.
- **SC-003**: Over a simulated 30-day study cycle, the review queue always matches exactly the set of spaced-repetition items (Flashcards and Bank Questions) whose next-review date is today or earlier — zero scheduling drift.
- **SC-004**: A student can complete a full untimed trainer session and receive feedback on every question with no navigation dead-ends.
- **SC-005**: 100% of timed exams stop grading at exactly the configured time limit, and the score report is available within 5 seconds of the exam ending.
- **SC-006**: 100% of Feynman-mode submissions receive a structured evaluation even when the primary AI service is forced to fail, with the producing engine disclosed every time.
- **SC-007**: A student can see, within one screen, how many spaced-repetition items are due today across all of their courses, separated by item type.
- **SC-008**: 100% of screens across all five user stories pass automated accessibility checks with zero critical violations.

## Assumptions

- Single-user, local/personal app: no multi-user authentication is in scope.
- Native push notifications and full offline support are explicitly out of scope for this feature set.
- Study data (courses, topics, flashcards, documents, question banks, session progress, scores) is persisted in a central store accessible from any device/browser the student uses; there is no offline-first requirement, consistent with full offline support being out of scope.
- Flashcards and question-bank items are authored manually by the student; there is no automatic generation of either from Library documents (confirmed choice for this scope).
- The spaced-repetition algorithm follows an SM-2-style model applied uniformly to both Flashcards and Bank Questions: a new item starts with a short initial interval and a standard default ease factor; a correct answer increases the interval and may increase ease, but only when recorded through the official P2 review — a correct answer on a Bank Question given during Trainer or Exam does not touch the schedule; an incorrect answer (from a normal review, a Trainer session, or an Exam session) resets the interval to a short value (e.g., 1 day) without going negative or into the past, overriding any previously scheduled future date; a "hard" answer keeps or slightly reduces interval/ease within the same non-negative, ≥1.3 bounds.
- The document assistant (US1) is scoped to the single document currently open in the viewer, not cross-document search across the whole Library.
- Course identifiers (e.g., IS-481, IS-483) are free-form labels the student defines; no institutional course-catalog integration is assumed.
- Both the document assistant (US1) and the Feynman evaluator (US5) are AI-backed and subject to the project constitution's AI Resilience principle: any primary-AI-service call must handle timeout, quota exhaustion, and no connectivity with an automatic local-model fallback.
- An exam's time limit is set by the student per exam (any positive duration); there is no fixed minimum or maximum beyond being a positive number.
