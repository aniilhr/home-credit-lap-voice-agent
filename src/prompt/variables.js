/**
 * Dynamic variables referenced by the system prompt.
 * `source` says who supplies the value on a live call:
 *  - campaign: set per agent or per call by whoever launches the campaign
 *  - runtime:  filled by the voice platform or orchestration layer during the call
 */
export const PROMPT_VARIABLES = Object.freeze([
  { name: 'company_name', source: 'campaign', description: 'Name of the lending company.' },
  { name: 'customer_name', source: 'campaign', description: 'Name of the customer being called.' },
  { name: 'agent_name', source: 'campaign', description: "The voice agent's name." },
  { name: 'agent_gender', source: 'campaign', description: 'female or male; must match the selected voice.' },
  { name: 'language_to_speak', source: 'campaign', description: 'English or Hindi.' },
  { name: 'additional_context_from_rag', source: 'runtime', description: 'Product knowledge retrieved for this call. May be empty.' },
  { name: 'current_date', source: 'runtime', description: 'Date at call time.' },
  { name: 'current_day', source: 'runtime', description: 'Weekday at call time.' },
  { name: 'current_time', source: 'runtime', description: 'Local time at call time.' },
  { name: 'conversation_history', source: 'runtime', description: 'Transcript of the call so far.' },
  { name: 'customer_utterance', source: 'runtime', description: 'The latest thing the customer said.' },
]);

export const PROMPT_VARIABLE_NAMES = PROMPT_VARIABLES.map((v) => v.name);
