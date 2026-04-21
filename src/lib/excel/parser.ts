import ExcelJS from 'exceljs';
import { mapColumnsWithAI, type ColumnMapping } from './columnMapper';

export interface ParsedHousehold {
  name: string;
  taxBracket: string | null;
  liquidNetWorth: number | null;
  totalNetWorth: number | null;
  annualIncome: number | null;
  expenseRange: number | null;
  riskTolerance: string | null;
  investmentObjective: string | null;
  additionalInfo: Record<string, unknown>;
  members: ParsedMember[];
}

export interface ParsedMember {
  firstName: string;
  lastName: string | null;
  memberType: string;
  dateOfBirth: Date | null;
  ssn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  employer: string | null;
  annualIncome: number | null;
  maritalStatus: string | null;
  driversLicense: string | null;
  dlState: string | null;
  dlIssueDate: Date | null;
  dlExpiryDate: Date | null;
  relationship: string | null;
  additionalInfo: Record<string, unknown>;
  accounts: ParsedAccount[];
  bankDetails: ParsedBankDetail[];
  /** Internal: raw income values from each Excel row for deduplication */
  _incomeEntries: number[];
}

export interface ParsedAccount {
  accountType: string;
  accountTypeDetail: string | null;
  custodian: string | null;
  accountValue: number | null;
  investmentObjective: string | null;
  riskTolerance: string | null;
  timeHorizon: string | null;
  decisionMaking: string | null;
  sourceOfFunds: string | null;
  primaryUseOfFunds: string | null;
  liquidityNeeds: string | null;
  liquidityTimeHorizon: string | null;
  yearsExpBonds: number | null;
  yearsExpStocks: number | null;
  yearsExpAlternatives: number | null;
  yearsExpVAs: number | null;
  yearsExpMutualFunds: number | null;
  yearsExpOptions: number | null;
  yearsExpPartnerships: number | null;
  ownershipDist: string | null;
  additionalInfo: Record<string, unknown>;
  beneficiaries: ParsedBeneficiary[];
}

export interface ParsedBankDetail {
  bankName: string;
  bankType: string | null;
  accountNumber: string | null;
  routingNumber: string | null;
}

export interface ParsedBeneficiary {
  name: string;
  percentage: number | null;
  dateOfBirth: Date | null;
}

// ── Helper Functions ──

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const str = String(value);
    // Date as number like 12251969 (MMDDYYYY)
    if (str.length === 8) {
      const month = parseInt(str.slice(0, 2));
      const day = parseInt(str.slice(2, 4));
      const year = parseInt(str.slice(4, 8));
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day);
      }
    }
    // Excel serial date
    if (value > 20000 && value < 60000) {
      return new Date((value - 25569) * 86400 * 1000);
    }
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed === '?' || trimmed === 'N/A') return null;
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function cleanString(value: unknown): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (!str || str === '?' || str === 'N/A' || str === 'n/a') return null;
  return str;
}

function cleanNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,$%\s]/g, '');
    if (!cleaned || cleaned === '?' || cleaned === 'N/A') return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseAccountType(raw: string): { type: string; detail: string | null } {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(.+?)\s*\((.+)\)\s*(.*)$/);
  if (match) {
    const baseType = match[1].trim();
    const parenthetical = match[2].trim();
    const suffix = match[3]?.trim();
    const detail = suffix ? `${parenthetical}, ${suffix}` : parenthetical;
    return { type: baseType, detail };
  }
  return { type: trimmed, detail: null };
}

// Check if a member row has identical personal data to an existing member
function isSameMember(existing: ParsedMember, row: Record<string, unknown>): boolean {
  // Must match on name
  const firstName = cleanString(row.firstName);
  const lastName = cleanString(row.lastName);
  if (existing.firstName !== firstName) return false;
  if ((existing.lastName || null) !== (lastName || null)) return false;

  // If both have DOB and they differ → different person
  const rowDob = parseDate(row.dateOfBirth);
  if (existing.dateOfBirth && rowDob) {
    if (existing.dateOfBirth.getTime() !== rowDob.getTime()) return false;
  }

  // If both have SSN and they differ → different person
  const rowSsn = cleanString(row.ssnEncrypted) || cleanString(row.ssn);
  if (existing.ssn && rowSsn) {
    if (existing.ssn !== rowSsn) return false;
  }

  return true;
}

