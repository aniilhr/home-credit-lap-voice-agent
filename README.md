# Home Credit LAP Qualification Voice Agent

System prompt, live test console and evaluation suite for an outbound voice agent that qualifies existing Home Credit customers for a pre-approved Loan Against Property (LAP) offer. Built for the SalesAgents AI – AI Intern (Prompt Engineer) assignment.

## Problem

Home Credit wants to call existing customers about a pre-approved LAP offer of up to ₹75 lakh and run a preliminary eligibility check before a senior loan expert takes over. The call has to feel like a conversation with an advisor, not a questionnaire. Customers answer in full sentences, interrupt, answer out of order and correct themselves. The agent still has to apply the eligibility rules exactly.

## Objective

1. Verify the customer and check they can talk. If they are busy, capture a callback time.
2. Present the offer as a reward for their loyalty.
3. Route existing-loan and EMI-reduction cases to a loan-transfer specialist.
4. Collect all 7 eligibility items, remembering anything said out of order.
5. Disqualify immediately when a rule fails.
6. Hand off to a senior loan expert only after all 7 items are answered and passing.

## How it works

The agent is the system prompt running on a large language model; no replies are scripted. The repository adds two layers around the prompt so its behaviour can be tested and measured:

| Layer | What it does | Where |
|---|---|---|
| **Agent** | Gemini runs [`prompts/system-prompt.md`](prompts/system-prompt.md) with every variable filled for the call. It hangs up through an `end_call` function, just as on Retell or Bolna. | `src/llm/agent.js` |
| **State tracker** | After each customer turn, a second temperature-0 Gemini call extracts the 7 eligibility facts as schema-constrained JSON. | `src/llm/tracker.js` |
| **Rule guard** | Deterministic code judges each agent turn against the brief: handoff gate, immediate disqualification, transfer routing, the ₹75 lakh limit, no invented rates, and voice style. | `src/llm/audit.js`, `src/engine/rules.js` |

The tracker and rule guard let model behaviour be graded with code instead of by eye. They are test tooling only: on a voice platform the agent runs from the prompt alone.

There is also a **rules engine** (`src/engine/`), a deterministic reference implementation of the same flow. It uses pattern matching and fixed reply templates, so it is not AI. It exists so the business logic can be unit-tested offline, and the console falls back to it when no API key is set.

## Voice agent flow

```
Greeting → Verify customer ─┬─ wrong person ──────────────► end, no details shared
                            └─ verified → Good time? ─┬─ busy → callback time → end
                                                       └─ yes → Offer (up to ₹75 lakh)
                                                               → Loan already on property?
                                                                  ├─ yes / reduce EMI → transfer specialist → end
                                                                  └─ no → 7-item checklist
                                                                           ├─ rule fails → disqualify → end
                                                                           ├─ > ₹75 lakh → offer ₹75 lakh (no → end)
                                                                           └─ all 7 pass → senior loan expert → end
```

The full Mermaid diagram is in [`docs/conversation-flow.md`](docs/conversation-flow.md).

## Eligibility rules

| # | Item | Eligible | Not eligible |
|---|---|---|---|
| 1 | Property type | Residential, Commercial, Industrial | Agricultural |
| 2 | Ownership | Sole, Joint | — |
| 3 | Original documents | Available | Not available |
| 4 | Loan amount | Up to ₹75 lakh | Above ₹75 lakh → offer ₹75 lakh instead |
| 5 | Occupation + income mode | Salaried or self-employed, income via bank | Income in cash |
| 6 | Market value | Captured only | No threshold |
| 7 | Tenure | 3–15 years inclusive | Below 3 or above 15 |

The brief sets no minimum property value, interest rate, credit score, age or income requirement, so none is applied. Details and interpretation notes: [`docs/eligibility-rules.md`](docs/eligibility-rules.md).

## State management

The prompt tells the model to keep a private qualification state and run the same steps after every customer reply:

1. **Extract** every fact in the reply, including answers to questions not yet asked.
2. **Store** them. The latest clear answer wins, and uncertain answers stay `UNKNOWN`.
3. **Check rules** and disqualify immediately on a failure.
4. **Check transfer intent**: an existing loan on the property, or a request to reduce the current EMI.
5. **Ask only the earliest unanswered item**, so nothing is asked twice and skipped items are picked up later.

State fields: `customer_verified`, `property_type`, `ownership_status`, `documents_available`, `loan_amount`, `requested_loan_amount`, `occupation`, `income_mode`, `market_value`, `tenure`, `existing_property_loan`, `emi_reduction_request`, `disqualified`, `transfer_required`, `callback_time`.

