# Test Scenarios

Each scenario below is written the way a real customer talks. Scenarios marked with an ID (S01–S25) are also automated: they live in [`src/scenarios/scenarios.js`](../src/scenarios/scenarios.js), run in `npm test`, and can be replayed in the console's **Test scenarios** view. Use the same scripts for live calls on the voice platform and record results in [`submission/call-log.md`](../submission/call-log.md).

Unless stated otherwise, each scenario starts with the standard opening: the customer confirms identity, agrees to talk, and confirms there is no existing loan on the property.

## Summary

| ID | Scenario | Category | Expected outcome |
|---|---|---|---|
| S01 | Eligible customer, standard flow | Happy path | Qualified → senior loan expert |
| S02 | Agricultural property | Disqualification | Disqualified at item 1 |
| S03 | Self-employed, income in cash | Disqualification | Disqualified at item 5 |
| S04 | Original documents not available | Disqualification | Disqualified at item 3 |
| S05 | Tenure below 3 years | Disqualification | Disqualified at item 7 |
| S06 | Tenure above 15 years | Disqualification | Disqualified at item 7 |
| S07 | Requests ₹90 lakh, accepts ₹75 lakh | ₹75 lakh limit | Qualified at ₹75 lakh |
| S08 | Requests ₹1 crore, declines ₹75 lakh | ₹75 lakh limit | Polite end, not disqualified |
| S09 | Joint ownership | Happy path | Qualified |
| S10 | Existing loan on the property | Transfer | Loan-transfer specialist |
| S11 | EMI reduction request mid-flow | Transfer | Loan-transfer specialist |
| S12 | Busy customer | Busy | Callback time captured |
| S13 | Out-of-order information | Natural conversation | Qualified, no repeated questions |
| S14 | Several answers in one sentence | Natural conversation | Qualified, only missing items asked |
| S15 | Customer interrupts with a question | Interruptions | Flow resumes, nothing lost |
| S16 | Ambiguous document answer | Ambiguity | Clarification before storing |
| S17 | Customer corrects an earlier answer | Corrections | Latest answer used |
| S18 | Interest-rate question, no RAG context | Diversions | No invented rate, flow resumes |
| S19 | Unrelated question | Diversions | No invented facts, flow resumes |
| S20 | Contradiction resolved by correction | Corrections | Latest answer (agricultural) → disqualified |
| S21 | Wrong person answers | Verification | Ends without sharing details |
| S22 | Original documents held by a bank | Transfer | Loan-transfer specialist |
| S23 | "Am I eligible?" before all items | Handoff gate | No early qualification |
| S24 | Product question answered from RAG | Diversions | Answer taken from context only |
| S25 | Not interested | Call termination | Polite end |
| L01 | Hindi call, male agent | Language / gender | Hindi throughout, masculine forms |
| L02 | Contradiction without a correction | Ambiguity | Clarifying question |
| L03 | Customer repeatedly pushes for more than ₹75 lakh | ₹75 lakh limit | Limit restated, no negotiation |

L-scenarios depend on language generation or tone, so they are tested on live calls only.

---

## S01 — Eligible customer, standard flow

- **Customer input:** "It's a residential flat." → "It's only in my name." → "Yes, I have the original documents at home." → "About 50 lakhs." → "I'm salaried and my salary is credited to my bank account." → "Roughly one crore." → "10 years."
- **Expected state changes:** property_type = residential, ownership_status = sole, documents_available = yes, loan_amount = ₹50 lakh, occupation = salaried, income_mode = bank, market_value = ₹1 crore, tenure = 10.
- **Expected agent behaviour:** one question per turn in checklist order, brief acknowledgements, no rate quoted.
- **Expected outcome:** Qualified. Agent says a senior loan expert will call shortly with the exact interest rate and next steps, then ends the call.

## S02 — Agricultural property

- **Customer input:** "It's agricultural land, our family farm."
- **Expected state changes:** property_type = agricultural, disqualified = true. Ownership and all later items stay UNKNOWN.
- **Expected agent behaviour:** no further questions; polite explanation that the offer does not cover agricultural property.
- **Expected outcome:** Disqualified, call ended.

## S03 — Self-employed, income in cash

- **Customer input:** (items 1–4 eligible) → "I run a kirana store and customers mostly pay me in cash."
- **Expected state changes:** occupation = self_employed, income_mode = cash, disqualified = true. Market value and tenure stay UNKNOWN.
- **Expected agent behaviour:** stops immediately; does not ask market value or tenure.
- **Expected outcome:** Disqualified.

## S04 — Original documents not available

