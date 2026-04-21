import prisma from '@/lib/db';
import { Prisma } from '@prisma/client';
import { parseExcelFile, type ParsedHousehold } from '@/lib/excel/parser';
import { transcribeAudio, extractFromTranscript, type ExtractionResult } from '@/lib/audio/extractor';

function toJson(obj: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(obj)) as Prisma.InputJsonValue;
}

export interface ProcessingResult {
  success: boolean;
  excel?: {
    householdsCreated: number;
    householdsUpdated: number;
    membersCreated: number;
    membersUpdated: number;
    accountsCreated: number;
    accountsUpdated: number;
  };
  audio?: {
    transcript: string;
    householdMatched: string;
    membersMatched: string[];
    membersNotFound: string[];
    updatesApplied: number;
    summary: string;
  };
  errors: string[];
}

export async function processUpload(
  excelBuffer: Buffer | null,
  audioBuffer: Buffer | null,
  audioMimeType: string = 'audio/mpeg'
): Promise<ProcessingResult> {
  const result: ProcessingResult = {
    success: true,
    errors: [],
  };

  // Step 1: Process Excel first (creates/upserts households)
  if (excelBuffer) {
    try {
      const parsed = await parseExcelFile(excelBuffer);
      result.excel = await upsertHouseholds(parsed);
    } catch (error) {
      result.errors.push(`Excel processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }
  }

  // Step 2: Process Audio second (enriches existing households)
  if (audioBuffer) {
    try {
      const transcript = await transcribeAudio(audioBuffer, audioMimeType);

      const existingHouseholds = await prisma.household.findMany({
        include: {
          members: { select: { firstName: true, lastName: true } },
        },
      });

      const householdList = existingHouseholds.map((h) => ({
        name: h.name,
        members: h.members.map((m) => `${m.firstName} ${m.lastName || ''}`).map((n) => n.trim()),
      }));

      const extraction = await extractFromTranscript(transcript, householdList);
      const updatesApplied = await applyAudioUpdates(extraction);

      // Determine member matches
      const membersMatched: string[] = [];
      const membersNotFound: string[] = [];

      // Collect all member names referenced in updates
      const referencedMembers = new Set<string>();
      for (const update of extraction.updates) {
        if (update.member) referencedMembers.add(update.member);
        if (update.data?.firstName) {
          const fullName = `${update.data.firstName} ${update.data.lastName || ''}`.trim();
          referencedMembers.add(fullName);
        }
        if (update.linkedTo) referencedMembers.add(update.linkedTo);
      }

      // Check which referenced members exist in the matched household
      if (extraction.householdName) {
        const matchedHH = existingHouseholds.find(h => h.name === extraction.householdName);
        const existingMemberNames = matchedHH?.members.map(m => `${m.firstName} ${m.lastName || ''}`.trim().toLowerCase()) || [];

        for (const name of referencedMembers) {
          if (existingMemberNames.some(em => em.includes(name.toLowerCase()) || name.toLowerCase().includes(em))) {
            membersMatched.push(name);
          } else {
            membersNotFound.push(name);
          }
        }
      } else {
        // No household matched — all members are not found
        for (const name of referencedMembers) {
          membersNotFound.push(name);
        }
      }

      result.audio = {
        transcript,
        householdMatched: extraction.householdName,
        membersMatched,
        membersNotFound,
        updatesApplied,
        summary: extraction.summary,
      };
    } catch (error) {
      result.errors.push(`Audio processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.success = false;
    }
  }

  return result;
}

// ── Helper: overwrite if new value is non-null, keep old otherwise ──

function overwrite<T>(newVal: T | null | undefined, oldVal: T | null | undefined): T | null | undefined {
  return newVal != null ? newVal : oldVal;
}

// ── UPSERT HOUSEHOLDS ──

async function upsertHouseholds(parsed: ParsedHousehold[]): Promise<{
  householdsCreated: number;
  householdsUpdated: number;
  membersCreated: number;
  membersUpdated: number;
  accountsCreated: number;
  accountsUpdated: number;
}> {
  let householdsCreated = 0;
  let householdsUpdated = 0;
  let membersCreated = 0;
  let membersUpdated = 0;
  let accountsCreated = 0;
  let accountsUpdated = 0;

  for (const ph of parsed) {
    // ── 1. Upsert Household by name ──
    const existingHousehold = await prisma.household.findUnique({
      where: { name: ph.name },
    });

    let household;
    if (existingHousehold) {
      household = await prisma.household.update({
        where: { name: ph.name },
        data: {
          taxBracket: overwrite(ph.taxBracket, existingHousehold.taxBracket),
          liquidNetWorth: overwrite(ph.liquidNetWorth, existingHousehold.liquidNetWorth),
          totalNetWorth: overwrite(ph.totalNetWorth, existingHousehold.totalNetWorth),
          annualIncome: overwrite(ph.annualIncome, existingHousehold.annualIncome),
          riskTolerance: overwrite(ph.riskTolerance, existingHousehold.riskTolerance),
          investmentObjective: overwrite(ph.investmentObjective, existingHousehold.investmentObjective),
          additionalInfo: toJson({
            ...(existingHousehold.additionalInfo as Record<string, unknown> || {}),
            ...ph.additionalInfo,
          }),
        },
      });
      householdsUpdated++;
    } else {
      household = await prisma.household.create({
        data: {
          name: ph.name,
          taxBracket: ph.taxBracket,
          liquidNetWorth: ph.liquidNetWorth,
          totalNetWorth: ph.totalNetWorth,
          annualIncome: ph.annualIncome,
          riskTolerance: ph.riskTolerance,
          investmentObjective: ph.investmentObjective,
          additionalInfo: toJson(ph.additionalInfo),
        },
      });
      householdsCreated++;
    }

    // Log to changelog
    await prisma.changelogEntry.create({
      data: {
        householdId: household.id,
        sourceType: 'excel',
        changeType: existingHousehold ? 'field_update' : 'new_household',
        entityTable: 'households',
        entityId: household.id,
        summary: existingHousehold
          ? `Updated household "${ph.name}" from Excel import`
          : `Created household "${ph.name}" from Excel import`,
      },
    });

    // ── 2. Upsert Members ──
    for (const pm of ph.members) {
      const existingMember = await prisma.member.findFirst({
        where: {
          householdId: household.id,
          firstName: pm.firstName,
          lastName: pm.lastName,
        },
      });

      let member;
      if (existingMember) {
        // UPDATE: overwrite all non-null fields from the new data
        member = await prisma.member.update({
          where: { id: existingMember.id },
          data: {
            memberType: overwrite(pm.memberType, existingMember.memberType) || 'individual',
            dateOfBirth: overwrite(pm.dateOfBirth, existingMember.dateOfBirth),
            ssnEncrypted: overwrite(pm.ssn, existingMember.ssnEncrypted),
            phone: overwrite(pm.phone, existingMember.phone),
            email: overwrite(pm.email, existingMember.email),
            address: overwrite(pm.address, existingMember.address),
            occupation: overwrite(pm.occupation, existingMember.occupation),
            employer: overwrite(pm.employer, existingMember.employer),
            annualIncome: overwrite(pm.annualIncome, existingMember.annualIncome),
            maritalStatus: overwrite(pm.maritalStatus, existingMember.maritalStatus),
            driversLicense: overwrite(pm.driversLicense, existingMember.driversLicense),
            dlState: overwrite(pm.dlState, existingMember.dlState),
            dlIssueDate: overwrite(pm.dlIssueDate, existingMember.dlIssueDate),
            dlExpiryDate: overwrite(pm.dlExpiryDate, existingMember.dlExpiryDate),
            additionalInfo: toJson({
              ...(existingMember.additionalInfo as Record<string, unknown> || {}),
              ...pm.additionalInfo,
            }),
          },
        });
        membersUpdated++;
      } else {
        // CREATE new member
        member = await prisma.member.create({
          data: {
            householdId: household.id,
            firstName: pm.firstName,
            lastName: pm.lastName,
            memberType: pm.memberType,
            dateOfBirth: pm.dateOfBirth,
            ssnEncrypted: pm.ssn,
            phone: pm.phone,
            email: pm.email,
            address: pm.address,
            occupation: pm.occupation,
            employer: pm.employer,
            annualIncome: pm.annualIncome,
            maritalStatus: pm.maritalStatus,
            driversLicense: pm.driversLicense,
            dlState: pm.dlState,
            dlIssueDate: pm.dlIssueDate,
            dlExpiryDate: pm.dlExpiryDate,
            additionalInfo: toJson(pm.additionalInfo),
          },
        });
        membersCreated++;
      }

      // ── 3. Upsert Accounts by memberId + accountType + accountTypeDetail ──
      for (const pa of pm.accounts) {
        const existingAccount = await prisma.financialAccount.findFirst({
          where: {
            householdId: household.id,
            memberId: member.id,
            accountType: pa.accountType,
            accountTypeDetail: pa.accountTypeDetail,
          },
        });

        let account;
        if (existingAccount) {
          // UPDATE existing account — overwrite non-null fields
          account = await prisma.financialAccount.update({
            where: { id: existingAccount.id },
            data: {
              custodian: overwrite(pa.custodian, existingAccount.custodian),
              accountValue: overwrite(pa.accountValue, existingAccount.accountValue),
              ownershipDist: overwrite(pa.ownershipDist, existingAccount.ownershipDist),
              investmentObjective: overwrite(pa.investmentObjective, existingAccount.investmentObjective),
              riskTolerance: overwrite(pa.riskTolerance, existingAccount.riskTolerance),
              timeHorizon: overwrite(pa.timeHorizon, existingAccount.timeHorizon),
              decisionMaking: overwrite(pa.decisionMaking, existingAccount.decisionMaking),
              sourceOfFunds: overwrite(pa.sourceOfFunds, existingAccount.sourceOfFunds),
              primaryUseOfFunds: overwrite(pa.primaryUseOfFunds, existingAccount.primaryUseOfFunds),
              liquidityNeeds: overwrite(pa.liquidityNeeds, existingAccount.liquidityNeeds),
              liquidityTimeHorizon: overwrite(pa.liquidityTimeHorizon, existingAccount.liquidityTimeHorizon),
              yearsExpBonds: overwrite(pa.yearsExpBonds, existingAccount.yearsExpBonds),
              yearsExpStocks: overwrite(pa.yearsExpStocks, existingAccount.yearsExpStocks),
              yearsExpAlternatives: overwrite(pa.yearsExpAlternatives, existingAccount.yearsExpAlternatives),
              yearsExpVAs: overwrite(pa.yearsExpVAs, existingAccount.yearsExpVAs),
              yearsExpMutualFunds: overwrite(pa.yearsExpMutualFunds, existingAccount.yearsExpMutualFunds),
              yearsExpOptions: overwrite(pa.yearsExpOptions, existingAccount.yearsExpOptions),
              yearsExpPartnerships: overwrite(pa.yearsExpPartnerships, existingAccount.yearsExpPartnerships),
              additionalInfo: toJson({
                ...(existingAccount.additionalInfo as Record<string, unknown> || {}),
                ...pa.additionalInfo,
              }),
            },
          });
          accountsUpdated++;

          // Replace beneficiaries: delete old, create new
          await prisma.beneficiary.deleteMany({
            where: { accountId: account.id },
          });
        } else {
          // CREATE new account
          account = await prisma.financialAccount.create({
            data: {
              householdId: household.id,
              memberId: member.id,
              accountType: pa.accountType,
              accountTypeDetail: pa.accountTypeDetail,
              custodian: pa.custodian,
              accountValue: pa.accountValue,
              ownershipDist: pa.ownershipDist,
              investmentObjective: pa.investmentObjective,
              riskTolerance: pa.riskTolerance,
              timeHorizon: pa.timeHorizon,
              decisionMaking: pa.decisionMaking,
              sourceOfFunds: pa.sourceOfFunds,
              primaryUseOfFunds: pa.primaryUseOfFunds,
              liquidityNeeds: pa.liquidityNeeds,
              liquidityTimeHorizon: pa.liquidityTimeHorizon,
              yearsExpBonds: pa.yearsExpBonds,
              yearsExpStocks: pa.yearsExpStocks,
              yearsExpAlternatives: pa.yearsExpAlternatives,
              yearsExpVAs: pa.yearsExpVAs,
              yearsExpMutualFunds: pa.yearsExpMutualFunds,
              yearsExpOptions: pa.yearsExpOptions,
              yearsExpPartnerships: pa.yearsExpPartnerships,
              additionalInfo: toJson(pa.additionalInfo),
            },
          });
          accountsCreated++;
        }

        // Create beneficiaries (fresh for both create and update)
        for (const pb of pa.beneficiaries) {
          await prisma.beneficiary.create({
            data: {
              accountId: account.id,
              name: pb.name,
              percentage: pb.percentage,
              dateOfBirth: pb.dateOfBirth,
            },
          });
        }
      }

      // ── 4. Upsert Bank Details by memberId + bankName + accountNumber ──
      for (const bd of pm.bankDetails) {
        const existingBank = await prisma.bankDetail.findFirst({
          where: {
            memberId: member.id,
            bankName: bd.bankName,
            accountNumber: bd.accountNumber,
          },
        });

        if (existingBank) {
          // UPDATE: overwrite non-null
          await prisma.bankDetail.update({
            where: { id: existingBank.id },
            data: {
              bankType: overwrite(bd.bankType, existingBank.bankType),
              routingNumber: overwrite(bd.routingNumber, existingBank.routingNumber),
            },
          });
        } else {
          // CREATE new bank detail
          await prisma.bankDetail.create({
            data: {
              memberId: member.id,
              bankName: bd.bankName,
              bankType: bd.bankType,
              accountNumber: bd.accountNumber,
              routingNumber: bd.routingNumber,
            },
          });
        }
      }
    }
  }

  return { householdsCreated, householdsUpdated, membersCreated, membersUpdated, accountsCreated, accountsUpdated };
}

// ── AUDIO UPDATES ──

async function applyAudioUpdates(extraction: ExtractionResult): Promise<number> {
  if (!extraction.householdName || extraction.updates.length === 0) return 0;

  const household = await prisma.household.findUnique({
    where: { name: extraction.householdName },
    include: { members: true },
  });

  if (!household) {
    console.error(`Household "${extraction.householdName}" not found for audio enrichment`);
    return 0;
  }

  let appliedCount = 0;

  for (const update of extraction.updates) {
    try {
      switch (update.type) {
        case 'FIELD_UPDATE':
        case 'CORRECTION': {
          if (update.table === 'households') {
            const data: Record<string, unknown> = {};
            if (update.field) data[update.field] = update.newValue;
            await prisma.household.update({
              where: { id: household.id },
              data,
            });
          } else if (update.table === 'members' && update.member) {
            const memberNames = update.member.split(' ');
            const member = household.members.find(
              (m) =>
                m.firstName.toLowerCase() === (memberNames[0] || '').toLowerCase() ||
                `${m.firstName} ${m.lastName}`.toLowerCase() === update.member!.toLowerCase()
            );
            if (member && update.field) {
              const data: Record<string, unknown> = {};
              data[update.field] = update.newValue;
              await prisma.member.update({
                where: { id: member.id },
                data,
              });
            }
          }

          await prisma.changelogEntry.create({
            data: {
              householdId: household.id,
              sourceType: 'audio',
              changeType: update.type === 'CORRECTION' ? 'correction' : 'field_update',
              entityTable: update.table,
              fieldName: update.field,
              oldValue: update.oldValue,
              newValue: String(update.newValue),
              summary: update.reason || `Updated ${update.field} from audio conversation`,
              confidence: update.confidence,
            },
          });
          appliedCount++;
          break;
        }

        case 'NEW_KNOWN_ENTITY': {
          if (update.table === 'members' && update.data) {
            await prisma.member.create({
              data: {
                householdId: household.id,
                firstName: String(update.data.firstName || ''),
                lastName: update.data.lastName ? String(update.data.lastName) : null,
                memberType: String(update.data.memberType || 'individual'),
                relationship: update.data.relationship ? String(update.data.relationship) : null,
                phone: update.data.phone ? String(update.data.phone) : null,
                email: update.data.email ? String(update.data.email) : null,
                occupation: update.data.occupation ? String(update.data.occupation) : null,
              },
            });
          } else if (update.table === 'financial_accounts' && update.data) {
            const memberName = update.data.member ? String(update.data.member) : null;
            let memberId: string | null = null;
            if (memberName) {
              const member = household.members.find(
                (m) => `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberName.toLowerCase())
              );
              memberId = member?.id || null;
            }
            await prisma.financialAccount.create({
              data: {
                householdId: household.id,
                memberId,
                accountType: String(update.data.accountType || 'Unknown'),
                custodian: update.data.custodian ? String(update.data.custodian) : null,
                accountValue: update.data.accountValue ? Number(update.data.accountValue) : null,
              },
            });
          }

          await prisma.changelogEntry.create({
            data: {
              householdId: household.id,
              sourceType: 'audio',
              changeType: 'new_entity',
              entityTable: update.table,
              summary: `New ${update.table} created from audio conversation`,
              confidence: update.confidence,
            },
          });
          appliedCount++;
          break;
        }

        case 'NEW_CUSTOM_ENTITY': {
          await prisma.customEntity.create({
            data: {
              householdId: household.id,
              entityType: update.entityType || 'unknown',
              title: update.title || 'Untitled',
              data: toJson(update.data || {}),
              source: 'audio',
            },
          });

          await prisma.changelogEntry.create({
            data: {
              householdId: household.id,
              sourceType: 'audio',
              changeType: 'new_entity',
              entityTable: 'custom_entities',
              summary: `New ${update.entityType}: "${update.title}" from audio conversation`,
              confidence: update.confidence,
            },
          });
          appliedCount++;
          break;
        }

        case 'GOAL_OR_PREFERENCE': {
          await prisma.goalOrPreference.create({
            data: {
              householdId: household.id,
              category: update.category || 'general',
              description: update.description || '',
              priority: update.priority,
              targetDate: update.targetDate ? new Date(update.targetDate) : null,
              source: 'audio',
            },
          });

          await prisma.changelogEntry.create({
            data: {
              householdId: household.id,
              sourceType: 'audio',
              changeType: 'new_goal',
              entityTable: 'goals_and_preferences',
              summary: `New ${update.category} goal: "${update.description}"`,
              confidence: update.confidence,
            },
          });
          appliedCount++;
          break;
        }
      }
    } catch (error) {
      console.error(`Failed to apply update:`, update, error);
    }
  }

  return appliedCount;
}