## Quick start

Requires Node.js 20+. There are no npm dependencies to install.

```bash
cp .env.example .env     # then paste your key: GEMINI_API_KEY=...
npm start                # http://127.0.0.1:4173/web/
```

Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). In the console, open **Live call**, fill in the customer and agent names, and start talking: type, or use the mic in Chrome or Edge. Turn on spoken replies with the speaker icon. The side panels show the tracked qualification state and the rule-guard result for every turn.

Without a key, the console runs the offline rules engine and says so clearly.

## Testing

| Command | What it runs | Needs a key |
|---|---|---|
| `npm test` | 122 automated tests: rule boundaries, the rules engine, 25 scripted scenarios, prompt checks, the Gemini client (mocked HTTP), the tracker, the rule guard and the API server | No |
| `npm run eval:llm` | The 25 scripted scenarios against the **live Gemini agent**. Each call is graded on how it ended and on the extracted facts, using the deterministic rules. Report: `build/llm-eval-report.json` | Yes |
| `npm run eval:llm -- --only S02,S10` | Selected scenarios only | Yes |

Live evals cost real API calls: roughly (customer turns + 2) requests per scenario. Model output varies between runs, so treat the pass rate as a measurement rather than a guarantee. A scripted customer line can also land on a question the model asked in a different order.

The live-call test plan for the voice platform is in [`docs/test-scenarios.md`](docs/test-scenarios.md). Results go in [`submission/call-log.md`](submission/call-log.md).

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `GEMINI_API_KEY` | Enables live AI mode and `eval:llm` | — |
| `GEMINI_MODEL` | Gemini model id | `gemini-flash-latest` |
| `GEMINI_TEMPERATURE` | Agent temperature (tracker always uses 0) | `0.4` |
| `GEMINI_TIMEOUT_MS` | Per-request timeout | `30000` |
| `GEMINI_THINKING` | Reasoning depth: `low`/`high`, or a token budget such as `0` for 2.5-series models | model default |
| `PORT`, `HOST` | Console server address | `4173`, `127.0.0.1` |

`.env` is git-ignored. The key stays on the local server: it is sent to Google in a request header and never reaches the browser.

## Project structure

```
prompts/system-prompt.md   Production system prompt (paste into Retell / Bolna)
src/llm/                   Gemini client, agent turn, state tracker, rule guard, live eval
src/engine/                Rules, state helpers and the offline reference engine
src/server/                Local API + static server, .env loader
src/scenarios/             25 scripted calls shared by tests, console and live eval
src/prompt/                Prompt variables and renderer
web/                       Console UI (vanilla JS modules, no build step)
scripts/                   serve, eval-llm, render-prompt
tests/                     Automated tests (node:test)
docs/                      Flow, rules, test matrix, transcripts, platform setup
submission/                Call log template for recordings and transcripts
```

## Voice platform setup

See [`docs/voice-platform-setup.md`](docs/voice-platform-setup.md). In short:

1. Create an agent on Retell AI or Bolna and paste the prompt. For Bolna's `{variable}` syntax, use `npm run render:prompt -- --single-brace`.
2. Set the dynamic variables and pick a voice that matches `agent_gender`.
3. Enable the end-call function.
4. Record the scripted test calls and share the recordings and transcripts through a public link.

## Implemented vs. requires access

| Implemented in this repository | Requires your account / key |
|---|---|
| System prompt with all 11 required variables | Gemini API key for live AI mode and `eval:llm` |
| Live AI console: Gemini agent, voice in/out, state tracker, rule guard | Agent created on Retell AI / Bolna with a voice |
| Rules engine, 25 scenarios, 122 automated tests | Recorded test calls and platform transcripts |
| Prompt renderer for double- and single-brace platforms | Public link to recordings and call logs |

## Submission checklist

- [x] System prompt text — `prompts/system-prompt.md`
- [x] All 7 eligibility items, disqualification, transfer, busy and ₹75 lakh logic
- [x] Dynamic variables: company, customer, agent name and gender, date/day/time, RAG context, language, history, utterance
- [x] Test scenarios and expected behaviour documented
- [ ] `npm run eval:llm` run with your Gemini key; prompt fixed for any failures
- [ ] Agent created on Retell AI / Bolna with a professional voice
- [ ] Test calls recorded across the scenarios in `submission/call-log.md`
- [ ] Recordings and transcripts uploaded to a public folder; link added to the submission
