# Eligibility Rules

Every rule here comes from the assignment brief. The machine-readable version is [`src/engine/rules.js`](../src/engine/rules.js); tests in [`tests/rules.test.js`](../tests/rules.test.js) cover each boundary.

## Checklist rules

| # | Item | Eligible | Not eligible | Agent behaviour |
|---|---|---|---|---|
| 1 | Property type | Residential (house/flat), Commercial (shop/office), Industrial (factory) | Agricultural | Agricultural → disqualify immediately, end call. |
| 2 | Ownership status | Sole owner, Joint (with family/partners) | — | Both continue. Joint ownership is never a rejection. |
| 3 | Original property documents | Originals available for verification | Originals not available | Not available → disqualify immediately. Uncertain → clarify first. |
| 4 | Desired loan amount | Up to ₹75,00,000 (₹75 lakh), inclusive | — (see ₹75 lakh rule) | Above ₹75 lakh → explain the limit and offer ₹75 lakh. |
| 5a | Occupation | Salaried, Self-employed | — | Both continue. |
| 5b | Income mode | Bank | Cash | Cash → disqualify immediately. |
| 6 | Estimated market value | Any estimate | — | Captured only. No threshold of any kind. |
| 7 | Desired tenure | 3 to 15 years, inclusive | Below 3 years, above 15 years | Outside range → disqualify immediately. |

Item 5 is a single checklist item made of two facts. It counts as answered only when both occupation and income mode are known.

## ₹75 lakh rule

| Customer asks for | Agent behaviour | Result |
|---|---|---|
| ≤ ₹75 lakh | Store the amount, continue. | `loan_amount` = requested amount |
| > ₹75 lakh | "This offer supports a loan of up to ₹75 lakh. Would you like to proceed with ₹75 lakh?" — never an immediate rejection. | `requested_loan_amount` stored; `loan_amount` still UNKNOWN |
| …then says yes | Continue the checklist. | `loan_amount` = ₹75 lakh |
| …then names a lower amount (≤ ₹75 lakh) | Continue the checklist. | `loan_amount` = that amount |
| …then says no | Thank politely, end the call. Not a disqualification. | Outcome `LOAN_CAP_DECLINED` |

## Routing rules

| Trigger (at any point in the call) | Behaviour | Outcome |
|---|---|---|
| Existing loan on the property (home loan, mortgage, LAP, originals held by a lender) | Stop the fresh-loan flow; a loan-transfer specialist will contact them shortly; end call. No checklist questions. | `TRANSFER_TO_SPECIALIST` |
| Wants to reduce a current EMI / balance transfer | Same as above. | `TRANSFER_TO_SPECIALIST` |
| Customer is busy | Acknowledge, ask for a preferred callback time, confirm it, end call. | `CALLBACK_SCHEDULED` |
| A mandatory criterion fails | Politely say they do not meet the criteria for this specific offer at this time; end call. No negotiation. | `DISQUALIFIED` |
| All 7 items answered and passing | A senior loan expert will call shortly with exact interest rates and next steps; end call. | `QUALIFIED_HANDOFF` |

Disqualification is checked before transfer intent on each turn, following the order in the brief's business logic.

## Interpretation notes

These clarify how natural speech maps onto the rules above. None of them adds a new condition.

| Customer says | Interpreted as | Why |
|---|---|---|
| "The originals are at home / in my locker" | Documents available | The requirement is availability for verification, not having them in hand during the call. |
| "I only have photocopies" / "The originals got lost" | Documents not available | Originals are required. |
| "I think the papers are probably somewhere" | UNKNOWN → clarify | Uncertain answers are never assumed. |
| "The original papers are with the bank" | Existing property loan → transfer | A lender holds originals because of a loan on the property. |
| "Most of my income comes directly into my bank account" | Bank | Income is received via the bank. |
| "Half cash, half bank" | UNKNOWN → clarify | No main mode stated; the agent asks before deciding. |
| "It's jointly owned with my wife" | Joint | Joint ownership is eligible. |
| "It's residential… actually no, agricultural land" | Agricultural → disqualify | The latest clear answer wins. |
| "36 months" | 3 years | Tenure is evaluated in years. |
| "Around 50" (to the loan-amount question) | Confirm: "Is that ₹50 lakh?" | Units are confirmed rather than guessed. |
| A car, personal, gold or education loan | Not a property loan → no transfer | Only a loan on the property triggers transfer. |
| "Can a longer tenure reduce the EMI?" | Product question, not a transfer request | It is about the new loan, not reducing a current EMI. |
| Retired / student / homemaker | Clarify once whether they earn a salary or run a business; if neither, criteria not met | The brief lists only salaried and self-employed as eligible occupations. |

## Not part of the preliminary check

The brief defines no condition for any of these, so the agent neither asks about them nor applies them:

- Minimum or maximum property market value
- Interest rates (only the senior loan expert provides them, unless supplied in RAG context)
- Credit score
- Age
- Income amount
- Employment or business vintage
- Loan-to-value ratio
- Any other bank policy not stated in the brief
