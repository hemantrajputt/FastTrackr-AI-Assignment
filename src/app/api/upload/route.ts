import { NextRequest, NextResponse } from 'next/server';
import { processUpload } from '@/lib/pipeline/processor';

export const maxDuration = 120; // Allow up to 2 minutes for processing

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const excelFile = formData.get('excelFile') as File | null;
    const audioFile = formData.get('audioFile') as File | null;

    if (!excelFile && !audioFile) {
      return NextResponse.json(
        { error: 'Please upload at least one file (Excel or Audio)' },
        { status: 400 }
      );
    }

    let excelBuffer: Buffer | null = null;
    let audioBuffer: Buffer | null = null;
    let audioMimeType = 'audio/mpeg';

    if (excelFile) {
      const arrayBuffer = await excelFile.arrayBuffer();
      excelBuffer = Buffer.from(arrayBuffer);
    }

    if (audioFile) {
      const arrayBuffer = await audioFile.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      audioMimeType = audioFile.type || 'audio/mpeg';
    }

    const result = await processUpload(excelBuffer, audioBuffer, audioMimeType);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Upload processing error:', error);
    return NextResponse.json(
      { error: 'Failed to process upload', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
