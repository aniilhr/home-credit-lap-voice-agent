# Call Log

Fill this in after recording the test calls on the voice platform (see [`docs/voice-platform-setup.md`](../docs/voice-platform-setup.md)).

**Platform:** _(Retell AI / Bolna / other)_
**Voice:** _(voice name, gender)_
**Prompt version:** _(git commit hash of `prompts/system-prompt.md` used for these calls)_
**Public folder with all recordings and transcripts:** _(link)_

| # | Scenario | Date | Expected outcome | Actual outcome | Pass | Recording | Transcript | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | S01 Eligible, standard flow | | Qualified handoff | | | | | |
| 2 | S02 Agricultural property | | Disqualified | | | | | |
| 3 | S03 Cash income | | Disqualified | | | | | |
| 4 | S04 Originals not available | | Disqualified | | | | | |
| 5 | S05/S06 Tenure outside 3–15 years | | Disqualified | | | | | |
| 6 | S07 Above ₹75 lakh, accepts ₹75 lakh | | Qualified at ₹75 lakh | | | | | |
| 7 | S10/S11 Existing loan / EMI reduction | | Transfer specialist | | | | | |
| 8 | S12 Busy customer | | Callback time captured | | | | | |
| 9 | S13/S14 Out-of-order / multiple answers | | Qualified, no repeats | | | | | |
| 10 | S15 + S18 Interruption, interest-rate question | | No invented rate, flow resumes | | | | | |
| 11 | S16 + S17 Ambiguity and correction | | Clarification, latest answer used | | | | | |
| 12 | L01 Hindi, male agent | | Hindi throughout, masculine forms | | | | | |

## Issues found and prompt changes

| Call | What went wrong | Prompt change | Re-tested in call |
|---|---|---|---|
| | | | |