- **Customer input:** "Residential house." → "It's mine." → "I only have photocopies, the originals got lost."
- **Expected state changes:** documents_available = no, disqualified = true.
- **Expected agent behaviour:** polite explanation that original documents are required; no loan-amount question.
- **Expected outcome:** Disqualified.

## S05 — Tenure below 3 years

- **Customer input:** (items 1–6 eligible: industrial factory, joint with partner, originals available, ₹60 lakh, self-employed with bank income, ~₹2 crore) → "Just 2 years."
- **Expected state changes:** tenure = 2, disqualified = true.
- **Expected agent behaviour:** explains the repayment period must be 3–15 years; does not offer to adjust or negotiate.
- **Expected outcome:** Disqualified.

## S06 — Tenure above 15 years

- **Customer input:** (items 1–6 eligible) → "I would like 20 years."
- **Expected state changes:** tenure = 20, disqualified = true.
- **Expected agent behaviour:** same as S05.
- **Expected outcome:** Disqualified.

## S07 — Requests ₹90 lakh, accepts ₹75 lakh

- **Customer input:** "I need around 90 lakhs." → "Okay, yes, let us go with 75." → remaining items eligible, tenure 15 years.
- **Expected state changes:** requested_loan_amount = ₹90 lakh, loan_amount stays UNKNOWN until the customer accepts, then loan_amount = ₹75 lakh. Tenure 15 (boundary) passes.
- **Expected agent behaviour:** "This offer supports a loan of up to ₹75 lakh… Would you like to proceed with ₹75 lakh?" — no rejection.
- **Expected outcome:** Qualified at ₹75 lakh.

## S08 — Requests ₹1 crore, declines ₹75 lakh

- **Customer input:** "One crore." → "No, that won't be enough for me."
- **Expected state changes:** requested_loan_amount = ₹1 crore, loan_amount = UNKNOWN, disqualified = false.
- **Expected agent behaviour:** explains the limit once, does not persuade, thanks the customer.
- **Expected outcome:** Call ended politely (`LOAN_CAP_DECLINED`).

## S09 — Joint ownership is eligible

- **Customer input:** "It's jointly owned with my brother." plus otherwise eligible answers.
- **Expected state changes:** ownership_status = joint; no disqualification.
- **Expected agent behaviour:** continues normally to documents.
- **Expected outcome:** Qualified.

## S10 — Existing loan on the property

- **Customer input:** At the fresh-loan check: "Yes, I already have a home loan running on this flat."
- **Expected state changes:** existing_property_loan = yes, transfer_required = true. No checklist item collected except what was volunteered.
- **Expected agent behaviour:** "…our loan-transfer specialist will contact you shortly." No checklist questions.
- **Expected outcome:** Transfer, call ended.

## S11 — EMI reduction request mid-qualification

- **Customer input:** "Residential." → "Actually, what I really want is to reduce my current EMI, it is too high."
- **Expected state changes:** emi_reduction_request = yes, transfer_required = true. Ownership stays UNKNOWN.
- **Expected agent behaviour:** stops the fresh-loan questions at once; transfer message.
- **Expected outcome:** Transfer, call ended.

## S12 — Busy customer

- **Customer input:** "Yes, but I'm in a meeting right now." → "Call me tomorrow after 6 pm."
- **Expected state changes:** customer_verified = yes, customer_available = no, callback_time = "tomorrow after 6 pm". All checklist items UNKNOWN.
- **Expected agent behaviour:** "No problem at all. What would be a convenient time for us to call you back?" → repeats the time back → ends.
- **Expected outcome:** Callback scheduled. Offer not pitched.

## S13 — Out-of-order information

- **Customer input:** To the property-type question: "I have a residential property, it's jointly owned with my wife, and it's worth around one crore."
- **Expected state changes:** property_type = residential, ownership_status = joint, market_value = ₹1 crore — all from one reply.
- **Expected agent behaviour:** next question is original documents. Ownership and market value are never asked; after item 5 the agent goes straight to tenure.
- **Expected outcome:** Qualified.

## S14 — Several answers in one sentence

- **Customer input:** "No loan. It's my own residential property, original documents are available, I need 40 lakhs and I'd prefer 10 years."
- **Expected state changes:** existing_property_loan = no, property_type = residential, ownership_status = sole, documents_available = yes, loan_amount = ₹40 lakh, tenure = 10.
- **Expected agent behaviour:** acknowledges, then asks only item 5, then only item 6.
- **Expected outcome:** Qualified.

## S15 — Customer interrupts with a question

- **Customer input:** "Yes, it's residential — sorry, can I ask something?" → "What documents will you need from me?" → "Okay. It is in my name."
- **Expected state changes:** property_type = residential is kept through the interruption; ownership_status = sole.
- **Expected agent behaviour:** "Of course, please go ahead." → defers the full document list to the senior loan expert (no invented list) → resumes with ownership → then documents.
- **Expected outcome:** Call continues with no information lost.

