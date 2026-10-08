# Sample Transcripts

These are reference transcripts showing how the system prompt is meant to behave on a live call. They are written from the prompt's rules; they are not recordings. Real call recordings and platform transcripts go in [`submission/call-log.md`](../submission/call-log.md).

Variables used: `company_name` = Home Credit, `agent_name` = Priya (female) or Arjun (male), `customer_name` = Rahul. The bracketed notes show the agent's internal state and are never spoken.

---

## 1. Eligible customer with out-of-order answers and an interruption

**Agent:** Good afternoon, this is Priya calling from Home Credit. Am I speaking with Rahul?
**Customer:** Yes, speaking. Who's this again?
**Agent:** I'm Priya from Home Credit. I'm calling with an offer for you as an existing customer — it'll take about two minutes. Is now a good time?
**Customer:** Umm, yeah, okay, go ahead.
**Agent:** Thank you. To thank you for being a valued customer, you have a pre-approved Loan Against Property offer of up to 75 lakh rupees. I just need a few quick details to check your eligibility. First — is there any loan currently running on the property you'd use for this?
**Customer:** No no, nothing. It's fully paid off.
**Agent:** Good to know. What type of property is it — a house or flat, a shop or office, or something like a factory?
**Customer:** It's a flat, residential. Jointly owned with my wife, and I'd say it's worth around one point two crore.

> [property_type = RESIDENTIAL, ownership_status = JOINT, market_value = ₹1.2 crore → next missing: documents]

**Agent:** Thank you, that helps. Do you have the original property documents available for verification?
**Customer:** Yes, the originals are at home in the locker. Sorry — can I ask something quickly?
**Agent:** Of course, go ahead.
**Customer:** What's the interest rate on this?
**Agent:** The exact interest rate will be shared by our senior loan expert once this quick check is done. Coming back to the details — how much would you like to borrow?
**Customer:** Around fifty lakhs should do.
**Agent:** Fifty lakh, noted. Are you salaried or self-employed? And is your income received in your bank account, or in cash?
**Customer:** I'm salaried, it comes straight into my salary account.

> [occupation = SALARIED, income_mode = BANK → item 6 already answered → next missing: tenure]

**Agent:** Got it. And over how many years would you like to repay the loan?
**Customer:** Let's say ten years... actually, make it twelve.

> [tenure = 12 (latest answer). All 7 items answered, all rules passed → handoff gate passes]

**Agent:** Twelve years, sure. Thank you, Rahul — based on what you've shared, you meet the preliminary criteria for this offer. A senior loan expert from Home Credit will call you shortly with the exact interest rate and next steps. Have a good day.

*(Call ends.)*

---

## 2. Busy customer

**Agent:** Good morning, this is Priya calling from Home Credit. Am I speaking with Rahul?
**Customer:** Yeah, it's me, but I'm driving right now.
**Agent:** No problem at all. What would be a convenient time for us to call you back?
**Customer:** Call me in the evening, after seven.
**Agent:** Sure — this evening after seven. We'll call you then. Drive safe.

> [customer_available = NO, callback_time = "this evening after 7 pm". No offer pitched, no checklist questions.]

*(Call ends.)*

---

## 3. Existing loan on the property → transfer

**Agent:** …I just need a few quick details to check your eligibility. First — is there any loan currently running on the property you'd use for this?
**Customer:** Actually yes, I already have a home loan on this house with another bank. The EMI is quite high, I was hoping to bring it down.

> [existing_property_loan = YES, emi_reduction_request = YES → transfer branch. Stop the fresh-loan flow.]

**Agent:** Thank you for telling me. Since there's already a loan on the property, our loan-transfer specialist will contact you shortly to help with that. Thank you for your time, Rahul.

*(Call ends. None of the 7 questions are asked.)*

---

## 4. Disqualification on income mode

**Agent:** …Are you salaried or self-employed? And is your income received in your bank account, or in cash?
**Customer:** I've got my own small business, a hardware shop. Most customers pay cash, so it's mostly cash only.

> [occupation = SELF_EMPLOYED, income_mode = CASH → rule failed → disqualify immediately]

**Agent:** Thank you for explaining. I'm sorry, but this offer requires income to be received through a bank account, so you don't meet the criteria for this specific offer at this time. Thank you for your time, and have a good day.

*(Call ends. Market value and tenure are not asked.)*

---

## 5. Loan amount above ₹75 lakh

**Agent:** How much would you like to borrow against the property?
**Customer:** I was thinking about ninety lakhs.
**Agent:** I understand. This offer supports a loan of up to 75 lakh rupees. Would you like to proceed with 75 lakh?
**Customer:** Hmm. Okay, 75 is fine.

> [requested_loan_amount = ₹90 lakh, loan_amount = ₹75 lakh → continue]

**Agent:** Great, 75 lakh it is. Are you salaried or self-employed? And is your income received in your bank account, or in cash?

*(Call continues. Had the customer said no, the agent would have thanked them and ended the call without persuasion.)*

---

## 6. Ambiguous answer and a product question without RAG context

**Agent:** Do you have the original property documents available for verification?
**Customer:** I think the papers are probably somewhere at my father's place.

> [documents_available stays UNKNOWN — uncertain answer]

**Agent:** Just to confirm — are the original documents available for verification, even if they're kept at your father's place?
**Customer:** Yes, yes, the originals are there with him.
**Agent:** Thank you. How much would you like to borrow against the property?
**Customer:** Wait, which branch would I need to visit?
**Agent:** I don't have branch details on this call, but our senior loan expert will guide you on that. For now — how much would you like to borrow?

---

## 7. Hindi call with a male agent

Variables: `language_to_speak` = Hindi, `agent_gender` = male, `agent_name` = Arjun.

**Agent:** नमस्ते, मैं Home Credit से अर्जुन बोल रहा हूँ। क्या मेरी बात राहुल जी से हो रही है?
**Customer:** हाँ, बोलिए।
**Agent:** धन्यवाद राहुल जी। मैं आपको एक ऑफ़र के बारे में बताने के लिए कॉल कर रहा हूँ, बस दो मिनट लगेंगे। क्या अभी बात करना ठीक रहेगा?
**Customer:** हाँ हाँ, ठीक है।
**Agent:** Home Credit के पुराने ग्राहक होने के नाते आपके लिए 75 लाख रुपये तक का pre-approved Loan Against Property ऑफ़र है। eligibility check करने के लिए मुझे कुछ जानकारी चाहिए। सबसे पहले — क्या इस property पर अभी कोई loan चल रहा है?
**Customer:** नहीं, कोई loan नहीं है। मेरा अपना flat है, सिर्फ़ मेरे नाम पर।

> [existing_property_loan = NO, property_type = RESIDENTIAL, ownership_status = SOLE → next missing: documents]

**Agent:** समझ गया। क्या आपके पास property के original documents verification के लिए उपलब्ध हैं?
**Customer:** हाँ, originals घर पर हैं।
**Agent:** ठीक है, मैंने नोट कर लिया। आप कितना loan लेना चाहेंगे?

*(The agent keeps Hindi and masculine first-person forms — "बोल रहा हूँ", "समझ गया" — for the rest of the call.)*
