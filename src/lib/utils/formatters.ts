export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  
  if (typeof value === 'string') {
    value = value.trim();
    if (value.endsWith('%')) return value;
    
    // Check if it's a parseable number
    const asNum = Number(value);
    if (!isNaN(asNum) && value !== '') {
      value = asNum;
    } else {
      return value; // Return as-is if it's purely text like "Highest"
    }
  }
  
  if (typeof value === 'number') {
    let p = value;
    // Excel stores 20% as 0.2. If the user just typed "20", it comes through as 20.
    // If the value is between (0, 1], we assume it's a decimal-encoded percentage.
    if (p > 0 && p <= 1) {
      p = p * 100;
    }
    // Format without unnecessary decimal places
    const formatted = parseFloat(p.toFixed(2));
    return `${formatted}%`;
  }
  
  return '—';
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatPhone(phone: string | number | null | undefined): string {
  if (!phone) return '—';
  const digits = String(phone).replace(/[^\d]/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(phone);
}

export function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

export function snakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[\s-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

export function abbreviateNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`;
  return `$${num}`;
}
