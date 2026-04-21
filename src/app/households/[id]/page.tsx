"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatPercent, formatDate, formatPhone, formatLabel } from "@/lib/utils/formatters";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function HouseholdDetailPage() {
  const params = useParams();
  const [household, setHousehold] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    if (params.id) {
      fetch(`/api/households/${params.id}`)
        .then((res) => res.json())
        .then((data) => {
          setHousehold(data.household);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        Loading household data...
      </div>
    );
  }

  if (!household) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">—</div>
          <div className="empty-title">Household Not Found</div>
          <Link href="/households" className="btn btn-primary">← Back to Households</Link>
        </div>
      </div>
    );
  }

  const allAccounts = household.members?.flatMap((m: any) => 
    (m.financialAccounts || []).map((a: any) => ({ ...a, memberName: `${m.firstName} ${m.lastName || ''}`.trim() }))
  ) || [];

  const allGoals = [
    ...(household.goalsAndPreferences || []),
    ...(household.members?.flatMap((m: any) => (m.goalsAndPreferences || []).map((g: any) => ({ ...g, memberName: `${m.firstName} ${m.lastName || ''}`.trim() }))) || []),
  ];

  const allEntities = [
    ...(household.customEntities || []),
    ...(household.members?.flatMap((m: any) => (m.customEntities || []).map((e: any) => ({ ...e, memberName: `${m.firstName} ${m.lastName || ''}`.trim() }))) || []),
  ];

  const tabs = [
    { id: "overview", label: "Overview", icon: "" },
    { id: "members", label: `Members (${household.members?.length || 0})`, icon: "" },
    { id: "accounts", label: `Accounts (${allAccounts.length})`, icon: "" },
    { id: "goals", label: `Goals (${allGoals.length})`, icon: "" },
    { id: "entities", label: `Assets (${allEntities.length})`, icon: "" },
    { id: "timeline", label: "Timeline", icon: "" },
  ];

  return (
    <div className="page-container">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
        <Link href="/households" style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
          ← Households
        </Link>
      </div>
      <div className="page-header">
        <h1 className="page-title">{household.name}</h1>
        <p className="page-subtitle">
          Last updated {formatDate(household.updatedAt)}
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid-4" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <span className="stat-label">Total Net Worth</span>
          <span className="stat-value teal">{formatCurrency(household.totalNetWorth)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Liquid Net Worth</span>
          <span className="stat-value blue">{formatCurrency(household.liquidNetWorth)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Annual Income</span>
          <span className="stat-value purple">{formatCurrency(household.annualIncome)}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Tax Bracket</span>
          <span className="stat-value yellow">{formatPercent(household.taxBracket) || '—'}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && <OverviewTab household={household} />}
      {activeTab === "members" && <MembersTab members={household.members || []} />}
      {activeTab === "accounts" && <AccountsTab accounts={allAccounts} />}
      {activeTab === "goals" && <GoalsTab goals={allGoals} />}
      {activeTab === "entities" && <EntitiesTab entities={allEntities} />}
      {activeTab === "timeline" && <TimelineTab changelog={household.changelog || []} />}
    </div>
  );
}