## S16 — Ambiguous document answer

- **Customer input:** "I think the papers are probably somewhere." → "Yes, I checked, the originals are in the cupboard."
- **Expected state changes:** documents_available stays UNKNOWN after the first reply; becomes yes after the second.
- **Expected agent behaviour:** "Just to confirm — do you have the original property documents available for verification?"
- **Expected outcome:** Call continues to the loan amount.

## S17 — Customer corrects an earlier answer

- **Customer input:** "It's a 10-year tenure... actually, make that 12 years."
- **Expected state changes:** tenure = 12 (not 10).
- **Expected agent behaviour:** uses 12 years without asking again.
- **Expected outcome:** Qualified.

## S18 — Interest-rate question (no RAG context)

- **Customer input:** "Before that, what interest rate do you offer?" → "Okay. It is a commercial shop."
- **Expected state changes:** none from the question; then property_type = commercial.
- **Expected agent behaviour:** no figure, range or "starting from" rate. Says the senior loan expert will share the exact rate after the preliminary check, then asks the property type again.
- **Expected outcome:** Call continues.

## S19 — Unrelated question

- **Customer input:** "Where is your nearest branch?"
- **Expected state changes:** none.
- **Expected agent behaviour:** no invented branch details; offers the senior loan expert for that, returns to the ownership question.
- **Expected outcome:** Call continues.

## S20 — Contradiction resolved by a correction

- **Customer input:** "It's residential... actually no, it's agricultural land."
- **Expected state changes:** property_type = agricultural (latest clear answer).
- **Expected agent behaviour:** disqualifies immediately.
- **Expected outcome:** Disqualified.

## S21 — Wrong person answers

- **Customer input:** "No, he's not at home. This is his wife."
- **Expected state changes:** customer_verified = no.
- **Expected agent behaviour:** apologises, says it will try the customer another time. Shares no loan or offer details.
- **Expected outcome:** Call ended.

## S22 — Original documents held by a bank

- **Customer input:** "The original papers are with the bank."
- **Expected state changes:** existing_property_loan = yes.
- **Expected agent behaviour:** treated as an existing loan on the property → transfer message.
- **Expected outcome:** Transfer.

## S23 — "Am I eligible?" before all items are answered

- **Customer input:** (items 1–6 answered) → "So am I eligible?" → "8 years."
- **Expected state changes:** tenure stays UNKNOWN after the question; outcome stays empty.
- **Expected agent behaviour:** "I'll be able to tell you once I've gone through a few more details" → asks tenure. Qualifies only after tenure.
- **Expected outcome:** Qualified after item 7.

## S24 — Product question answered from RAG context

- **Setup:** `additional_context_from_rag` contains a test-fixture sentence about the offer.
- **Customer input:** "Is this offer valid only for existing customers?"
- **Expected agent behaviour:** answers with the context sentence, then returns to the property-type question.
- **Expected outcome:** Call continues.

## S25 — Not interested

- **Customer input:** "Sorry, I'm not interested."
- **Expected agent behaviour:** thanks the customer politely, no persuasion.
- **Expected outcome:** Call ended.

## L01 — Hindi call, male agent (live only)

- **Setup:** `language_to_speak` = Hindi, `agent_gender` = male, male voice selected.
- **Customer input:** "हाँ, बोलिए।" → "मेरा फ्लैट है, मेरे नाम पर है।" → …
- **Expected agent behaviour:** speaks Hindi for the whole call, uses masculine first-person forms ("मैं बोल रहा हूँ", "समझ गया"), keeps loan terms such as EMI and documents natural.
- **Expected outcome:** Same rule behaviour as the English flow.

## L02 — Contradiction without a correction (live only)

- **Customer input:** "It's in my name only… my brother is also an owner."
- **Expected agent behaviour:** one short clarifying question ("Is it in your name alone, or jointly with your brother?"); stores nothing until clear.

## L03 — Customer pushes for more than ₹75 lakh (live only)

- **Customer input:** "1 crore." → "Can't you make an exception?"
- **Expected agent behaviour:** restates the ₹75 lakh limit once, asks whether to proceed with ₹75 lakh; no exceptions, no pressure.

---

## Live-call checklist

When testing on the voice platform, also listen for:

- One question per turn; no long monologues.
- The agent never reads out internal state or labels.
- Interruptions: speak over the agent mid-sentence and check that it stops and adapts.
- Fillers and pauses ("umm… yeah… it's residential") are understood.
- The gender and language of the agent match the configuration for the entire call.
- The call actually ends after every closing line.
