"use client";
import { useState, useRef, useEffect } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Message {
  role: "user" | "assistant";
  content: string;
  sql?: string | null;
  data?: any[] | null;
}

const SUGGESTED_QUESTIONS = [
  "What is the total net worth across all households?",
  "Which household has the most members?",
  "Show me households with annual income between $500,000 and $1,000,000",
  "What are the different account types and how many of each?",
  "List all members and their occupations",
  "What is the average annual income per household?",
];

export default function AIInsightsPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || loading) return;

    const userMessage: Message = { role: "user", content: question.trim() };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const history = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/ai-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), history }),
      });

      const result = await res.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: result.answer || "I couldn't generate an answer.",
        sql: result.sql,
        data: result.data,
      };

      setMessages([...updatedMessages, assistantMessage]);
    } catch {
      setMessages([
        ...updatedMessages,
        {
          role: "assistant",
          content: "Failed to connect to the server. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", padding: 0 }}>
      {/* Header */}
      <div style={{ padding: "1.5rem 2rem 1rem", borderBottom: "1px solid var(--border-subtle)" }}>
        <h1 className="page-title">AI Insights</h1>
        <p className="page-subtitle">
          Ask any question about your wealth management data in plain English.
        </p>
      </div>

      {/* Messages Area */}
      <div className="chat-messages" style={{ flex: 1, overflowY: "auto", padding: "1.5rem 2rem" }}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-title">What would you like to know?</div>
            <div className="chat-empty-desc">
              Ask questions about households, members, accounts, net worth, income, and more.
              The AI will query your database directly.
            </div>
            <div className="chat-suggestions">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="chat-suggestion"
                  onClick={() => sendQuestion(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`chat-bubble ${msg.role}`}>
            <div className="chat-bubble-label">
              {msg.role === "user" ? "You" : "AI"}
            </div>
            <div className="chat-bubble-content">
              {msg.role === "assistant" ? (
                <MarkdownContent content={msg.content} />
              ) : (
                msg.content
              )}
            </div>

            {/* SQL Details */}
            {msg.sql && (
              <details className="chat-sql-details">
                <summary>View SQL Query</summary>
                <pre className="chat-sql-code">{msg.sql}</pre>
              </details>
            )}

            {/* Data Table */}
            {msg.data && msg.data.length > 0 && (
              <details className="chat-data-details">
                <summary>View Raw Data ({msg.data.length} rows)</summary>
                <div className="table-container" style={{ marginTop: "0.5rem" }}>
                  <table>
                    <thead>
                      <tr>
                        {Object.keys(msg.data[0]).map((key) => (
                          <th key={key}>{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {msg.data.slice(0, 20).map((row, ri) => (
                        <tr key={ri}>
                          {Object.values(row).map((val, ci) => (
                            <td key={ci}>{formatCellValue(val)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {msg.data.length > 20 && (
                    <div style={{ padding: "0.5rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      Showing 20 of {msg.data.length} rows
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        ))}

        {loading && (
          <div className="chat-bubble assistant">
            <div className="chat-bubble-label">AI</div>
            <div className="chat-typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your data..."
          className="chat-input"
          disabled={loading}
        />
        <button
          type="submit"
          className="btn btn-primary chat-send-btn"
          disabled={!input.trim() || loading}
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}

// ── Markdown renderer (simple) ──────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const html = simpleMarkdown(content);
  return <div className="chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

function simpleMarkdown(md: string): string {
  let html = md;

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="chat-code-block"><code>$2</code></pre>');

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, header, _sep, body) => {
    const headerCells = header.split('|').filter((c: string) => c.trim());
    const rows = body.trim().split('\n');

    let table = '<div class="table-container"><table><thead><tr>';
    headerCells.forEach((cell: string) => {
      table += `<th>${cell.trim()}</th>`;
    });
    table += '</tr></thead><tbody>';

    rows.forEach((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim());
      table += '<tr>';
      cells.forEach((cell: string) => {
        table += `<td>${cell.trim()}</td>`;
      });
      table += '</tr>';
    });

    table += '</tbody></table></div>';
    return table;
  });

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');

  // Bullet lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Line breaks → paragraphs
  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br/>');
  html = `<p>${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

function formatCellValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    if (Number.isInteger(val) && Math.abs(val) > 10000) {
      return val.toLocaleString('en-US');
    }
    return String(val);
  }
  return String(val);
}