// Merge non-null member-level fields from a new row into existing member
function mergeMemberData(existing: ParsedMember, row: Record<string, unknown>): void {
  if (!existing.dateOfBirth && row.dateOfBirth) existing.dateOfBirth = parseDate(row.dateOfBirth);
  if (!existing.ssn) existing.ssn = cleanString(row.ssnEncrypted) || cleanString(row.ssn);
  if (!existing.phone && row.phone) existing.phone = cleanString(row.phone);
  if (!existing.email && row.email) existing.email = cleanString(row.email);
  if (!existing.address && row.address) existing.address = cleanString(row.address);
  if (!existing.occupation && row.occupation) existing.occupation = cleanString(row.occupation);
  if (!existing.employer && row.employer) existing.employer = cleanString(row.employer);
  if (!existing.maritalStatus && row.maritalStatus) existing.maritalStatus = cleanString(row.maritalStatus);
  if (!existing.driversLicense && row.driversLicense) existing.driversLicense = cleanString(row.driversLicense);
  if (!existing.dlState && row.dlState) existing.dlState = cleanString(row.dlState);
  if (!existing.dlIssueDate && row.dlIssueDate) existing.dlIssueDate = parseDate(row.dlIssueDate);
  if (!existing.dlExpiryDate && row.dlExpiryDate) existing.dlExpiryDate = parseDate(row.dlExpiryDate);
  if (!existing.relationship && row.relationship) existing.relationship = cleanString(row.relationship);

  // Collect income entries for deduplication
  const rowIncome = cleanNumber(row.annualIncome);
  if (rowIncome != null) {
    existing._incomeEntries.push(rowIncome);
  }
}

/**
 * Compute a member's annual income from their collected income entries.
 * - If all entries have the same value → count once (deduplicated)
 * - If entries have different values → sum all entries
 */
function computeMemberIncome(entries: number[]): number | null {
  if (entries.length === 0) return null;
  const uniqueValues = new Set(entries);
  if (uniqueValues.size === 1) {
    // Same income across all accounts → count once
    return entries[0];
  }
  // Different incomes across accounts → sum all
  return entries.reduce((sum, v) => sum + v, 0);
}

/**
 * Compute household annual income by summing each member's deduplicated income.
 */
function computeHouseholdIncome(members: ParsedMember[]): number | null {
  let total = 0;
  let hasAnyIncome = false;

  for (const member of members) {
    const memberIncome = computeMemberIncome(member._incomeEntries);
    if (memberIncome != null) {
      hasAnyIncome = true;
      total += memberIncome;
    }
  }

  return hasAnyIncome ? total : null;
}

// ── Main Parser ──

