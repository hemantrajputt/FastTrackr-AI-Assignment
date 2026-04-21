import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion } from '@/lib/ai/agent';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, history } = body;

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'A question is required.' },
        { status: 400 }
      );
    }

    const chatHistory = Array.isArray(history) ? history : [];

    const result = await answerQuestion(question.trim(), chatHistory);

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI Insights API error:', error);
    return NextResponse.json(
      {
        answer: 'An internal error occurred while processing your question.',
        data: null,
        sql: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
