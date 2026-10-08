# Voice Platform Setup

This repository holds the prompt, rules and tests. Running real calls needs an account on a voice platform. The assignment allows Retell AI, Bolna or a similar platform. The steps below were checked against public documentation and community answers at the time of writing. Platform dashboards change, so check the current docs if a menu or field name differs.

Nothing in this repository calls a platform API, and no platform credentials are stored here.

## 1. Prepare the prompt

| Platform variable syntax | What to paste |
|---|---|
| Double braces `{{variable}}` (Retell AI) | `prompts/system-prompt.md` as-is, or copy it from the console's **System prompt** view. |
| Single braces `{variable}` (Bolna) | Output of `npm run render:prompt -- --single-brace --out build/system-prompt.txt` |
| No variable support / LLM playground | Fill the values in the console's **System prompt** view, or use `npm run render:prompt -- --config config/agent.config.json --with-time` |

To keep campaign values out of git, copy `config/agent.config.example.json` to `config/agent.config.json` (git-ignored) and fill in `customer_name` and `agent_name`.

## 2. Map the dynamic variables

| Variable | How to supply it |
|---|---|
| `company_name`, `customer_name`, `agent_name`, `agent_gender`, `language_to_speak` | Per-call or per-agent dynamic variables. On Retell these are passed when the call is created; on Bolna they are user variables passed through the API or a batch-calling CSV. Both platforms show test inputs for them in the dashboard. |
| `current_date`, `current_day`, `current_time` | Use the platform's built-in time variable if it has one. On Retell, `{{current_time_Asia/Kolkata}}` returns the time in IST (the plain `{{current_time}}` defaults to a US time zone). Otherwise pass the values when starting the call (`runtimeDateValues()` in `src/prompt/render.js` formats them). |
| `additional_context_from_rag` | Product knowledge from your retrieval step or the platform's knowledge-base feature. Leave empty if none: the prompt then defers product questions to the senior loan expert. |
| `conversation_history`, `customer_utterance` | Voice platforms pass the live conversation to the model themselves, so these are often not needed. The prompt tells the model to use the live messages if these blocks are empty. Fill them only if your orchestration layer builds the prompt per turn. |

`agent_gender` must match the voice you select. A female voice with `agent_gender = male` breaks the gender requirement.

## 3. Create the agent

### Retell AI

1. Sign up for the free trial and create a new agent with a single-prompt (Retell LLM) setup.
2. Paste the prompt into the agent's prompt field.
3. Select a professional voice that matches `agent_gender`. Use an Indian English voice for English and a Hindi-capable voice for Hindi.
4. Set the agent language to match `language_to_speak`.
5. Add the platform's **end call** function so the agent can hang up after its closing line. The prompt already says to end the call after every closing line.
6. Set the dynamic variable test values in the dashboard.
7. Optional: under post-call analysis, add the fields from `config/post-call-extraction.json` so every call produces a structured record of the qualification state.

### Bolna

1. Create an agent and paste the single-brace prompt into the prompt editor. Variables written as `{variable}` appear automatically as test inputs.
2. Choose the voice, language and transcriber to match `agent_gender` and `language_to_speak`.
3. Enable hang-up / end-call behaviour so the agent ends the call after its closing line.
4. Add the extraction fields from `config/post-call-extraction.json` if your plan supports post-call extraction.

## 4. Run the test calls

Use the scripts in [`docs/test-scenarios.md`](test-scenarios.md) and talk like a real customer: full sentences, fillers, interruptions and corrections. As a minimum, record these calls:

| Call | Scenario |
|---|---|
| 1 | S01 eligible, standard flow |
| 2 | S02 agricultural property |
| 3 | S03 cash income |
| 4 | S04 originals not available |
| 5 | S05 or S06 tenure outside 3–15 years |
| 6 | S07 above ₹75 lakh, accepts ₹75 lakh |
| 7 | S10 or S11 existing loan / EMI reduction |
| 8 | S12 busy customer |
| 9 | S13 or S14 out-of-order / multiple answers |
| 10 | S15 + S18 interruption and interest-rate question |
| 11 | S16 ambiguous documents + S17 correction |
| 12 | L01 Hindi call (if Hindi is in scope) |

After each call, fill in a row in [`submission/call-log.md`](../submission/call-log.md). If a call fails a check, change the prompt, re-run the automated tests (`npm test`), and record the call again.

## 5. Share recordings and transcripts

The submission needs a public link to the call recordings and call logs (audio and transcript).

1. From each call's detail page in the platform, download the recording and the transcript, or copy the platform's share link if it offers one.
2. Put them in one folder (for example Google Drive), named by call number and scenario ID: `01-S01-eligible.mp3`, `01-S01-eligible-transcript.txt`.
3. Set the folder to "anyone with the link can view" and test the link in a private browser window.
4. Paste the folder link and the per-call links into `submission/call-log.md`.

Recordings are git-ignored (`submission/recordings/`) so audio files never end up in the repository.
