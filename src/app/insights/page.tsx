"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { abbreviateNumber } from "@/lib/utils/formatters";

/* eslint-disable @typescript-eslint/no-explicit-any */

const COLORS = [
  '#7c5cfc', '#a78bfa', '#38bdf8', '#34d399', '#fbbf24',
  '#f87171', '#fb923c', '#818cf8', '#2dd4bf', '#e879f9',
  '#60a5fa', '#4ade80',
];

const chartTooltipStyle = {
  backgroundColor: '#1a1a2e',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  color: '#f0f0f8',
  fontSize: '0.85rem',
};

export default function InsightsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((res) => res.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner" />
        Loading insights...
      </div>
    );
  }

  if (!data || !data.summary) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-icon">—</div>
          <div className="empty-title">No Data Available</div>
          <div className="empty-desc">Upload client data to generate insights and visualizations.</div>
          <Link href="/upload" className="btn btn-primary">Upload Data</Link>
        </div>
      </div>
    );
  }

  const { summary, charts } = data;

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Insights Dashboard</h1>
        <p className="page-subtitle">Financial overview across all managed households</p>
      </div>

      {/* Summary Cards */}
      <div className="grid-4" style={{ marginBottom: "2rem" }}>
        <div className="stat-card">
          <span className="stat-label">Total Households</span>
          <span className="stat-value purple">{summary.totalHouseholds}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Members</span>
          <span className="stat-value blue">{summary.totalMembers}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Accounts</span>
          <span className="stat-value teal">{summary.totalAccounts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Net Worth</span>
          <span className="stat-value yellow">{abbreviateNumber(summary.totalNetWorth)}</span>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid-2" style={{ marginBottom: "2rem" }}>
        {/* Net Worth by Household */}
        <div className="chart-card">
          <div className="chart-title">Net Worth by Household</div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={charts.netWorthByHousehold} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tickFormatter={abbreviateNumber} stroke="#5c5c7a" fontSize={12} />
              <YAxis type="category" dataKey="name" width={130} stroke="#5c5c7a" fontSize={11} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => abbreviateNumber(Number(val))} />
              <Legend />
              <Bar dataKey="liquidNetWorth" name="Liquid NW" fill="#38bdf8" radius={[0, 4, 4, 0]} />
              <Bar dataKey="illiquidNetWorth" name="Illiquid NW" fill="#7c5cfc" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Income by Household */}
        <div className="chart-card">
          <div className="chart-title">Annual Income by Household</div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={charts.incomeByHousehold} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" tickFormatter={abbreviateNumber} stroke="#5c5c7a" fontSize={12} />
              <YAxis type="category" dataKey="name" width={130} stroke="#5c5c7a" fontSize={11} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(val) => abbreviateNumber(Number(val))} />
              <Bar dataKey="annualIncome" name="Annual Income" fill="#34d399" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: "2rem" }}>
        {/* Account Type Distribution */}
        <div className="chart-card">
          <div className="chart-title">Account Type Distribution</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={charts.accountTypeDistribution}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="count"
                nameKey="type"
                label={({ type, count }: any) => `${type} (${count})`}
                labelLine={{ stroke: '#5c5c7a' }}
                fontSize={11}
              >
                {charts.accountTypeDistribution.map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Tax Bracket Distribution */}
        <div className="chart-card">
          <div className="chart-title">Tax Bracket Distribution</div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={charts.taxBracketDistribution}
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={50}
                dataKey="count"
                nameKey="bracket"
                label={({ bracket, count }: any) => `${bracket} (${count})`}
                labelLine={{ stroke: '#5c5c7a' }}
                fontSize={11}
              >
                {charts.taxBracketDistribution.map((_: any, index: number) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: "2rem" }}>
        {/* Members per Household */}
        <div className="chart-card">
          <div className="chart-title">Members per Household</div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={charts.membersPerHousehold} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" stroke="#5c5c7a" fontSize={12} />
              <YAxis type="category" dataKey="name" width={130} stroke="#5c5c7a" fontSize={11} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name="Members" fill="#a78bfa" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Accounts per Household */}
        <div className="chart-card">
          <div className="chart-title">💼 Accounts per Household</div>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={charts.accountsPerHousehold} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis type="number" stroke="#5c5c7a" fontSize={12} />
              <YAxis type="category" dataKey="name" width={130} stroke="#5c5c7a" fontSize={11} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name="Accounts" fill="#fbbf24" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Investment Objective Distribution */}
      <div className="chart-card" style={{ marginBottom: "2rem" }}>
        <div className="chart-title">Investment Objective Distribution</div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={charts.investmentObjectiveDistribution} margin={{ left: 20, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="objective" stroke="#5c5c7a" fontSize={12} />
            <YAxis stroke="#5c5c7a" fontSize={12} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Bar dataKey="count" name="Households" fill="#e879f9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
