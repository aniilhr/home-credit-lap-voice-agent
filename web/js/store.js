/** Call setup shared by the simulator and the prompt preview for this browser tab. */
export const callSetup = {
  company_name: 'Home Credit',
  customer_name: '',
  agent_name: '',
  agent_gender: 'female',
  language_to_speak: 'English',
  additional_context_from_rag: '',
};

/** The active simulated call, kept while the user switches sections. */
export const simulation = { session: null, lastEvents: [] };
