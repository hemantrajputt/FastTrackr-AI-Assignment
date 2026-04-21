import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { traceable } from 'langsmith/traceable';

const GEMINI_MODEL = 'gemini-3.1-pro-preview';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Get a Gemini model instance.
 */
export function getModel(config?: { jsonMode?: boolean }): GenerativeModel {
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: config?.jsonMode
      ? { responseMimeType: 'application/json' }
      : undefined,
  });
}

/**
 * Traced Gemini text generation call.
 * Wraps model.generateContent with LangSmith tracing.
 */
export const tracedGenerate = traceable(
  async (params: {
    name: string;
    model: GenerativeModel;
    prompt: string;
    metadata?: Record<string, unknown>;
  }) => {
    const result = await params.model.generateContent(params.prompt);
    const text = result.response.text();
    return text;
  },
  {
    name: 'gemini_generate',
    run_type: 'llm',
    tags: ['gemini', 'fasttrackr'],
  }
);

/**
 * Traced Gemini multimodal call (for audio).
 * Wraps model.generateContent with inline data parts.
 */
export const tracedMultimodalGenerate = traceable(
  async (params: {
    name: string;
    model: GenerativeModel;
    parts: unknown[];
    metadata?: Record<string, unknown>;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await params.model.generateContent(params.parts as any);
    const text = result.response.text();
    return text;
  },
  {
    name: 'gemini_multimodal',
    run_type: 'llm',
    tags: ['gemini', 'fasttrackr', 'multimodal'],
  }
);

export { GEMINI_MODEL };
