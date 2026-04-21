import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const household = await prisma.household.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            financialAccounts: {
              include: {
                beneficiaries: true,
              },
            },
            bankDetails: true,
            customEntities: true,
            goalsAndPreferences: true,
          },
        },
        customEntities: {
          where: { memberId: null },
        },
        goalsAndPreferences: {
          where: { memberId: null },
        },
        changelog: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!household) {
      return NextResponse.json(
        { error: 'Household not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ household });
  } catch (error) {
    console.error('Error fetching household:', error);
    return NextResponse.json(
      { error: 'Failed to fetch household details' },
      { status: 500 }
    );
  }
}
