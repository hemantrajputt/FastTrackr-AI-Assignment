import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Total counts
    const [
      householdCount,
      memberCount,
      accountCount,
    ] = await Promise.all([
      prisma.household.count(),
      prisma.member.count(),
      prisma.financialAccount.count(),
    ]);

    // Net worth by household (top 15)
    const households = await prisma.household.findMany({
      select: {
        name: true,
        liquidNetWorth: true,
        totalNetWorth: true,
        annualIncome: true,
        taxBracket: true,
        investmentObjective: true,
        riskTolerance: true,
        _count: { select: { members: true, financialAccounts: true } },
      },
      orderBy: { totalNetWorth: { sort: 'desc', nulls: 'last' } },
    });

    // Account type distribution
    const accounts = await prisma.financialAccount.groupBy({
      by: ['accountType'],
      _count: { id: true },
    });

    // Members per household
    const membersPerHH = households.map((h) => ({
      name: h.name,
      count: h._count.members,
    }));

    // Tax bracket distribution
    const taxBrackets: Record<string, number> = {};
    households.forEach((h) => {
      const bracket = h.taxBracket || 'Unknown';
      taxBrackets[bracket] = (taxBrackets[bracket] || 0) + 1;
    });

    // Investment objective distribution
    const investmentObjectives: Record<string, number> = {};
    households.forEach((h) => {
      const obj = h.investmentObjective || 'Not specified';
      investmentObjectives[obj] = (investmentObjectives[obj] || 0) + 1;
    });

    // Net worth breakdown
    const netWorthByHousehold = households
      .filter((h) => h.totalNetWorth)
      .map((h) => ({
        name: h.name.length > 20 ? h.name.slice(0, 18) + '...' : h.name,
        fullName: h.name,
        liquidNetWorth: h.liquidNetWorth || 0,
        totalNetWorth: h.totalNetWorth || 0,
        illiquidNetWorth: (h.totalNetWorth || 0) - (h.liquidNetWorth || 0),
      }));

    // Income by household
    const incomeByHousehold = households
      .filter((h) => h.annualIncome && h.annualIncome > 0)
      .map((h) => ({
        name: h.name.length > 20 ? h.name.slice(0, 18) + '...' : h.name,
        fullName: h.name,
        annualIncome: h.annualIncome || 0,
      }))
      .sort((a, b) => b.annualIncome - a.annualIncome);

    // Account type summary
    const accountTypeDistribution = accounts
      .map((a) => ({
        type: a.accountType,
        count: a._count.id,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);

    // Total net worth
    const totalNetWorth = households.reduce((sum, h) => sum + (h.totalNetWorth || 0), 0);
    const totalIncome = households.reduce((sum, h) => sum + (h.annualIncome || 0), 0);

    // Accounts per household
    const accountsPerHH = households.map((h) => ({
      name: h.name.length > 20 ? h.name.slice(0, 18) + '...' : h.name,
      fullName: h.name,
      count: h._count.financialAccounts,
    })).sort((a, b) => b.count - a.count);

    return NextResponse.json({
      summary: {
        totalHouseholds: householdCount,
        totalMembers: memberCount,
        totalAccounts: accountCount,
        totalNetWorth,
        totalIncome,
      },
      charts: {
        netWorthByHousehold,
        incomeByHousehold,
        accountTypeDistribution,
        membersPerHousehold: membersPerHH.sort((a, b) => b.count - a.count),
        accountsPerHousehold: accountsPerHH,
        taxBracketDistribution: Object.entries(taxBrackets).map(([bracket, count]) => ({
          bracket,
          count,
        })),
        investmentObjectiveDistribution: Object.entries(investmentObjectives).map(([obj, count]) => ({
          objective: obj,
          count,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching insights:', error);
    return NextResponse.json(
      { error: 'Failed to fetch insights' },
      { status: 500 }
    );
  }
}
