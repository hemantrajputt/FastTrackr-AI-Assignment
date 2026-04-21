import { getModel, tracedGenerate } from '@/lib/ai/gemini';
import prisma from '@/lib/db';
import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ════════════════════════════════════════════════════════════════════════════
// SCHEMA INTROSPECTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * Read and parse the Prisma schema file to produce a human-readable
 * description of every model with its fields, types, and relations.
 */
function getSchemaDescription(): string {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const raw = fs.readFileSync(schemaPath, 'utf-8');

  const lines = raw.split('\n');
  const parts: string[] = ['DATABASE SCHEMA (PostgreSQL via Prisma):\n'];

  let currentModel = '';
  for (const line of lines) {
    const trimmed = line.trim();

    // Model declaration
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      parts.push(`\nTable: "${currentModel}"`);
      continue;
    }

    if (trimmed === '}') {
      currentModel = '';
      continue;
    }

    // Skip comments, directives, empty lines
    if (!currentModel || trimmed.startsWith('//') || trimmed.startsWith('@@') || !trimmed) continue;

    // Parse field: `name  Type  @attributes`
    const fieldMatch = trimmed.match(/^(\w+)\s+(\S+)/);
    if (fieldMatch) {
      const [, fieldName, fieldType] = fieldMatch;
      const baseType = fieldType.replace('?', '').replace('[]', '');

      // Known Prisma scalar types
      const SCALAR_TYPES = ['String', 'Int', 'Float', 'Boolean', 'DateTime', 'Json', 'BigInt', 'Decimal', 'Bytes'];
      const isScalar = SCALAR_TYPES.includes(baseType);
      const isArray = fieldType.includes('[]');

      // Array relations (e.g., Member[], FinancialAccount[])
      if (isArray) {
        parts.push(`  - ${fieldName}: relation (has many ${baseType})`);
        continue;
      }

      // Non-scalar, non-array = relation back-reference (e.g., Household @relation(...))
      if (!isScalar) {
        // Skip relation back-references
        continue;
      }

      // It's a real scalar column
      const isOptional = fieldType.includes('?') ? ' (optional)' : '';
      const isPK = trimmed.includes('@id') ? ' [PRIMARY KEY]' : '';
      const isUnique = trimmed.includes('@unique') ? ' [UNIQUE]' : '';
      const hasDefault = trimmed.includes('@default') ? ' [has default]' : '';
      parts.push(`  - ${fieldName}: ${baseType}${isOptional}${isPK}${isUnique}${hasDefault}`);
    }
  }

  parts.push('\n\nIMPORTANT RELATIONSHIPS:');
  parts.push('- Household has many Members (via householdId)');
  parts.push('- Member has many FinancialAccounts (via memberId)');
  parts.push('- Member has many BankDetails (via memberId)');
  parts.push('- FinancialAccount has many Beneficiaries (via accountId)');
  parts.push('- Household and Member can have CustomEntities and GoalsOrPreferences');
  parts.push('- Household has ChangelogEntries for audit trail');
  parts.push('\nNOTE: Table names in PostgreSQL are exactly as shown (e.g., "Household", "Member", "FinancialAccount"). Column names are camelCase. Always double-quote table names in SQL.');

  return parts.join('\n');
}


// ════════════════════════════════════════════════════════════════════════════
// SQL SAFETY VALIDATION
// ════════════════════════════════════════════════════════════════════════════

const FORBIDDEN_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
  'GRANT', 'REVOKE', 'REPLACE', 'MERGE', 'UPSERT', 'COPY',
];

function validateSql(query: string): { valid: boolean; error?: string } {
  const upper = query.toUpperCase().trim();

  // Must start with SELECT or WITH (CTE)
  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, error: 'Only SELECT queries are allowed.' };
  }

  // Check for forbidden keywords
  for (const kw of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(query)) {
      return { valid: false, error: `Forbidden operation: ${kw}` };
    }
  }

  // No multiple statements
  const stripped = query.trim().replace(/;$/, '');
  if (stripped.includes(';')) {
    return { valid: false, error: 'Multiple SQL statements are not allowed.' };
  }

  return { valid: true };
}


