/** Call setup and simulator state shared across sections for this browser tab. */
export const callSetup = {
  company_name: 'Home Credit',
  customer_name: '',
  agent_name: '',
  agent_gender: 'female',
  language_to_speak: 'English',
  additional_context_from_rag: '',
};

/**
 * mode: 'ai' (live LLM via the local API) or 'rules' (reference engine in the browser).
 * The remaining fields describe the active call, kept while switching sections.
 */
export const simulation = {
  mode: null,
  voiceReplies: false,
  call: null,
};
