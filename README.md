# Home Credit LAP Qualification Voice Agent

System prompt, qualification logic and test suite for an outbound voice agent that qualifies existing Home Credit customers for a pre-approved Loan Against Property (LAP) offer. Built for the SalesAgents AI – AI Intern (Prompt Engineer) assignment.

## Problem

Home Credit wants to call existing customers about a pre-approved LAP offer of up to ₹75 lakh and run a preliminary eligibility check before a senior loan expert takes over. The call has to feel like a conversation with an advisor, not a questionnaire. Customers answer in full sentences, interrupt, give answers out of order and correct themselves. The agent still has to apply the eligibility rules exactly.

## Objective

The agent must:

1. Verify the customer and check they can talk. If they are busy, capture a callback time.
2. Present the offer as a reward for their loyalty.
3. Route existing-loan and EMI-reduction cases to a loan-transfer specialist.
4. Collect all 7 eligibility items, remembering anything said out of order.
5. Disqualify immediately when a rule fails.
6. Hand off to a senior loan expert only after all 7 items are answered and passing.

## Deliverables

| Deliverable | Location |
|---|---|
| System prompt (paste into Retell / Bolna) | [`prompts/system-prompt.md`](prompts/system-prompt.md) |
| Conversation flow and state machine | [`docs/conversation-flow.md`](docs/conversation-flow.md) |
| Eligibility rules | [`docs/eligibility-rules.md`](docs/eligibility-rules.md) |
| Test matrix (28 scenarios) | [`docs/test-scenarios.md`](docs/test-scenarios.md) |
| Sample transcripts | [`docs/sample-transcripts.md`](docs/sample-transcripts.md) |
| Voice platform setup | [`docs/voice-platform-setup.md`](docs/voice-platform-setup.md) |
| Call log template for submission | [`submission/call-log.md`](submission/call-log.md) |
| Reference engine, tests, review console | `src/`, `tests/`, `web/` |

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

The brief sets no minimum property value, interest rate, credit score, age or income requirement, so the agent applies none.

## State management

The prompt tells the model to keep a private qualification state and to run the same steps after every customer reply:

1. **Extract** every fact in the reply, including answers to questions not yet asked.
2. **Store** them. The latest clear answer replaces an earlier one, and uncertain answers stay `UNKNOWN`.
3. **Check rules** and disqualify immediately on a failure.
4. **Check transfer intent**: an existing loan on the property or a request to reduce the current EMI.
5. **Ask only the earliest unanswered item**, so nothing is asked twice and skipped items are picked up later.

State fields: `customer_verified`, `property_type`, `ownership_status`, `documents_available`, `loan_amount`, `requested_loan_amount`, `occupation`, `income_mode`, `market_value`, `tenure`, `existing_property_loan`, `emi_reduction_request`, `disqualified`, `transfer_required`, `callback_time`.

The same algorithm is implemented deterministically in [`src/engine/`](src/engine/). That code makes the business logic testable without a platform account. It is a reference model of the prompt's behaviour, not a runtime the voice agent depends on.

## Transfer logic

The standard flow is for a fresh loan. If the customer says at any point that there is already a loan on the property, or that they want to reduce their current EMI, the agent stops the fresh-loan flow. It tells them a loan-transfer specialist will contact them shortly and ends the call. Originals held by a bank count as an existing loan. A car or personal loan does not count, and neither does a question about the EMI on the new loan.

## Testing

```bash
npm test
```

97 tests across five files, using Node's built-in test runner with no dependencies:

| File | Covers |
|---|---|
| `tests/rules.test.js` | Every rule and boundary (tenure 2.9 / 3 / 15 / 15.5, ₹75 lakh exactly), the handoff gate blocked for each missing item |
| `tests/extract.test.js` | Indian currency parsing, out-of-order and multi-fact extraction, corrections, negation, ambiguity, transfer-intent detection |
| `tests/conversation.test.js` | Immediate disqualification, the ₹75 lakh branch, transfer routing, busy branch, the handoff gate, no invented rates |
| `tests/scenarios.test.js` | 25 scripted calls (S01–S25) from `src/scenarios/scenarios.js` |
| `tests/prompt.test.js` | The prompt uses all 11 variables and all 7 items in order, and contains no percentages or invented rupee thresholds |

Live-call testing on the voice platform follows [`docs/test-scenarios.md`](docs/test-scenarios.md), with results recorded in [`submission/call-log.md`](submission/call-log.md).

## Project structure

```
prompts/system-prompt.md      Production system prompt
docs/                         Flow, rules, test matrix, transcripts, platform setup
config/                       Example call config, post-call extraction fields
src/engine/                   Reference qualification engine (rules, extraction, state machine)
src/prompt/                   Prompt variable list and renderer
src/scenarios/                Scripted call scenarios and runner (shared by tests and UI)
tests/                        Automated tests
web/                          Qualification console (static, no build step)
scripts/                      Local server and prompt renderer
submission/                   Call log template for recordings and transcripts
```

## Local setup

Requires Node.js 20 or newer. There are no npm dependencies to install.

```bash
npm test                 # run the test suite
npm start                # console at http://127.0.0.1:4173/web/
npm run render:prompt    # print the prompt with config values filled in
```

The console has a call simulator showing live qualification state, a runner that replays all 25 scenarios, the rule tables, the call flow, and a prompt preview with copy and download.

## Voice platform setup

See [`docs/voice-platform-setup.md`](docs/voice-platform-setup.md). In short:

1. Create an agent on Retell AI or Bolna and paste the prompt. For Bolna's `{variable}` syntax, use `npm run render:prompt -- --single-brace`.
2. Set the dynamic variables and pick a voice that matches `agent_gender`.
3. Enable the end-call function.
4. Run the scripted test calls and share the recordings and transcripts through a public link.

## Environment variables

Copy `.env.example` to `.env` if you need to change the console's port.

| Variable | Used by | Default |
|---|---|---|
| `PORT` | `scripts/serve.js` | `4173` |
| `HOST` | `scripts/serve.js` | `127.0.0.1` |

Platform API keys are not needed: the agent is configured in the platform dashboard. `.env.example` lists reserved names, commented out, for a future integration. No code reads them.

## Implemented vs. requires platform access

| Implemented in this repository | Requires a voice-platform account |
|---|---|
| System prompt with all required variables | Creating the agent and selecting a voice |
| Eligibility rules, state machine, handoff gate | Running real calls |
| 97 automated tests, 25 scripted scenarios | Call recordings and platform transcripts |
| Prompt renderer (double / single brace) | Public link to recordings and call logs |
| Review console and documentation | Post-call extraction setup (fields provided) |

## Submission checklist

- [x] System prompt text — `prompts/system-prompt.md`
- [x] All 7 eligibility items, disqualification, transfer, busy and ₹75 lakh logic
- [x] Dynamic variables: company, customer, agent name and gender, date/day/time, RAG context, language, history, utterance
- [x] Test scenarios and expected behaviour documented
- [ ] Agent created on Retell AI / Bolna with a professional voice
- [ ] Test calls recorded across the scenarios in `submission/call-log.md`
- [ ] Recordings and transcripts uploaded to a public folder
- [ ] Public link added to `submission/call-log.md` and the submission form
