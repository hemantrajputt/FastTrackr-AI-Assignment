import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const households = await prisma.household.findMany({
      include: {
        members: {
          select: { id: true, firstName: true, lastName: true, memberType: true },
        },
        financialAccounts: {
          select: { id: true, accountType: true, accountValue: true },
        },
        _count: {
          select: {
            members: true,
            financialAccounts: true,
            customEntities: true,
            goalsAndPreferences: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const formatted = households.map((h) => ({
      id: h.id,
      name: h.name,
      taxBracket: h.taxBracket,
      liquidNetWorth: h.liquidNetWorth,
      totalNetWorth: h.totalNetWorth,
      annualIncome: h.annualIncome,
      investmentObjective: h.investmentObjective,
      riskTolerance: h.riskTolerance,
      memberCount: h._count.members,
      accountCount: h._count.financialAccounts,
      entityCount: h._count.customEntities,
      goalCount: h._count.goalsAndPreferences,
      members: h.members.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName || ''}`.trim(),
        type: m.memberType,
      })),
      updatedAt: h.updatedAt,
    }));

    return NextResponse.json({ households: formatted });
  } catch (error) {
    console.error('Error fetching households:', error);
    return NextResponse.json(
      { error: 'Failed to fetch households' },
      { status: 500 }
    );
  }
}
