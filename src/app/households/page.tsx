"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { formatCurrency, formatPercent } from "@/lib/utils/formatters";

interface Household {
  id: string;
  name: string;
  taxBracket: string | null;
  liquidNetWorth: number | null;
  totalNetWorth: number | null;
  annualIncome: number | null;
  investmentObjective: string | null;
  memberCount: number;
  accountCount: number;
  members: { id: string; name: string; type: string }[];
  updatedAt: string;
}

export default function HouseholdsPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/households")
      .then((res) => res.json())
      .then((data) => {
        setHouseholds(data.households || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = households.filter((h) =>
    h.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        Loading households...
      </div>
    );
  }

  if (households.length === 0) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">—</div>
          <div className="empty-title">No Households Yet</div>
          <div className="empty-desc">
            Upload an Excel file to import household data and get started.
          </div>
          <Link href="/upload" className="btn btn-primary">
            Upload Data
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 className="page-title">Households</h1>
          <p className="page-subtitle">{households.length} households managed</p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <input
            type="text"
            placeholder="Search households..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-card)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              fontSize: "0.9rem",
              width: "250px",
              outline: "none",
            }}
          />
          <Link href="/upload" className="btn btn-primary" style={{ padding: "0.6rem 1.25rem" }}>
            + Upload
          </Link>
        </div>
      </div>

      <div className="grid-3">
        {filtered.map((household) => (
          <Link key={household.id} href={`/households/${household.id}`}>
            <div className="card" style={{ height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <h3 style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: "0.25rem" }}>
                    {household.name}
                  </h3>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="badge badge-purple">{household.memberCount} members</span>
                    <span className="badge badge-teal">{household.accountCount} accounts</span>
                  </div>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: "1.2rem" }}>→</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Total Net Worth</div>
                  <div style={{ fontWeight: 600, color: "var(--accent-success)" }}>{formatCurrency(household.totalNetWorth)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Annual Income</div>
                  <div style={{ fontWeight: 600, color: "var(--accent-info)" }}>{formatCurrency(household.annualIncome)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Liquid Net Worth</div>
                  <div style={{ fontWeight: 600 }}>{formatCurrency(household.liquidNetWorth)}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.2rem" }}>Tax Bracket</div>
                  <div style={{ fontWeight: 600 }}>{formatPercent(household.taxBracket as unknown as number)}</div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "0.75rem" }}>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>Members</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {household.members.slice(0, 4).map((m) => (
                    <span key={m.id} className={`badge ${m.type === 'entity' ? 'badge-yellow' : 'badge-blue'}`} style={{ fontSize: "0.7rem" }}>
                      {m.name}
                    </span>
                  ))}
                  {household.members.length > 4 && (
                    <span className="badge badge-purple" style={{ fontSize: "0.7rem" }}>
                      +{household.members.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
