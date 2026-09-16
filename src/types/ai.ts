// Z.AI GLM chat models, served through Z.AI's OpenAI-compatible endpoint
// (see src/server/ai.ts). Shared by the bot editor's model picker and the
// server-side adapter, which validates ids against this list.
export const ZAI_MODELS = [
  { id: 'glm-5.3', label: 'GLM-5.3', hint: 'Flagship' },
  { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash', hint: 'Fast and cheap' },
  { id: 'glm-5.2', label: 'GLM-5.2', hint: 'Previous gen' },
] as const

export type ZaiModelId = (typeof ZAI_MODELS)[number]['id']

export const DEFAULT_MODEL_ID: ZaiModelId = 'glm-5.3-flash'