// ════════════════════════════════════════════════════════════════════════════
// TOOL: Generate SQL Query
// ════════════════════════════════════════════════════════════════════════════

async function generateSqlQuery(question: string, schema: string, historyContext: string = '', additionalContext: string = ''): Promise<string> {
  const model = getModel({ jsonMode: true });

  const prompt = `You are a PostgreSQL expert. Your task is to analyze the user's latest question in the context of the ongoing conversation, and generate a valid PostgreSQL SELECT query to answer it.

${schema}

RULES:
1. Produce ONLY a JSON object with: { "query": "<SELECT ...>", "explanation": "<brief note>" }
2. Table names MUST be double-quoted (e.g., "Household", "Member", "FinancialAccount").
3. Column names MUST be double-quoted (e.g., "firstName", "totalNetWorth", "householdId").
4. Only SELECT statements. No INSERT, UPDATE, DELETE, DROP.
5. Use JOINs when data spans multiple tables.
6. Always add LIMIT 100 unless the user explicitly asks for all rows.
7. For aggregate queries (COUNT, SUM, AVG), no LIMIT needed.
8. If the user's input is a conversational follow-up that DOES NOT require new data from the database (e.g., "explain further", "thanks", "what does that mean?"), or if it cannot be answered with the schema, return: { "query": "", "explanation": "NO_QUERY_NEEDED" }

${historyContext}

${additionalContext}

CURRENT QUESTION: ${question}

Return ONLY the JSON object, nothing else.`;

  const text = await tracedGenerate({
    name: 'generate_sql',
    model,
    prompt,
    metadata: { tool: 'generate_sql_query', question },
  });

  return text;
}


// ════════════════════════════════════════════════════════════════════════════
// TOOL: Execute SQL Query
// ════════════════════════════════════════════════════════════════════════════

async function executeSqlQuery(query: string): Promise<{ status: string; rows?: any[]; rowCount?: number; error?: string }> {
  const validation = validateSql(query);
  if (!validation.valid) {
    return { status: 'error', error: validation.error };
  }

  try {
    // Clean trailing semicolons
    const cleanQuery = query.trim().replace(/;$/, '');
    const rows = await prisma.$queryRawUnsafe(cleanQuery) as any[];

    // Serialize BigInts and Dates for JSON
    const serialized = rows.map(row => {
      const obj: Record<string, any> = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          obj[key] = Number(value);
        } else if (value instanceof Date) {
          obj[key] = value.toISOString();
        } else {
          obj[key] = value;
        }
      }
      return obj;
    });

    return { status: 'ok', rows: serialized.slice(0, 100), rowCount: serialized.length };
  } catch (err: any) {
    return { status: 'error', error: err.message || 'Query execution failed' };
  }
}


// ════════════════════════════════════════════════════════════════════════════
// ORCHESTRATOR: Multi-step agentic answer
// ════════════════════════════════════════════════════════════════════════════

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AgentResult {
  answer: string;
  data: any[] | null;
  sql: string | null;
  error?: string;
}

/**
 * Main entry point. Orchestrates:
 *  1. Generate SQL from question (may loop up to MAX_ITERATIONS for multi-table)
 *  2. Execute each generated query
 *  3. Feed all results to LLM for final natural language answer
 */
