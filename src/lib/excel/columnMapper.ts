import { getModel, tracedGenerate } from '@/lib/ai/gemini';
import * as fs from 'fs';
import * as path from 'path';

export interface ColumnMapping {
  [columnHeader: string]: {
    category: string; // table name like 'household', 'member', 'financialAccount', etc.
    field: string;
  };
}

/**
 * Dynamically parse the Prisma schema file and extract all models with their fields.
 * Returns a map of modelName → field names (excluding relations, id, timestamps).
 */
function parseSchemaFields(): Record<string, string[]> {
  const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

  const models: Record<string, string[]> = {};
  let currentModel: string | null = null;

  // Fields to skip (auto-managed, relations, system fields)
  const SKIP_FIELDS = new Set([
    'id', 'createdAt', 'updatedAt',
    'householdId', 'memberId', 'accountId', // foreign keys
  ]);

  for (const line of schemaContent.split('\n')) {
    const trimmed = line.trim();

    // Detect model start
    const modelMatch = trimmed.match(/^model\s+(\w+)\s*\{/);
    if (modelMatch) {
      currentModel = modelMatch[1];
      models[currentModel] = [];
      continue;
    }

    // Detect model end
    if (trimmed === '}') {
      currentModel = null;
      continue;
    }

    // Parse field lines inside a model
    if (currentModel && trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('@@')) {
      const fieldMatch = trimmed.match(/^(\w+)\s+(String|Int|Float|DateTime|Boolean|Json)/);
      if (fieldMatch) {
        const fieldName = fieldMatch[0].split(/\s+/)[0];
        // Skip system fields, FKs, and relation-only fields
        if (!SKIP_FIELDS.has(fieldName)) {
          models[currentModel].push(fieldName);
        }
      }
    }
  }

  return models;
}

/**
 * Format schema fields into a readable string for the AI prompt.
 */
function formatSchemaForPrompt(schema: Record<string, string[]>): string {
  return Object.entries(schema)
    .filter(([, fields]) => fields.length > 0)
    .map(([model, fields]) => `${model} table fields: ${fields.join(', ')}`)
    .join('\n');
}

export async function mapColumnsWithAI(headers: string[]): Promise<ColumnMapping> {
  const model = getModel({ jsonMode: true });

  // Dynamically read ALL fields from Prisma schema
  const schemaFields = parseSchemaFields();
  const schemaDescription = formatSchemaForPrompt(schemaFields);
  const tableNames = Object.keys(schemaFields).filter(t => schemaFields[t].length > 0);

  console.log(`[Column Mapper] Schema tables: ${tableNames.join(', ')}`);

  const prompt = `You are an expert data analyst for a wealth management platform. Given these Excel column headers, map each one to the most appropriate field in our database schema.

EXCEL COLUMN HEADERS:
${headers.map((h, i) => `${i + 1}. "${h}"`).join('\n')}

OUR COMPLETE DATABASE SCHEMA (all tables and their columns):

${schemaDescription}

IMPORTANT NOTES:
- The "additionalInfo" field in each table stores any data that doesn't fit a specific column (as JSON)
- "Beneficiary" fields like "Beneficiary 1 Name", "Beneficiary 2 %" map to the Beneficiary table's name, percentage, dateOfBirth fields — use field names like "benef1Name", "benef1Pct", "benef1Dob", "benef2Name", "benef2Pct", "benef2Dob" with category "Beneficiary"
- "ssnEncrypted" maps to SSN/Social Security Number columns
- BankDetail fields: bankName, bankType, accountNumber, routingNumber

RULES:
- Map each column header to exactly ONE table (category) and ONE field
- Valid categories: ${tableNames.map(t => `"${t}"`).join(', ')}
- Use category "unknown" if the column doesn't fit any table — but STILL provide a descriptive camelCase field name
- Column names may have typos, abbreviations, or unusual formatting — use your best judgment
- "Account Value" or "Value" maps to FinancialAccount.accountValue
- "Household Name" maps to Household.name
- "First Name" maps to Member.firstName
- "Account Type" maps to FinancialAccount.accountType
- SSN or SSN# maps to Member.ssnEncrypted
- "Annual Income" maps to Member.annualIncome
- Years of experience columns map to FinancialAccount.yearsExp* fields

Return a JSON object where each key is the EXACT original column header string, and the value is an object with "category" (table name) and "field" (column name).

Example:
{
  "Household Name": { "category": "Household", "field": "name" },
  "First Name": { "category": "Member", "field": "firstName" },
  "Account Type": { "category": "FinancialAccount", "field": "accountType" },
  "SSN#": { "category": "Member", "field": "ssnEncrypted" },
  "Bank Name": { "category": "BankDetail", "field": "bankName" },
  "Beneficiary 1 Name": { "category": "Beneficiary", "field": "benef1Name" },
  "Random New Column": { "category": "unknown", "field": "randomNewColumn" }
}`;

  try {
    const response = await tracedGenerate({
      name: 'excel_column_mapping',
      model,
      prompt,
      metadata: { headerCount: headers.length, headers, tableNames },
    });
    const parsed = JSON.parse(response);

    // Validate and normalize the mapping
    const mapping: ColumnMapping = {};
    for (const header of headers) {
      const match = parsed[header] || findCaseInsensitive(parsed, header);
      if (match) {
        mapping[header] = {
          category: normalizeCategory(match.category),
          field: match.field || toCamelCase(header),
        };
      } else {
        mapping[header] = { category: 'unknown', field: toCamelCase(header) };
      }
    }

    console.log(`[Column Mapper] AI mapped ${headers.length} columns:`,
      Object.entries(mapping).map(([h, m]) => `"${h}" → ${m.category}.${m.field}`).join(', ')
    );

    return mapping;
  } catch (error) {
    console.error('AI column mapping failed, using fallback:', error);
    return fallbackColumnMapping(headers);
  }
}

function findCaseInsensitive(obj: Record<string, unknown>, key: string): { category: string; field: string } | null {
  const match = Object.keys(obj).find(
    (k) => k.toLowerCase().trim() === key.toLowerCase().trim()
  );
  return match ? obj[match] as { category: string; field: string } : null;
}

/**
 * Normalize AI category names to our internal names.
 * AI might return "Household", "household", "HOUSEHOLD", etc.
 */
function normalizeCategory(cat: string): string {
  const normalized = cat.toLowerCase().trim();
  const MAP: Record<string, string> = {
    'household': 'household',
    'member': 'member',
    'financialaccount': 'account',
    'financial_account': 'account',
    'account': 'account',
    'bankdetail': 'bank',
    'bank_detail': 'bank',
    'bank': 'bank',
    'beneficiary': 'beneficiary',
    'customentity': 'customEntity',
    'goalorpreference': 'goal',
    'changelogentry': 'changelog',
    'unknown': 'unknown',
  };
  return MAP[normalized] || 'unknown';
}

function toCamelCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

// Fallback static mapping if AI is unavailable
function fallbackColumnMapping(headers: string[]): ColumnMapping {
  const STATIC_MAP: Record<string, { category: string; field: string }> = {
    'household name': { category: 'household', field: 'name' },
    'household': { category: 'household', field: 'name' },
    'hh name': { category: 'household', field: 'name' },
    'first name': { category: 'member', field: 'firstName' },
    'last name': { category: 'member', field: 'lastName' },
    'account type': { category: 'account', field: 'accountType' },
    'custodian': { category: 'account', field: 'custodian' },
    'phone #': { category: 'member', field: 'phone' },
    'phone': { category: 'member', field: 'phone' },
    'email': { category: 'member', field: 'email' },
    'address': { category: 'member', field: 'address' },
    'ssn#': { category: 'member', field: 'ssnEncrypted' },
    'ssn': { category: 'member', field: 'ssnEncrypted' },
    'dob': { category: 'member', field: 'dateOfBirth' },
    'date of birth': { category: 'member', field: 'dateOfBirth' },
    'occupation': { category: 'member', field: 'occupation' },
    'employer': { category: 'member', field: 'employer' },
    'client tax bracket': { category: 'household', field: 'taxBracket' },
    'tax bracket': { category: 'household', field: 'taxBracket' },
    'estimated liquid net worth': { category: 'household', field: 'liquidNetWorth' },
    'liquid net worth': { category: 'household', field: 'liquidNetWorth' },
    'estimated total net worth': { category: 'household', field: 'totalNetWorth' },
    'total net worth': { category: 'household', field: 'totalNetWorth' },
    'annual income': { category: 'member', field: 'annualIncome' },
    'risk tolerance': { category: 'account', field: 'riskTolerance' },
    'time horizon': { category: 'account', field: 'timeHorizon' },
    'account decision making': { category: 'account', field: 'decisionMaking' },
    'source of funds': { category: 'account', field: 'sourceOfFunds' },
    'primary use of funds': { category: 'account', field: 'primaryUseOfFunds' },
    'liquidity needs': { category: 'account', field: 'liquidityNeeds' },
    'liquidity time horizon': { category: 'account', field: 'liquidityTimeHorizon' },
    'primary investment objective': { category: 'account', field: 'investmentObjective' },
    'investment objective': { category: 'account', field: 'investmentObjective' },
    'marital status': { category: 'member', field: 'maritalStatus' },
    'bank name': { category: 'bank', field: 'bankName' },
    'bank type - checking/savings': { category: 'bank', field: 'bankType' },
    'bank type': { category: 'bank', field: 'bankType' },
    'account no': { category: 'bank', field: 'accountNumber' },
    'beneficiary 1 name': { category: 'beneficiary', field: 'benef1Name' },
    'beneficiary 1  %': { category: 'beneficiary', field: 'benef1Pct' },
    'beneficiary 1 %': { category: 'beneficiary', field: 'benef1Pct' },
    'beneficiary 1 dob': { category: 'beneficiary', field: 'benef1Dob' },
    'beneficiary 2 name': { category: 'beneficiary', field: 'benef2Name' },
    'beneficiary 2 %': { category: 'beneficiary', field: 'benef2Pct' },
    'beneficiary 2  %': { category: 'beneficiary', field: 'benef2Pct' },
    'beneficiary 2 dob': { category: 'beneficiary', field: 'benef2Dob' },
    'drivers license/id #': { category: 'member', field: 'driversLicense' },
    'drivers license/id state': { category: 'member', field: 'dlState' },
    'drivers license/id issue date': { category: 'member', field: 'dlIssueDate' },
    'drivers license/id expiration date': { category: 'member', field: 'dlExpiryDate' },
    'years of experience - bonds': { category: 'account', field: 'yearsExpBonds' },
    'years of experience - stocks': { category: 'account', field: 'yearsExpStocks' },
    'years of experience - alternatives': { category: 'account', field: 'yearsExpAlternatives' },
    'years of expience - vas': { category: 'account', field: 'yearsExpVAs' },
    'years of experience - vas': { category: 'account', field: 'yearsExpVAs' },
    'years of experience - mutual funds': { category: 'account', field: 'yearsExpMutualFunds' },
    'years of experience - options': { category: 'account', field: 'yearsExpOptions' },
    'years of experience - partnerships': { category: 'account', field: 'yearsExpPartnerships' },
    'account value': { category: 'account', field: 'accountValue' },
    'ownership dist': { category: 'account', field: 'ownershipDist' },
  };

  const mapping: ColumnMapping = {};
  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (STATIC_MAP[normalized]) {
      mapping[header] = STATIC_MAP[normalized] as ColumnMapping[string];
    } else {
      mapping[header] = { category: 'unknown', field: toCamelCase(header) };
    }
  }
  return mapping;
}
