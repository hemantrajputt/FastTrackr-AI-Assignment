"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface UploadResult {
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

type ProcessingStep = {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
};

export default function UploadPage() {
  const router = useRouter();
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProcessingStep[]>([]);

  const handleDrop = useCallback((e: React.DragEvent, type: 'excel' | 'audio') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (type === 'excel') setExcelFile(file);
    else setAudioFile(file);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'excel' | 'audio') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (type === 'excel') setExcelFile(file);
    else setAudioFile(file);
  }, []);

  const handleUpload = async () => {
    if (!excelFile && !audioFile) return;
    setIsProcessing(true);
    setError(null);
    setResult(null);

    const processingSteps: ProcessingStep[] = [];
    if (excelFile) {
      processingSteps.push({ label: 'Parsing Excel file...', status: 'pending' });
      processingSteps.push({ label: 'Normalizing household data...', status: 'pending' });
      processingSteps.push({ label: 'Upserting to database...', status: 'pending' });
    }
    if (audioFile) {
      processingSteps.push({ label: 'Transcribing audio with AI...', status: 'pending' });
      processingSteps.push({ label: 'Extracting structured data...', status: 'pending' });
      processingSteps.push({ label: 'Applying updates to database...', status: 'pending' });
    }
    setSteps(processingSteps);

    // Animate steps
    for (let i = 0; i < processingSteps.length; i++) {
      setSteps(prev => prev.map((s, idx) => ({ ...s, status: idx === i ? 'active' : idx < i ? 'done' : s.status })));
      if (i === 0) break; // Only animate first step before actual upload
    }

    try {
      const formData = new FormData();
      if (excelFile) formData.append('excelFile', excelFile);
      if (audioFile) formData.append('audioFile', audioFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setSteps(prev => prev.map(s => s.status === 'active' ? { ...s, status: 'error' } : s));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Upload Client Data</h1>
        <p className="page-subtitle">
          Upload an Excel file to create or update households, and/or an audio recording to enrich existing data.
        </p>
      </div>

      <div className="grid-2" style={{ marginBottom: '2rem' }}>
        {/* Excel Drop Zone */}
        <div
          className="card"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, 'excel')}
          style={{
            textAlign: 'center',
            cursor: 'pointer',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            borderStyle: excelFile ? 'solid' : 'dashed',
            borderWidth: '2px',
            borderColor: excelFile ? 'var(--accent-success)' : 'var(--border-default)',
          }}
          onClick={() => document.getElementById('excel-input')?.click()}
        >
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: excelFile ? 'var(--accent-success)' : 'var(--text-muted)' }}>{excelFile ? 'Ready' : 'XLS'}</div>
          <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {excelFile ? excelFile.name : 'Excel File'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {excelFile
              ? `${(excelFile.size / 1024).toFixed(1)} KB`
              : 'Drag & drop or click to upload .xlsx, .xls'}
          </div>
          {excelFile && (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              onClick={(e) => { e.stopPropagation(); setExcelFile(null); }}
            >
              Remove
            </button>
          )}
          <input
            id="excel-input"
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelect(e, 'excel')}
          />
        </div>

        {/* Audio Drop Zone */}
        <div
          className="card"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => handleDrop(e, 'audio')}
          style={{
            textAlign: 'center',
            cursor: 'pointer',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            borderStyle: audioFile ? 'solid' : 'dashed',
            borderWidth: '2px',
            borderColor: audioFile ? 'var(--accent-success)' : 'var(--border-default)',
          }}
          onClick={() => document.getElementById('audio-input')?.click()}
        >
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: audioFile ? 'var(--accent-success)' : 'var(--text-muted)' }}>{audioFile ? 'Ready' : 'MP3'}</div>
          <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>
            {audioFile ? audioFile.name : 'Audio File'}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {audioFile
              ? `${(audioFile.size / 1024 / 1024).toFixed(2)} MB`
              : 'Drag & drop or click to upload .mp3, .wav, .m4a'}
          </div>
          {audioFile && (
            <button
              className="btn btn-secondary"
              style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }}
              onClick={(e) => { e.stopPropagation(); setAudioFile(null); }}
            >
              Remove
            </button>
          )}
          <input
            id="audio-input"
            type="file"
            accept=".mp3,.wav,.m4a,.ogg,.webm"
            style={{ display: 'none' }}
            onChange={(e) => handleFileSelect(e, 'audio')}
          />
        </div>
      </div>

      {/* Upload Button */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={(!excelFile && !audioFile) || isProcessing}
          style={{ fontSize: '1rem', padding: '0.9rem 2.5rem' }}
        >
          {isProcessing ? (
            <>
              <span className="spinner" /> Processing...
            </>
          ) : (
            'Process Files'
          )}
        </button>
      </div>

      {/* Processing Steps */}
      {steps.length > 0 && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600 }}>Processing Status</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.1rem', width: '24px', textAlign: 'center' }}>
                  {step.status === 'done' && <span style={{ color: 'var(--accent-success)' }}>✓</span>}
                  {step.status === 'active' && <span className="spinner" style={{ width: '16px', height: '16px' }} />}
                  {step.status === 'pending' && <span style={{ color: 'var(--text-muted)' }}>○</span>}
                  {step.status === 'error' && <span style={{ color: 'var(--accent-danger)' }}>×</span>}
                </span>
                <span style={{
                  color: step.status === 'done' ? 'var(--accent-success)'
                    : step.status === 'active' ? 'var(--accent-primary)'
                    : step.status === 'error' ? 'var(--accent-danger)'
                    : 'var(--text-muted)',
                  fontWeight: step.status === 'active' ? 600 : 400,
                }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card" style={{ borderColor: 'var(--accent-danger)', marginBottom: '2rem' }}>
          <div style={{ color: 'var(--accent-danger)', fontWeight: 600, marginBottom: '0.5rem' }}>
            Error
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>{error}</div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="card" style={{ borderColor: 'var(--accent-success)' }}>
          <h3 style={{ marginBottom: '1rem', fontWeight: 600, color: 'var(--accent-success)' }}>
            Processing Complete
          </h3>

          {result.excel && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Excel Results
              </h4>
              <div className="grid-3" style={{ marginBottom: '0.75rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Households Created</span>
                  <span className="stat-value teal">{result.excel.householdsCreated}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Households Updated</span>
                  <span className="stat-value blue">{result.excel.householdsUpdated}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Members Created</span>
                  <span className="stat-value purple">{result.excel.membersCreated}</span>
                </div>
              </div>
              <div className="grid-3">
                <div className="stat-card">
                  <span className="stat-label">Members Updated</span>
                  <span className="stat-value blue">{result.excel.membersUpdated}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Accounts Created</span>
                  <span className="stat-value yellow">{result.excel.accountsCreated}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Accounts Updated</span>
                  <span className="stat-value blue">{result.excel.accountsUpdated}</span>
                </div>
              </div>
            </div>
          )}

          {result.audio && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                Audio Results
              </h4>
              <div className="grid-3" style={{ marginBottom: '1rem' }}>
                <div className="stat-card">
                  <span className="stat-label">Household Matched</span>
                  <span className={`stat-value ${result.audio.householdMatched ? 'purple' : ''}`} style={{ fontSize: '1.1rem', color: result.audio.householdMatched ? undefined : 'var(--accent-danger)' }}>
                    {result.audio.householdMatched || 'None'}
                  </span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Updates Applied</span>
                  <span className="stat-value teal">{result.audio.updatesApplied}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">Summary</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{result.audio.summary}</span>
                </div>
              </div>

              {/* Member Matching Results */}
              <div className="card" style={{ marginTop: '0.75rem', padding: '1rem' }}>
                <h5 style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600 }}>
                  Member Matching
                </h5>

                {result.audio.membersMatched && result.audio.membersMatched.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-success)', fontWeight: 600, marginRight: '0.5rem' }}>
                      Matched ({result.audio.membersMatched.length}):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                      {result.audio.membersMatched.map((name, i) => (
                        <span key={i} className="badge badge-teal" style={{ fontSize: '0.75rem' }}>
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {result.audio.membersNotFound && result.audio.membersNotFound.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-warning)', fontWeight: 600, marginRight: '0.5rem' }}>
                      Not Found ({result.audio.membersNotFound.length}):
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.4rem' }}>
                      {result.audio.membersNotFound.map((name, i) => (
                        <span key={i} className="badge badge-yellow" style={{ fontSize: '0.75rem' }}>
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(!result.audio.membersMatched || result.audio.membersMatched.length === 0) &&
                 (!result.audio.membersNotFound || result.audio.membersNotFound.length === 0) && (
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    No members referenced in the conversation.
                  </span>
                )}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ color: 'var(--accent-warning)', marginBottom: '0.5rem' }}>Warnings</h4>
              {result.errors.map((err, i) => (
                <div key={i} style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{err}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button className="btn btn-primary" onClick={() => router.push('/households')}>
              View Households
            </button>
            <button className="btn btn-secondary" onClick={() => router.push('/insights')}>
              View Insights
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
