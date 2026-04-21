import { getModel, tracedGenerate, tracedMultimodalGenerate } from '@/lib/ai/gemini';

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const model = getModel();

  const base64Audio = audioBuffer.toString('base64');

  const audioPart = {
    inlineData: {
      mimeType: mimeType || 'audio/mpeg',
      data: base64Audio,
    },
  };

  const textPart = {
    text: [
      'You are a professional transcriptionist. Please provide a complete, accurate transcription of this audio recording.',
      'This is a conversation between a wealth manager/financial advisor and their client.',
      '',
      'Rules:',
      '- Transcribe EVERYTHING that is said, word for word',
      '- Identify speakers as "Wealth Manager:" and "Client:"',
      '- Include filler words and note pauses and unclear parts',
      '- Pay special attention to names, numbers, financial terms, account types, and dollar amounts',
      '- Format numbers clearly (e.g., "$500,000" not "five hundred thousand")',
      '',
      'Provide ONLY the transcription, no commentary.',
    ].join('\n'),
  };

  const result = await tracedMultimodalGenerate({
    name: 'audio_transcription',
    model,
    parts: [audioPart, textPart],
    metadata: { mimeType, audioSizeBytes: audioBuffer.length },
  });

  return result;
}

export interface ExtractedUpdate {
  type: 'FIELD_UPDATE' | 'NEW_KNOWN_ENTITY' | 'NEW_CUSTOM_ENTITY' | 'GOAL_OR_PREFERENCE' | 'CORRECTION';
  table?: string;
  member?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  data?: Record<string, unknown>;
  entityType?: string;
  title?: string;
  linkedTo?: string;
  category?: string;
  description?: string;
  priority?: string;
  targetDate?: string;
  confidence?: number;
}

export interface ExtractionResult {
  householdName: string;
  transcript: string;
  updates: ExtractedUpdate[];
  summary: string;
}

export async function extractFromTranscript(
  transcript: string,
  existingHouseholds: { name: string; members: string[] }[]
): Promise<ExtractionResult> {
  const model = getModel({ jsonMode: true });

  const householdList = existingHouseholds
    .map((h) => `- "${h.name}" (members: ${h.members.join(', ')})`)
    .join('\n');

  const prompt = `You are analyzing a transcribed conversation between a wealth manager and their client.

EXISTING HOUSEHOLDS IN DATABASE:
${householdList}

TRANSCRIPT:
${transcript}

YOUR TASK:
1. Identify which existing household this conversation is about (match by member names mentioned)
2. Extract ALL actionable information from the conversation
3. Classify each piece of information into one of these types:

TYPE A - FIELD_UPDATE: Updates an existing field in a core table
  Fields: phone, email, address, occupation, employer, annualIncome, totalNetWorth, liquidNetWorth, taxBracket, maritalStatus, riskTolerance, investmentObjective
  Specify: table (households/members), member (if applicable), field, newValue, confidence (0-1)

TYPE B - NEW_KNOWN_ENTITY: A new instance of an existing entity type  
  Entity types: member, financial_account, bank_detail
  Specify: table, data (structured object), confidence

TYPE C - NEW_CUSTOM_ENTITY: Entirely new category not in schema
  Examples: insurance_policy, real_estate, vehicle, debt, legal_document
  Specify: entityType, title, data (structured JSON), linkedTo (household/member name), confidence

TYPE D - GOAL_OR_PREFERENCE: Client goals, wishes, preferences, constraints
  Specify: category, description, priority (high/medium/low), targetDate (if mentioned), confidence

TYPE E - CORRECTION: Fixes incorrect existing data
  Specify: table, field, member, oldValue (if known), newValue, reason, confidence

Respond with this exact JSON structure:
{
  "householdName": "matched household name from the list above",
  "summary": "2-3 sentence summary of what was discussed",
  "updates": [
    {
      "type": "FIELD_UPDATE | NEW_KNOWN_ENTITY | NEW_CUSTOM_ENTITY | GOAL_OR_PREFERENCE | CORRECTION",
      ...relevant fields based on type
    }
  ]
}

Be thorough - extract EVERY piece of actionable information. If uncertain about a value, still include it but with lower confidence.`;

  try {
    const response = await tracedGenerate({
      name: 'audio_extraction',
      model,
      prompt,
      metadata: {
        householdCount: existingHouseholds.length,
        transcriptLength: transcript.length,
      },
    });

    const parsed = JSON.parse(response);
    return {
      householdName: parsed.householdName || '',
      transcript,
      updates: parsed.updates || [],
      summary: parsed.summary || '',
    };
  } catch {
    console.error('Failed to parse LLM response');
    return {
      householdName: '',
      transcript,
      updates: [],
      summary: 'Failed to extract structured data from transcript.',
    };
  }
}