export async function parseExcelFile(buffer: Buffer): Promise<ParsedHousehold[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const householdsMap = new Map<string, ParsedHousehold>();

  for (const worksheet of workbook.worksheets) {
    if (!worksheet || worksheet.rowCount < 2) continue;

    // Step 1: Extract headers
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    const headerPositions: Map<number, string> = new Map();

    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value || '').trim();
      if (header) {
        headers.push(header);
        headerPositions.set(colNumber, header);
      }
    });

    if (headers.length === 0) continue;

    // Step 2: Use AI to map columns to schema fields
    console.log(`[Excel Parser] Found ${headers.length} columns, mapping with AI...`);
    const columnMapping: ColumnMapping = await mapColumnsWithAI(headers);
    console.log(`[Excel Parser] Column mapping complete. Processing ${worksheet.rowCount - 1} rows...`);

    // Step 3: Process each data row
    for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
      const row = worksheet.getRow(rowNum);
      if (!row.hasValues) continue;

      // Build categorized record from this row
      const householdData: Record<string, unknown> = {};
      const memberData: Record<string, unknown> = {};
      const accountData: Record<string, unknown> = {};
      const bankData: Record<string, unknown> = {};
      const beneficiaryData: Record<string, unknown> = {};
      const unknownData: Record<string, unknown> = {};

      headerPositions.forEach((header, colNum) => {
        const cellValue = row.getCell(colNum).value;
        if (cellValue == null || cellValue === '') return;

        const mapping = columnMapping[header];
        if (!mapping) return;

        switch (mapping.category) {
          case 'household':
            householdData[mapping.field] = cellValue;
            break;
          case 'member':
            memberData[mapping.field] = cellValue;
            break;
          case 'account':
            accountData[mapping.field] = cellValue;
            break;
          case 'bank':
            bankData[mapping.field] = cellValue;
            break;
          case 'beneficiary':
            beneficiaryData[mapping.field] = cellValue;
            break;
          case 'unknown':
            unknownData[mapping.field] = cellValue;
            break;
        }
      });

      // --- Household ---
      // AI maps to Household.name (from schema) or household.householdName (fallback)
      const householdName = cleanString(householdData.name) || cleanString(householdData.householdName);
      if (!householdName) continue;

      if (!householdsMap.has(householdName)) {
        householdsMap.set(householdName, {
          name: householdName,
          taxBracket: cleanString(householdData.taxBracket),
          liquidNetWorth: cleanNumber(householdData.liquidNetWorth),
          totalNetWorth: cleanNumber(householdData.totalNetWorth),
          annualIncome: null, // computed after all rows are processed
          expenseRange: cleanNumber(householdData.expenseRange),
          riskTolerance: cleanString(householdData.riskTolerance),
          investmentObjective: cleanString(householdData.investmentObjective),
          additionalInfo: {},
          members: [],
        });
      }

      const household = householdsMap.get(householdName)!;

      // Merge household-level data (fill gaps)
      if (!household.taxBracket && householdData.taxBracket) household.taxBracket = cleanString(householdData.taxBracket);
      if (household.liquidNetWorth == null && householdData.liquidNetWorth) household.liquidNetWorth = cleanNumber(householdData.liquidNetWorth);
      if (household.totalNetWorth == null && householdData.totalNetWorth) household.totalNetWorth = cleanNumber(householdData.totalNetWorth);
      // annualIncome is computed after all rows are processed — not taken from householdData

      // --- Member ---
      const firstName = cleanString(memberData.firstName);
      if (!firstName) continue;

      // Find existing member in this household with same identity
      let member = household.members.find((m) => isSameMember(m, memberData));

      if (!member) {
        // Detect business entities (no last name, alphanumeric name pattern)
        const lastName = cleanString(memberData.lastName);
        const isEntity = !lastName && /^[A-Z0-9]/.test(firstName);

        // Collect the first income entry for this member
        const initialIncome = cleanNumber(memberData.annualIncome);

        member = {
          firstName,
          lastName,
          memberType: isEntity ? 'entity' : 'individual',
          dateOfBirth: parseDate(memberData.dateOfBirth),
          ssn: cleanString(memberData.ssnEncrypted) || cleanString(memberData.ssn),
          phone: cleanString(memberData.phone),
          email: cleanString(memberData.email),
          address: cleanString(memberData.address),
          occupation: cleanString(memberData.occupation),
          employer: cleanString(memberData.employer),
          annualIncome: null, // computed after all rows
          maritalStatus: cleanString(memberData.maritalStatus),
          driversLicense: cleanString(memberData.driversLicense),
          dlState: cleanString(memberData.dlState),
          dlIssueDate: parseDate(memberData.dlIssueDate),
          dlExpiryDate: parseDate(memberData.dlExpiryDate),
          relationship: cleanString(memberData.relationship),
          additionalInfo: {},
          accounts: [],
          bankDetails: [],
          _incomeEntries: initialIncome != null ? [initialIncome] : [],
        };
        household.members.push(member);
      } else {
        // Same member, different row — fill in any missing member-level data
        mergeMemberData(member, memberData);
      }

      // --- Account (ALWAYS create one per row if account type exists) ---
      const accountTypeRaw = cleanString(accountData.accountType);
      if (accountTypeRaw) {
        const { type, detail } = parseAccountType(accountTypeRaw);

        const account: ParsedAccount = {
          accountType: type,
          accountTypeDetail: detail,
          custodian: cleanString(accountData.custodian),
          accountValue: cleanNumber(accountData.accountValue),
          investmentObjective: cleanString(accountData.investmentObjective),
          riskTolerance: cleanString(accountData.riskTolerance),
          timeHorizon: cleanString(accountData.timeHorizon),
          decisionMaking: cleanString(accountData.decisionMaking),
          sourceOfFunds: cleanString(accountData.sourceOfFunds),
          primaryUseOfFunds: cleanString(accountData.primaryUseOfFunds),
          liquidityNeeds: cleanString(accountData.liquidityNeeds),
          liquidityTimeHorizon: cleanString(accountData.liquidityTimeHorizon),
          yearsExpBonds: cleanNumber(accountData.yearsExpBonds),
          yearsExpStocks: cleanNumber(accountData.yearsExpStocks),
          yearsExpAlternatives: cleanNumber(accountData.yearsExpAlternatives),
          yearsExpVAs: cleanNumber(accountData.yearsExpVAs),
          yearsExpMutualFunds: cleanNumber(accountData.yearsExpMutualFunds),
          yearsExpOptions: cleanNumber(accountData.yearsExpOptions),
          yearsExpPartnerships: cleanNumber(accountData.yearsExpPartnerships),
          ownershipDist: cleanString(accountData.ownershipDist),
          additionalInfo: Object.keys(unknownData).length > 0 ? { ...unknownData } : {},
          beneficiaries: [],
        };

        // Beneficiaries
        if (beneficiaryData.benef1Name) {
          account.beneficiaries.push({
            name: String(beneficiaryData.benef1Name),
            percentage: cleanNumber(beneficiaryData.benef1Pct),
            dateOfBirth: parseDate(beneficiaryData.benef1Dob),
          });
        }
        if (beneficiaryData.benef2Name) {
          account.beneficiaries.push({
            name: String(beneficiaryData.benef2Name),
            percentage: cleanNumber(beneficiaryData.benef2Pct),
            dateOfBirth: parseDate(beneficiaryData.benef2Dob),
          });
        }

        member.accounts.push(account);
      }

      // --- Bank Details (create if present, deduplicate by bankName+accountNumber) ---
      const bankName = cleanString(bankData.bankName);
      if (bankName) {
        const bankAcctNo = cleanString(bankData.accountNumber) || cleanString(bankData.bankAccountNo);
        const exists = member.bankDetails.find(
          (b) => b.bankName === bankName && b.accountNumber === bankAcctNo
        );
        if (!exists) {
          member.bankDetails.push({
            bankName,
            bankType: cleanString(bankData.bankType),
            accountNumber: bankAcctNo,
            routingNumber: cleanString(bankData.routingNumber),
          });
        }
      }
    }
  }

  // ── Post-processing: compute annual income from member-level deduplication ──
  for (const household of householdsMap.values()) {
    // Finalize each member's annualIncome from their collected entries
    for (const member of household.members) {
      member.annualIncome = computeMemberIncome(member._incomeEntries);
    }
    // Compute household total from member incomes
    household.annualIncome = computeHouseholdIncome(household.members);

    // Compute household primary investment objective from its accounts if not explicitly set
    if (!household.investmentObjective) {
      const objectives = new Map<string, number>();
      for (const member of household.members) {
        for (const account of member.accounts) {
          if (account.investmentObjective) {
            const obj = account.investmentObjective;
            objectives.set(obj, (objectives.get(obj) || 0) + 1);
          }
        }
      }
      
      if (objectives.size > 0) {
        let bestObj = null;
        let maxCount = -1;
        for (const [obj, count] of objectives.entries()) {
          if (count > maxCount) {
            maxCount = count;
            bestObj = obj;
          }
        }
        household.investmentObjective = bestObj;
      }
    }
  }

  const result = Array.from(householdsMap.values());
  console.log(`[Excel Parser] Parsed ${result.length} households with ${result.reduce((s, h) => s + h.members.length, 0)} members and ${result.reduce((s, h) => s + h.members.reduce((a, m) => a + m.accounts.length, 0), 0)} accounts`);
  return result;
}
