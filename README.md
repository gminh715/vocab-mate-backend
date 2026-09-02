# 📚 Vocab Mate

> **Master English vocabulary in authentic context through real-world news and an adaptive, AI-powered spaced repetition tutor.**

[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%20%7C%20MUI-61dafb?style=flat-square&logo=react)](https://github.com/gminh715/vocab-mate-frontend)
[![Backend](https://img.shields.io/badge/Backend-NestJS%2011%20%7C%20Prisma%207%20%7C%20PostgreSQL-e0234e?style=flat-square&logo=nestjs)](https://github.com/gminh715/vocab-mate-backend)
[![Algorithm](https://img.shields.io/badge/Algorithm-FSRS--4.5%20Spaced%20Repetition-4caf50?style=flat-square)](https://github.com/open-spaced-repetition/fsrs4anki)
[![AI Providers](https://img.shields.io/badge/AI%20Providers-Gemini%202.5%20%7C%20Groq%20Llama--3-ff6f00?style=flat-square&logo=google)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-Private%20%2F%20Unlicensed-gray?style=flat-square)](#-license)

---

## 📑 Table of Contents

- [Overview](#-overview)
- [Project Architecture & Repository Structure](#-project-architecture--repository-structure)
- [Key Features](#-key-features)
- [News Ingestion Pipeline](#-news-ingestion-pipeline)
  - [Ingestion Flowchart](#ingestion-flowchart)
  - [Ingestion Stages Explained](#ingestion-stages-explained)
- [Tutor AI Agent Loop](#-tutor-ai-agent-loop)
  - [Tutor Agent Flowchart](#tutor-agent-flowchart)
  - [Tutor Agent Workflow & Architecture Principles](#tutor-agent-workflow--architecture-principles)
- [Technology Stack](#-technology-stack)
  - [Frontend Application](#frontend-application)
  - [Backend API & AI Orchestration](#backend-api--ai-orchestration)
- [Data Models & Schema Architecture](#-data-models--schema-architecture)
- [Trust Boundaries & Security Guardrails](#-trust-boundaries--security-guardrails)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Backend Setup (NestJS)](#1-backend-setup-nestjs)
  - [2. Frontend Setup (React + Vite)](#2-frontend-setup-react--vite)
  - [Environment Configurations](#environment-configurations)
- [Testing & Quality Assurance](#-testing--quality-assurance)
- [License](#-license)

---

## 🌟 Overview

**Vocab Mate** is a modern, context-first English language learning platform. Traditional flashcard systems isolate words from the natural syntactic structures and journalistic nuances in which native speakers actually use them. Vocab Mate bridges this gap by transforming authentic, high-caliber news journalism (such as *The Guardian*) into personalized, level-appropriate vocabulary learning.

Learners read authentic articles, tap unfamiliar words directly within sentences, view contextual definitions and Vietnamese translations, and retain their vocabulary through an **adaptive AI Tutor agent** driven by the **Free Spaced Repetition Scheduler (FSRS-4.5)** algorithm.

---

## 🏛️ Project Architecture & Repository Structure

The system is structured as a clean full-stack architecture comprising a React frontend client and a NestJS backend server:

```text
vocab-mate/
├── vocab-mate-frontend/     # React 19 + Vite + Material UI single-page application
└── vocab-mate-backend/      # NestJS 11 + Prisma 7 + PostgreSQL REST API & AI orchestrator
```

### Repository Breakdown

| Repository | Tech Stack | Responsibilities |
| :--- | :--- | :--- |
| **Frontend** (`vocab-mate-frontend`) | React 19, Vite, TypeScript, Material UI 9, TanStack Query 5 | Responsive UI, distraction-free article reader with CEFR word highlights, contextual term drawer, interactive tutor session cards, streak calendars, FSRS memory distribution analytics, and client state caching. |
| **Backend** (`vocab-mate-backend`) | NestJS 11, TypeScript, Prisma 7, PostgreSQL, WinkNLP, FSRS-4.5 | Core REST API (`/api/v1`), JWT authentication (in-memory access + HttpOnly cookie refresh), Guardian news ingestion gateway, DOM sentence/term parsing, local NLP & CEFR evaluation, Cloudinary media storage, FSRS scheduling, and AI LLM agent orchestration (Gemini & Groq). |

---

## ✨ Key Features

- 📰 **Authentic News Reader**: Distraction-free reading experience with backend-sanitized HTML and stable DOM markers (`data-sentence-id`, `data-term-id`).
- 🎯 **Dynamic CEFR Highlighting**: Highlights vocabulary tailored to the user's CEFR proficiency (A1 to C2). Higher-difficulty words are visually highlighted to guide vocabulary acquisition.
- 🔍 **Contextual Word Lookup**: Click any marked word to reveal its IPA pronunciation, Vietnamese meaning specific to the sentence, contextual English definition, part of speech, and usage examples.
- 💾 **Context-Bound Vocabulary Vault**: Words are permanently linked to the exact sentence and article where discovered, organized into custom user collections.
- 🤖 **Adaptive AI Tutor Agent**: Daily personalized review sessions based on the learner's time budget (5, 10, 15, or 20 minutes) and current memory retention state.
- 🧠 **4 Dynamic Question Types**:
  - `NEW` words $\rightarrow$ **Multiple Choice** (4 distinct options A–D).
  - `LEARNING` words $\rightarrow$ **Contextual Cloze** (fill-in-the-blank `___`).
  - `REVIEW` words $\rightarrow$ **Typed Recall** (prompted in Vietnamese, typed in English).
  - `RELEARNING` (lapsed words) $\rightarrow$ **Micro-Lesson Retest** (fascinating real-world mini-stories embedding the target word, followed by instant verification).
- 💡 **Upfront Warmup Trivia Facts**: When reviewing lapsed words, the agent generates captivating real-world trivia facts connecting to the target vocabulary to activate prior memory.
- 📈 **FSRS Spaced Repetition**: Memory stability, difficulty, review intervals, and scheduled due dates are mathematically calculated using `ts-fsrs`.
- 📊 **Learner Analytics & Streaks**: Real-time tracking of retention rate, FSRS memory distribution, study streaks, and CEFR progress.
- 🛠️ **Admin Ingestion & Publishing Studio**: Search The Guardian API, import articles as drafts, run automated sentence parsing and CEFR difficulty analysis, and publish live content.

---

## 📰 News Ingestion Pipeline

The News Ingestion Pipeline discovers, deduplicates, sanitizes, tokenizes, and linguistically analyzes authentic journalism before making it available to learners.

### Ingestion Flowchart

```mermaid
flowchart TD
    subgraph Discovery["1. Discovery & Fetching"]
        A["Ingestion Trigger<br/>(Admin UI / Scheduled API Sync)"] --> B["News Source Gateway<br/>(The Guardian Open Platform API)"]
        B --> C["Fetch Metadata & Raw Article Payloads<br/>(Bounded Batch: 1-10 articles)"]
    end

    subgraph Normalization["2. Normalization & Sanitization"]
        C --> D["Duplicate Check via External ID<br/>(articles.external_id)"]
        D -- "Duplicate Exists" --> D_SKIP["Skip Import & Log"]
        D -- "Unique Article" --> E["HTML Sanitization & Extraction<br/>(HtmlSanitizerHelper whitelist)"]
        E --> F["Generate Canonical Slug & Invariant Hash<br/>(SHA-256 Suffix)"]
        F --> G["Resolve / Create Category<br/>(CategoriesService)"]
        G --> H["Create Article Draft in DB<br/>(Status: DRAFT, contentVersion: 1)"]
    end

    subgraph Parsing["3. Sentence Parsing & Annotation"]
        H --> I["Parse Reading Sentences<br/>(SentenceParserHelper)"]
        I --> J["Annotate DOM with Sentence IDs<br/>(data-sentence-id)"]
        J --> K["Persist ArticleSentence Records<br/>(Database Storage)"]
    end

    subgraph Analysis["4. Local NLP & CEFR Complexity Analysis"]
        K --> L["Claim Concurrency Lock on Draft<br/>(claimArticleAnalysis)"]
        L --> M["Local NLP Tokenization & Lemmatization<br/>(WinkNLP + wink-eng-lite-web-model)"]
        M --> N["Classify CEFR Vocabulary Levels (A1-C2)<br/>(cefr-analyzer)"]
        N --> O["Compute Overall Article CEFR Complexity"]
        O --> P["Extract Candidate Terms & Tag DOM<br/>(Inject data-term-id via TermMarkerHelper)"]
        P --> Q["Persist ArticleSentenceTerm Records"]
    end

    subgraph Publication["5. AI Enrichment & Publication Gate"]
        Q --> R{"Publication Gate Validation<br/>(Sentences > 0, Terms tagged, CEFR evaluated)"}
        R -- "Checks Failed" --> R_FAIL["Retain Draft + Store Diagnostics"]
        R -- "Checks Passed" --> S["Atomic Publication<br/>(Status: PUBLISHED)"]
        S --> T["On-Demand / Lazy AI Term Enrichment<br/>(Triggered upon reader click or pre-cache)"]
        T --> U["Primary LLM: Gemini 2.5 Flash"]
        U -- "Quota / Rate Limit / Timeout" --> V["Fallback LLM: Groq Llama-3.3-70B"]
        U -- "Success" --> W["Persist Contextual Translation, IPA & Examples<br/>(Vietnamese meaning, POS, CEFR)"]
        V --> W
    end
```

### Ingestion Stages Explained

1. **Source Discovery**:
   - The backend queries **The Guardian Open Platform API** by section, keywords, date ranges, and publication order (`newest`, `oldest`, `relevance`).
2. **Deduplication & Canonicalization**:
   - Each article is checked against `articles.external_id`.
   - Slugs are generated from normalized title strings appended with a 12-character SHA-256 digest of the source URL (`importSlug`) to guarantee invariant URLs.
3. **HTML Sanitization**:
   - Raw HTML is scrubbed of dangerous tags, embedded scripts, and trackers using strict tag allowlists via `HtmlSanitizerHelper`.
4. **Sentence Segmentation**:
   - `SentenceParserHelper` segments sanitized text into grammatical reading sentences, wrapping each in `<span data-sentence-id="uuid">`.
5. **Local NLP & CEFR Analysis**:
   - **WinkNLP** extracts lemmas, parts of speech, and eliminates punctuation and stopwords.
   - **`cefr-analyzer`** matches tokens against Oxford CEFR lexicons (A1, A2, B1, B2, C1, C2) and evaluates total article readability complexity.
   - Identified vocabulary terms are stamped into the markup with `<span data-term-id="uuid">` and saved as `ArticleSentenceTerm` rows.
6. **Lazy AI Enrichment**:
   - When a user inspects a term in the reader, NestJS calls `AiService.enrichContextualTerm()`.
   - **Gemini 2.5 Flash** (with **Groq Llama-3.3-70B** as an automatic failover) enriches the term with IPA pronunciation, Vietnamese meaning specific to the sentence, contextual English definition, and two usage examples.

---

## 🤖 Tutor AI Agent Loop

The Tutor AI Agent orchestrates a daily adaptive vocabulary study loop. It determines which vocabulary items need review, crafts dynamic contextual learning tasks, and updates the learner's spaced repetition memory matrix.

### Tutor Agent Flowchart

```mermaid
flowchart TD
    subgraph SessionInit["1. Session Initialization & Daily Budgeting"]
        A["Learner Starts / Resumes Session<br/>(POST /api/v1/tutor/session)"] --> B["Resolve Study Date<br/>(Timezone: Asia/Ho_Chi_Minh)"]
        B --> C{"Active Session Exists Today?"}
        C -- "Yes (ACTIVE)" --> D["Restore Persisted Session & Active Item"]
        C -- "No / Fresh Day" --> E["Compute Session Budget<br/>(dailyStudyMinutes -> targetActivityCount)"]
        E --> F["Allocate New Word Target<br/>(~20% of activities, min 1)"]
        F --> G{"Any RELEARNING Words Due?"}
        G -- "Yes" --> H["AI Generates Warmup Trivia Facts<br/>(Real-world facts embedding target words)"]
        G -- "No" --> I["Create TutorSession Record<br/>(Status: ACTIVE)"]
        H --> I
    end

    subgraph CandidateSelection["2. FSRS Priority Queue & Item Dispatch"]
        I --> J["Fetch Prioritized Candidate Pool<br/>(Bounded Limit: 50 items)"]
        D --> J
        J --> K["Priority Ordering:<br/>1. RELEARNING (due, nextReviewAt <= now)<br/>2. LEARNING (due, nextReviewAt <= now)<br/>3. REVIEW (due/overdue, oldest first)<br/>4. NEW (oldest savedAt first)"]
        K --> L["Select Target Candidate<br/>(Deduplicate words already tested in this session)"]
        L --> M{"Map FSRS State to Question Type"}
        M -- "NEW" --> N1["MULTIPLE_CHOICE<br/>(4 distinct options A-D)"]
        M -- "LEARNING" --> N2["CONTEXTUAL_CLOZE<br/>(Sentence with '___' blank)"]
        M -- "REVIEW" --> N3["TYPED_RECALL<br/>(Vietnamese prompt -> Type English word)"]
        M -- "RELEARNING" --> N4["MICRO_LESSON_RETEST<br/>(Mini-story trivia + instant retest)"]
    end

    subgraph AIGeneration["3. Bounded AI Question Generation"]
        N1 & N2 & N3 & N4 --> O["Structured AI Generation Request<br/>(Zod & Strict JSON Schemas)"]
        O --> P["Primary Provider: Gemini 2.5 Flash"]
        P -- "Quota / Timeout / Error" --> Q["Fallback Provider: Groq Llama-3.3-70B"]
        P -- "Success" --> R["Parse & Segregate Payloads"]
        Q --> R
        R --> S1["Public questionPayload<br/>(Prompt, options, cloze — NO correct answer)"]
        R --> S2["Private gradingSpec<br/>(Stored server-side: answer, explanation, feedback)"]
        S1 & S2 --> T["Persist TutorSessionItem<br/>(Status: PENDING)"]
    end

    subgraph Interaction["4. Learner Interaction & Answer Submission"]
        T --> U["Learner Solves Question<br/>(Client records responseTimeMs, hintUsed)"]
        U --> V["Submit Answer<br/>(POST /items/:itemId/answer)"]
    end

    subgraph Evaluation["5. Deterministic Grading & FSRS Scheduling"]
        V --> W["Deterministic Server-Side Grading<br/>(Exact case-insensitive trim normalization)"]
        W --> X["Compute FSRS Rating (ts-fsrs Grade):<br/>- Incorrect -> Again (1)<br/>- Hint used OR responseTime >= 30s -> Hard (2)<br/>- MULTIPLE_CHOICE correct -> Hard ceiling (2)<br/>- Fast TYPED_RECALL (<5s) & reps>=3 -> Easy (4)<br/>- Standard Correct -> Good (3)"]
        X --> Y["Run FSRS Algorithm (ts-fsrs):<br/>- Recompute stability & difficulty<br/>- Calculate next interval (1-60+ days)<br/>- Assign nextReviewAt timestamp"]
        Y --> Z["Atomic Database Transaction:<br/>- Update UserVocabulary FSRS fields<br/>- Mark TutorSessionItem as ANSWERED<br/>- Store feedbackVi & accuracy"]
    end

    subgraph LoopCheck["6. Loop Condition & Completion"]
        Z --> AA{"Session Target Reached?<br/>(answeredCount >= targetActivityCount)"}
        AA -- "No (Activities Remain)" --> L
        AA -- "Yes (Session Completed)" --> AB["Mark Session COMPLETED<br/>(completedAt = now)"]
        AB --> AC["Generate Summary Statistics<br/>(Accuracy %, Words Learned, Retention, Streak)"]
    end
```

### Tutor Agent Workflow & Architecture Principles

1. **Deterministic Grading Guardrail**:
   - The LLM **never** grades user answers. LLMs are susceptible to hallucinations, tone bias, and inconsistent evaluation.
   - Grading is executed 100% deterministically on the NestJS backend via `normalizeTypedAnswer()` (strict whitespace trimming and lowercase comparison).
2. **Asymmetric Data Protection**:
   - `questionPayload` (sent to client) contains only the prompt, options, or sentence blank.
   - `gradingSpec` (correct answer, pedagogical explanations, teacher feedback) is stored server-side and is **never** serialized to the frontend while the item is `PENDING`.
3. **FSRS-4.5 Multi-Factor Rating Policy**:
   - **`Again` (1)**: Incorrect response. Reschedules item for rapid relearning.
   - **`Hard` (2)**: Correct response, but required a hint, took $\ge 30\text{s}$, or was a Multiple Choice recognition question.
   - **`Good` (3)**: Accurate recall under normal pacing without hints.
   - **`Easy` (4)**: Instantaneous typed recall ($< 5\text{s}$) on an established word reviewed at least 3 times.
4. **Fascinating Micro-Lessons for Lapsed Words**:
   - When reviewing a forgotten word (`RELEARNING`), the agent generates an engaging real-world mini-story or trivia fact (archaeology, biology, astronomy, history) embedding the target word in bold, followed by an immediate contextual re-test.
5. **Session Invariant Guarantee**:
   - Exactly one session per user per day based on `Asia/Ho_Chi_Minh` timezone. Active sessions are automatically resumed without creating duplicate records.

---

## 🧰 Technology Stack

### Frontend Application

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/) | Modern reactive UI library with high-speed HMR development server |
| **Language** | [TypeScript 6](https://www.typescriptlang.org/) | Strict static typing across components, hooks, and API contracts |
| **Design System**| [Material UI 9 (MUI)](https://mui.com/) | Accessible component system with custom theme tokens and dark mode support |
| **Rich Text Editor**| [Tiptap 3](https://tiptap.dev/) | Headless, extensible rich-text editor for administrative article editing |
| **Data Fetching** | [TanStack Query 5](https://tanstack.com/query) | Server-state caching, automatic cache invalidation, and deduplication |
| **Routing** | [React Router 7](https://reactrouter.com/) | Client-side routing with role-based route guards and URL search parameters |
| **Forms & Validation**| [React Hook Form 7](https://react-hook-form.com/) + [Zod 4](https://zod.dev/) | High-performance, schema-validated forms |
| **HTTP Client** | [Axios](https://axios-http.com/) | HTTP client with automatic silent JWT refresh retry interceptor |
| **Internationalization**| [i18next](https://www.i18next.com/) + `react-i18next` | Multilingual support (Vietnamese & English) |
| **Testing** | [Vitest 4](https://vitest.dev/) + Testing Library | Unit and component integration tests |

### Backend API & AI Orchestration

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [NestJS 11](https://nestjs.com/) | Scalable, modular enterprise TypeScript backend architecture |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) + [Prisma 7](https://www.prisma.io/) | Relational database with multi-file Prisma schemas & type-safe queries |
| **NLP Engine** | [WinkNLP](https://winkjs.org/) | In-memory English tokenization, lemmatization, and POS tagging |
| **CEFR Scoring** | [`cefr-analyzer`](https://www.npmjs.com/package/cefr-analyzer) | Lexical difficulty classification and overall article readability scoring |
| **Spaced Repetition**| [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) | Free Spaced Repetition Scheduler algorithm implementation |
| **AI Providers** | [Google Gemini 2.5 Flash](https://ai.google.dev/) + [Groq](https://groq.com/) | Primary structured LLM with high-speed Llama-3.3-70B failover fallback |
| **Media Storage** | [Cloudinary](https://cloudinary.com/) + [Multer](https://github.com/expressjs/multer) | Cloud media storage for user profile avatar uploads |
| **Security & Headers**| [Helmet](https://helmetjs.github.io/) + [Throttler](https://docs.nestjs.com/security/rate-limiting) | Security headers, strict CORS, and API rate limiting |
| **API Documentation**| [Swagger / OpenAPI](https://swagger.io/) | Auto-generated interactive documentation at `/api/docs` |
| **Testing** | [Jest 30](https://jestjs.io/) + [Supertest 7](https://github.com/ladjs/supertest) | Unit, service, and end-to-end HTTP integration tests |

---

## 🗄️ Data Models & Schema Architecture

Vocab Mate uses PostgreSQL with the `pgcrypto` (UUID generation) and `citext` (case-insensitive email/slugs) extensions. Schemas are modularly organized in `prisma/models/`:

```text
prisma/models/
├── articles.prisma        # Articles, parsed reading sentences, sentence vocabulary terms
├── tutor.prisma           # Tutor sessions, dynamic session items, grading specs
├── vocabularies.prisma    # User-saved vocabulary, FSRS card state, review counters
├── collections.prisma     # Thematic vocabulary collections and item joins
├── reading.prisma         # User reading history, completion state, scroll progress
├── categories.prisma      # Article categories (e.g., Science, Technology, Culture)
├── users.prisma           # User profiles, CEFR levels, daily study targets, credentials
└── enums.prisma           # Enums: CefrLevel, FsrsCardState, TutorQuestionType, etc.
```

### Key Relational Entities

- **`Article`**: Stores `contentHtml`, `contentVersion`, `cefrLevel`, and publication state (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- **`ArticleSentence`**: Child of `Article`. Segmented sentence marked with `data-sentence-id`.
- **`ArticleSentenceTerm`**: Child of `ArticleSentence`. Identified vocabulary tagged with `data-term-id`, lemma, part of speech, and CEFR level.
- **`UserVocabulary`**: Links a user to an `ArticleSentenceTerm`. Stores a contextual snapshot of the word in its original sentence alongside full FSRS memory parameters:
  - `fsrsState`: `NEW`, `LEARNING`, `REVIEW`, or `RELEARNING`.
  - `fsrsStability`, `fsrsDifficulty`, `fsrsScheduledDays`, `reviewCount`, `lapseCount`.
  - `nextReviewAt`: Exact UTC timestamp for the next review due date.
- **`TutorSession`**: Daily study session record unique by `[userId, studyDate]`.
- **`TutorSessionItem`**: Individual activity within a session holding:
  - `questionPayload`: Public JSON sent to the frontend.
  - `gradingSpec`: Server-only JSON containing correct answers and pedagogical explanations.
  - `fsrsRating`: Numerical rating (1–4) assigned after deterministic evaluation.

---

## 🔒 Trust Boundaries & Security Guardrails

1. **Authentication & Session Tokens**:
   - Access tokens are stored **in-memory only** on the frontend client (never in `localStorage` or `sessionStorage`).
   - Refresh tokens are transmitted via an **`HttpOnly`, `SameSite=Lax`, `Secure`** cookie.
   - Axios request interceptors automatically refresh expired tokens concurrently, queuing in-flight requests and retrying failed calls exactly once.
2. **Zero-Trust AI Guardrails**:
   - LLMs are treated as untrusted data generators.
   - All AI responses are validated through strict **Zod schemas** before database persistence.
   - Prompts include explicit boundary instructions preventing prompt injection from article texts.
   - AI outputs never determine authorization, scores, user roles, or grading correctness.
3. **Bounded External Requests**:
   - The Guardian API queries enforce bounded pagination sizes, timeout protections, and safe error masking.

---

## 🚀 Getting Started

### Prerequisites

Ensure the following tools are installed on your system:

- **Node.js**: `v20.x` or `v22.x` (LTS)
- **npm**: `v10.x` or higher
- **PostgreSQL**: `v15+` with `pgcrypto` and `citext` enabled
- **API Keys**:
  - [The Guardian Open Platform API Key](https://open-platform.theguardian.com/access/)
  - [Google AI Studio (Gemini) API Key](https://aistudio.google.com/)
  - [Groq Cloud API Key](https://console.groq.com/)
  - *(Optional)* [Cloudinary Account](https://cloudinary.com/) (for user avatar uploads)

---

### 1. Backend Setup (NestJS)

```bash
# Navigate to backend directory
cd vocab-mate-backend

# Install dependencies
npm ci

# Configure environment variables
cp .env.example .env

# Validate Prisma models and generate Prisma Client
npm run prisma:validate
npm run prisma:generate

# Apply database migrations
npx prisma migrate deploy

# (Optional) Seed initial categories, sample articles, and test accounts
npm run prisma:seed

# Start backend in development watch mode
npm run start:dev
```

The NestJS backend will listen on `http://localhost:3000`.  
Swagger interactive API documentation will be accessible at: `http://localhost:3000/api/docs`.

---

### 2. Frontend Setup (React + Vite)

```bash
# Open a new terminal and navigate to frontend directory
cd vocab-mate-frontend

# Install dependencies
npm ci

# Configure environment variables
cp .env.example .env

# Start frontend development server
npm run dev
```

The React frontend will be accessible at `http://localhost:5173`.

---

### Environment Configurations

#### Backend (`vocab-mate-backend/.env`)

```ini
# Application
NODE_ENV=development
PORT=3000
API_BASE_PATH=/api/v1
CORS_ORIGINS=http://localhost:5173

# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/vocab_mate?schema=public"

# Authentication & JWT
JWT_ACCESS_SECRET="your-high-entropy-access-secret-minimum-32-characters"
JWT_REFRESH_SECRET="your-high-entropy-refresh-secret-minimum-32-characters"
JWT_ACCESS_EXPIRES_IN=900s
JWT_REFRESH_EXPIRES_IN=7d

# AI Providers
GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-2.5-flash"
GROQ_API_KEY="gsk_..."
GROQ_MODEL="llama-3.3-70b-versatile"

# External Sources
GUARDIAN_API_KEY="your-guardian-api-key"

# Cloudinary (Avatar Storage)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"
```

#### Frontend (`vocab-mate-frontend/.env`)

```ini
VITE_API_BASE_URL="http://localhost:3000/api/v1"
VITE_API_PROXY_TARGET="http://localhost:3000"
```

---

## 🧪 Testing & Quality Assurance

### Backend Quality Checks

```bash
cd vocab-mate-backend

# Validate Prisma schemas
npm run prisma:validate

# Unit & service tests
npm test

# End-to-end integration tests (requires PostgreSQL)
npm run test:e2e

# Code formatting and static lint checks
npm run lint

# Production build verification
npm run build
```

### Frontend Quality Checks

```bash
cd vocab-mate-frontend

# TypeScript type checking
npm run typecheck

# ESLint inspection
npm run lint

# Component and unit tests with Vitest
npm test

# Production build bundle check
npm run build
```

---

## 📄 License

This repository and its sub-projects are private and proprietary.  
All rights reserved. Currently `UNLICENSED`.