function OverviewTab({ household }: { household: any }) {
  const additionalInfo = (typeof household.additionalInfo === 'object' && household.additionalInfo) ? household.additionalInfo : {};
  const extraKeys = Object.keys(additionalInfo).filter(k => additionalInfo[k] != null);

  return (
    <div className="grid-2">
      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>Financial Summary</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <InfoRow label="Total Net Worth" value={formatCurrency(household.totalNetWorth)} />
          <InfoRow label="Liquid Net Worth" value={formatCurrency(household.liquidNetWorth)} />
          <InfoRow label="Annual Income" value={formatCurrency(household.annualIncome)} />
          <InfoRow label="Expense Range" value={formatCurrency(household.expenseRange)} />
          <InfoRow label="Tax Bracket" value={formatPercent(household.taxBracket)} />
          <InfoRow label="Risk Tolerance" value={household.riskTolerance || '—'} />
          <InfoRow label="Investment Objective" value={household.investmentObjective || '—'} />
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontWeight: 600, marginBottom: "1rem", color: "var(--text-primary)" }}>
          Household Overview
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <InfoRow label="Members" value={String(household.members?.length || 0)} />
          <InfoRow label="Financial Accounts" value={String(household.members?.reduce((c: number, m: any) => c + (m.financialAccounts?.length || 0), 0) || 0)} />
          <InfoRow label="Created" value={formatDate(household.createdAt)} />
          <InfoRow label="Last Updated" value={formatDate(household.updatedAt)} />
        </div>

        {extraKeys.length > 0 && (
          <>
            <h4 style={{ fontWeight: 600, margin: "1.5rem 0 0.75rem", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Additional Information
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {extraKeys.map((key) => (
                <InfoRow key={key} label={formatLabel(key)} value={String(additionalInfo[key])} isDynamic />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MembersTab({ members }: { members: any[] }) {
  return (
    <div className="grid-2">
      {members.map((member: any) => (
        <div key={member.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <div>
              <h3 style={{ fontWeight: 700, fontSize: "1.1rem" }}>
                {member.firstName} {member.lastName || ''}
              </h3>
              <span className={`badge ${member.memberType === 'entity' ? 'badge-yellow' : 'badge-blue'}`}>
                {member.memberType === 'entity' ? 'Entity' : 'Individual'}
              </span>
            </div>
            {member.relationship && (
              <span className="badge badge-purple">{member.relationship}</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <InfoRow label="Date of Birth" value={formatDate(member.dateOfBirth)} />
            <InfoRow label="Phone" value={formatPhone(member.phone)} />
            <InfoRow label="Email" value={member.email || '—'} />
            <InfoRow label="Address" value={member.address || '—'} />
            <InfoRow label="Annual Income" value={member.annualIncome != null ? formatCurrency(member.annualIncome) : '—'} />
            <InfoRow label="Occupation" value={member.occupation || '—'} />
            <InfoRow label="Employer" value={member.employer || '—'} />
            <InfoRow label="Marital Status" value={member.maritalStatus || '—'} />
          </div>

          {member.bankDetails?.length > 0 && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
              <h4 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Bank Details</h4>
              {member.bankDetails.map((bd: any) => (
                <div key={bd.id} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  {bd.bankName} ({bd.bankType}) • Acct: {bd.accountNumber || '—'}
                </div>
              ))}
            </div>
          )}

          {member.financialAccounts?.length > 0 && (
            <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "1rem" }}>
              <h4 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
                Accounts ({member.financialAccounts.length})
              </h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {member.financialAccounts.map((a: any) => (
                  <span key={a.id} className="badge badge-teal" style={{ fontSize: "0.7rem" }}>
                    {a.accountType}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AccountsTab({ accounts }: { accounts: any[] }) {
  if (accounts.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">—</div>
        <div className="empty-title">No Accounts</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Account Type</th>
            <th>Detail</th>
            <th>Owner</th>
            <th>Custodian</th>
            <th>Value</th>
            <th>Investment Obj.</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account: any) => (
            <tr key={account.id}>
              <td style={{ fontWeight: 600, color: "var(--text-primary)" }}>{account.accountType}</td>
              <td>{account.accountTypeDetail || '—'}</td>
              <td>
                <span className="badge badge-blue" style={{ fontSize: "0.75rem" }}>
                  {account.memberName}
                </span>
              </td>
              <td>{account.custodian || '—'}</td>
              <td style={{ fontWeight: 600, color: "var(--accent-success)" }}>
                {formatCurrency(account.accountValue)}
              </td>
              <td>{account.investmentObjective || '—'}</td>
              <td>{account.riskTolerance || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoalsTab({ goals }: { goals: any[] }) {
  if (goals.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">—</div>
        <div className="empty-title">No Goals or Preferences</div>
        <div className="empty-desc">Upload an audio conversation to extract client goals and preferences.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {goals.map((goal: any) => (
        <div key={goal.id} className="card" style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
          <div style={{ fontSize: "1.5rem" }}>
            {goal.category === 'retirement' ? '' :
             goal.category === 'education' ? '' :
             goal.category === 'investment_preference' ? '' :
             goal.category === 'risk_constraint' ? '' :
             goal.category === 'estate_planning' ? '' : ''}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.25rem" }}>
              <span className="badge badge-purple">{goal.category}</span>
              {goal.priority && (
                <span className={`badge ${
                  goal.priority === 'high' ? 'badge-yellow' :
                  goal.priority === 'medium' ? 'badge-blue' : 'badge-teal'
                }`}>
                  {goal.priority} priority
                </span>
              )}
              {goal.memberName && (
                <span className="badge badge-blue">{goal.memberName}</span>
              )}
            </div>
            <div style={{ color: "var(--text-primary)", fontWeight: 500 }}>{goal.description}</div>
            {goal.targetDate && (
              <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                Target: {formatDate(goal.targetDate)}
              </div>
            )}
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
              Source: {goal.source || 'Unknown'} • {formatDate(goal.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EntitiesTab({ entities }: { entities: any[] }) {
  if (entities.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">—</div>
        <div className="empty-title">No Custom Assets</div>
        <div className="empty-desc">Upload audio conversations to discover additional assets like real estate, insurance, etc.</div>
      </div>
    );
  }

  return (
    <div className="grid-2">
      {entities.map((entity: any) => (
        <div key={entity.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div>
              <span className="badge badge-yellow" style={{ marginBottom: "0.5rem", display: "inline-block" }}>
                {entity.entityType}
              </span>
              <h3 style={{ fontWeight: 600, fontSize: "1rem" }}>{entity.title}</h3>
            </div>
          </div>
          {entity.data && typeof entity.data === 'object' && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {Object.entries(entity.data as Record<string, unknown>).map(([key, value]) => (
                <InfoRow key={key} label={formatLabel(key)} value={String(value)} isDynamic />
              ))}
            </div>
          )}
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", marginTop: "0.75rem" }}>
            Source: {entity.source} • {formatDate(entity.createdAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({ changelog }: { changelog: any[] }) {
  if (changelog.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">—</div>
        <div className="empty-title">No Activity Yet</div>
        <div className="empty-desc">Import data to see the change history here.</div>
      </div>
    );
  }

  // Sort by newest first
  const sorted = [...changelog].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="timeline">
      {sorted.map((entry: any) => (
        <div key={entry.id} className="timeline-item">
          <div className={`timeline-dot ${entry.sourceType}`}>
            {entry.sourceType === 'excel' ? 'XLS' : 'AUD'}
          </div>
          <div className="timeline-content">
            <div className="timeline-title">{entry.summary || entry.changeType}</div>
            <div className="timeline-meta">
              {entry.fieldName && (
                <span>
                  <strong>{entry.fieldName}</strong>
                  {entry.oldValue && <> from <code style={{ color: "var(--accent-danger)" }}>{entry.oldValue}</code></>}
                  {entry.newValue && <> to <code style={{ color: "var(--accent-success)" }}>{entry.newValue}</code></>}
                  {' • '}
                </span>
              )}
              <span className={`badge ${entry.sourceType === 'excel' ? 'badge-teal' : 'badge-purple'}`} style={{ fontSize: "0.7rem" }}>
                {entry.sourceType}
              </span>
              <span style={{ marginLeft: "0.5rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                {formatTimestamp(entry.createdAt)}
              </span>
              {entry.confidence != null && (
                <span style={{ marginLeft: "0.5rem" }}>
                  Confidence: {(entry.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, isDynamic }: { label: string; value: string; isDynamic?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
      <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", flexShrink: 0 }}>
        {isDynamic && <span style={{ color: "var(--accent-warning)", marginRight: "4px" }}>*</span>}
        {label}
      </span>
      <span style={{ color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "right", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}