export async function answerQuestion(
  question: string,
  chatHistory: ChatMessage[] = []
): Promise<AgentResult> {
  const MAX_ITERATIONS = 10;
  const schema = getSchemaDescription();

  // Build conversation context from history
  const historyContext = chatHistory.length > 0
    ? '\n\nRECENT CONVERSATION:\n' +
      chatHistory.slice(-6).map(m => `${m.role.toUpperCase()}: ${m.content.slice(0, 300)}`).join('\n') +
      '\n\nUse this context for follow-up questions.\n'
    : '';

  // ── Step 1: Agentic loop — generate & execute queries ──────────────
  const collectedResults: { sql: string; rows: any[]; rowCount: number; explanation: string }[] = [];
  const errors: string[] = [];
  let lastSql = '';

  // Initial question for SQL generation
  let currentQuestion = question;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Generate SQL
    let sqlResponse: string;
    try {
      let additionalContext = '';
      if (collectedResults.length > 0) {
        additionalContext = `DATA ALREADY COLLECTED:\n${collectedResults.map((r, i) => `Query ${i + 1}: ${r.explanation} → ${r.rowCount} rows`).join('\n')}\n\nIf you need more data from other tables to fully answer the original question, generate another query. If you have enough data, return { "query": "", "explanation": "DONE" }.`;
      }

      sqlResponse = await generateSqlQuery(
        currentQuestion,
        schema,
        historyContext,
        additionalContext
      );
    } catch (err: any) {
      errors.push(`SQL generation failed: ${err.message}`);
      break;
    }

    // Parse the response
    let parsed: { query: string; explanation: string };
    try {
      const cleaned = sqlResponse.replace(/```json\s*/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      errors.push(`Could not parse SQL response: ${sqlResponse.slice(0, 200)}`);
      break;
    }

    // Check if the agent is done
    if (!parsed.query || parsed.explanation?.toUpperCase().includes('DONE')) {
      break;
    }

    // Check if it cannot answer
    if (parsed.explanation?.toLowerCase().includes('cannot answer')) {
      errors.push(parsed.explanation);
      break;
    }

    lastSql = parsed.query;

    // Execute the query
    const result = await executeSqlQuery(parsed.query);

    if (result.status === 'error') {
      errors.push(`SQL error: ${result.error}`);
      // Give the LLM a chance to fix the query
      currentQuestion = `The previous query failed with error: "${result.error}". Original question: "${question}". Please fix the query.`;
      continue;
    }

    collectedResults.push({
      sql: parsed.query,
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      explanation: parsed.explanation || '',
    });

    // After first successful query, ask if more data is needed
    currentQuestion = question;
  }

  // ── Step 2: Generate final answer ──────────────────────────────────
  if (collectedResults.length === 0 && errors.length > 0) {
    return {
      answer: `I couldn't answer that question. ${errors.join(' ')}`,
      data: null,
      sql: lastSql || null,
      error: errors.join('; '),
    };
  }

  // Build results context for final answer
  const resultsContext = collectedResults.map((r, i) => {
    const rowPreview = r.rows.slice(0, 50);
    return `Query ${i + 1}: ${r.explanation}\nSQL: ${r.sql}\nRows returned: ${r.rowCount}\nData:\n${JSON.stringify(rowPreview, null, 2)}`;
  }).join('\n\n---\n\n');

  const model = getModel();

  const answerPrompt = `You are a wealth management data analyst assistant. Based on the provided conversational context and any query results below, provide a clear, professional answer to the user.

QUESTION: ${question}
${historyContext}

QUERY RESULTS:
${resultsContext ? resultsContext : "(No database query was needed for this response)"}

FORMATTING REQUIREMENTS:
1. Start with a brief, direct answer (1-2 sentences).
2. If the data has multiple rows, present it in a markdown table.
3. Add key insights after the table if applicable.
4. Format currency values with $ and commas.
5. Format percentages with %.
6. Be concise and professional — no emojis.
7. Important: If this is purely a conversational exchange (no query results needed), simply reply naturally. Do not explicitly state that "no data was queried" or "data is empty". Just talk normally based on the chat history.

Respond in markdown.`;

  try {
    const answer = await tracedGenerate({
      name: 'generate_answer',
      model,
      prompt: answerPrompt,
      metadata: { tool: 'answer_generation', question },
    });

    // Merge all rows for the data field
    const allRows = collectedResults.flatMap(r => r.rows);
    const allSql = collectedResults.map(r => r.sql).join('\n\n');

    return {
      answer,
      data: allRows.length > 0 ? allRows : null,
      sql: allSql || null,
    };
  } catch (err: any) {
    return {
      answer: 'I encountered an error generating the answer.',
      data: null,
      sql: lastSql || null,
      error: err.message,
    };
  }
}
