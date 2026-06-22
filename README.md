# Care CRM AI — Technical Assessment

## AI-Focused Full Stack Developer | Accodal

---

## Overview

This project implements the AI layer of a CRM and operating system for residential care facilities. It includes a reusable LLM harness, a multi-agent swarm for resident intake, and a dynamic incident reporting workflow — all built on the Anthropic API.

---

## Architecture

```
src/
├── harness.ts                  # Core LLM harness (retry, circuit breaker, logging, timeout)
└── agents/
    ├── orchestrator.ts         # Intake orchestrator — coordinates all sub-agents
    ├── medicalAgent.ts         # Parses and summarizes clinical notes
    ├── complianceAgent.ts      # Validates care plans against state regulations
    ├── familyAgent.ts          # Drafts plain-language family welcome summaries
    └── incidentWorkflow.ts     # Incident classification, routing, validation loop
```

---

src/

├── harness.ts # Core LLM harness (retry, circuit breaker, logging, timeout)
└── agents/
├── orchestrator.ts # Intake orchestrator — coordinates all sub-agents
├── medicalAgent.ts # Parses and summarizes clinical notes
├── complianceAgent.ts # Validates care plans against state regulations
├── familyAgent.ts # Drafts plain-language family welcome summaries
└── incidentWorkflow.ts # Incident classification, routing, validation loop

---

## Key Design Decisions

### LLM Harness (`harness.ts`)

All agents route every API call through a single harness module. This enforces consistent behavior across the system:

- **Exponential backoff retry**: on 429 (rate limit), 500, and 529 errors, retries up to 3 times with 1s → 2s → 4s delays
- **Circuit breaker**: opens after 5 consecutive failures, blocks calls for 30s, then enters HALF_OPEN to test recovery
- **Structured logging**: every request and response is logged as JSON with timestamp and severity level
- **Sensitive field redaction**: fields like `apiKey`, `token`, `ssn`, `dateOfBirth` are automatically replaced with `[REDACTED]` before logging
- **Configurable timeout**: defaults to 30s per call, with graceful fallback on expiry

### Agent Swarm — Resident Intake

The orchestrator runs three specialized sub-agents in sequence:

1. **Medical agent** — parses raw clinical notes into a structured care summary
2. **Compliance agent** — validates the care plan against state-specific regulations
3. **Family agent** — drafts a warm, plain-language welcome letter for the resident's family

If any sub-agent fails, the orchestrator flags it and continues with the remaining agents. The final result always includes a `failures` array and a `success` boolean so the caller knows exactly what completed and what didn't.

### Incident Reporting Workflow

Triggered when a staff member files an incident report:

1. **Classification** — LLM classifies the incident into one of 7 categories (FALL, MEDICATION_ERROR, BEHAVIORAL, etc.)
2. **Routing** — deterministic routing to the correct regulatory notification path based on classification
3. **Validation loop** — LLM checks for required fields based on incident type; loops until valid or max iterations reached
4. **Loop guard** — hard cap of 3 iterations prevents runaway loops; triggers human escalation if not converged
5. **Audit trail** — every step is recorded as structured JSON with timestamps

---

## Setup

### Prerequisites

- Node.js v18+
- Anthropic API key (get one at console.anthropic.com)

### Installation

```bash
git clone <repo-url>
cd care-crm-ai
npm install
```

Create a `.env` file in the root:
ANTHROPIC_API_KEY=your_api_key_here

### Run

```bash
npm run dev
```

---

## Demonstrated Behaviors

The default `src/index.ts` runs two incident workflow tests:

- **Test 1** — Complete report: classifies, routes, validates in one iteration → `COMPLETE`
- **Test 2** — Incomplete report: validation fails 3 times, loop guard triggers → `ESCALATED`

To run the full intake agent swarm, swap `src/index.ts` for the orchestrator demo:

```typescript
import { runIntakeOrchestrator } from "./agents/orchestrator";
```

---

## Tech Stack

- TypeScript / Node.js
- Anthropic SDK (`@anthropic-ai/sdk`)
- ts-node (development runner)

---

## Security Notes

- API keys are stored in `.env` and never committed to version control (`.gitignore` excludes `.env`)
- Sensitive fields are redacted from all logs at the harness level
- No secrets are hardcoded anywhere in the codebase
