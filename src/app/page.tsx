import Link from "next/link";

export default function Home() {
  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', textAlign: 'center' }}>
      <h1 className="page-title" style={{ fontSize: '3rem', marginBottom: '1rem' }}>FastTrackr AI</h1>
      <p className="page-subtitle" style={{ fontSize: '1.2rem', maxWidth: '600px', lineHeight: 1.7, marginBottom: '2.5rem' }}>
        Intelligent wealth management data platform. Upload client spreadsheets and conversations
        to automatically extract, organize, and visualize household financial data.
      </p>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <Link href="/upload" className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
          Upload Data
        </Link>
        <Link href="/households" className="btn btn-secondary" style={{ fontSize: '1rem', padding: '0.9rem 2rem' }}>
          View Households
        </Link>
      </div>
    </div>
  );
}
