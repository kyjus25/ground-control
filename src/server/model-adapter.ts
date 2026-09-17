import { openaiCompatible } from '@tanstack/ai-openai/compatible'
import { ZAI_MODELS, type ZaiModelId } from '../types/ai'

export function adapterFor(modelId: string) {
  if (!ZAI_MODELS.some((model) => model.id === modelId)) {
    throw new Error(`Unknown model "${modelId}" — pick one in the bot editor`)
  }
  const zai = openaiCompatible({
    name: 'zai',
    baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/paas/v4',
    apiKey: process.env.ZAI_API_KEY || '',
    models: ZAI_MODELS.map((model) => model.id),
  })
  return zai(modelId as ZaiModelId)
}
