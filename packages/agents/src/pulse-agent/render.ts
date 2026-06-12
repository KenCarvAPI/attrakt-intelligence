/**
 * Renderers for the weekly health report: Markdown (for storage / plaintext
 * email) and HTML (for the Resend email, styled to match the admin dashboard
 * aesthetic — light gray canvas, white rounded cards, gray-900 headings).
 */

import type { WeeklyHealthReport, MetricMovement, Risk } from './weekly-report';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const arrow = (d: MetricMovement['direction']) => (d === 'up' ? '▲' : d === 'down' ? '▼' : '—');
const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

// --- Markdown ---------------------------------------------------------------

export function renderMarkdown(r: WeeklyHealthReport): string {
  const lines: string[] = [];

  lines.push(`# ${r.clientName} — Weekly Ecosystem Health Report`);
  lines.push(`_${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)} · template ${r.version}_`);
  lines.push('');
  lines.push('## Headline');
  lines.push(r.headlineSummary);
  lines.push('');

  lines.push('## Key metric movements');
  lines.push('| Metric | This week | Last week | Change |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const m of r.metricMovements) {
    lines.push(
      `| ${m.label} | ${m.current} | ${m.previous} | ${arrow(m.direction)} ${signed(m.deltaPct)}% — ${m.note} |`
    );
  }
  lines.push('');

  lines.push('## Notable advocates this week');
  if (r.advocates.length === 0) {
    lines.push('_No standout contributors this week._');
  } else {
    for (const a of r.advocates) {
      lines.push(`- **${a.name}** (score ${a.score}, ${signed(a.delta)} WoW) — ${a.reason}`);
    }
  }
  lines.push('');

  lines.push('## Governance highlights');
  if (r.governanceHighlights.length === 0) {
    lines.push('_No governance-flagged activity this week._');
  } else {
    for (const g of r.governanceHighlights) {
      const tag = g.type === 'solution_accepted' ? '✅ Solved' : '🗳️ New topic';
      const link = g.url ? ` ([link](${g.url}))` : '';
      lines.push(`- ${tag}: **${g.title}** — ${g.member}${link}`);
    }
  }
  lines.push('');

  lines.push('## Risks & anomalies');
  if (r.risks.length === 0) {
    lines.push('_No material risks detected._');
  } else {
    for (const risk of r.risks) {
      lines.push(`- **[${risk.severity.toUpperCase()}] ${risk.type}** — ${risk.detail}`);
    }
  }
  lines.push('');

  lines.push('## Recommended actions');
  r.recommendedActions.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.action}`);
    lines.push(`   _Strategic priority: ${a.priority}_`);
  });
  lines.push('');

  return lines.join('\n');
}

// --- HTML (email) -----------------------------------------------------------

const C = {
  canvas: '#f9fafb',
  card: '#ffffff',
  border: '#e5e7eb',
  ink: '#111827',
  sub: '#4b5563',
  muted: '#6b7280',
  up: '#16a34a',
  down: '#dc2626',
  flat: '#6b7280',
  accent: '#4f46e5',
  link: '#2563eb',
};

const sev = (s: Risk['severity']) =>
  s === 'high' ? C.down : s === 'medium' ? '#d97706' : C.muted;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function card(inner: string): string {
  return `<div style="background:${C.card};border:1px solid ${C.border};border-radius:12px;padding:24px;margin:0 0 20px 0;box-shadow:0 1px 2px rgba(16,24,40,0.04);">${inner}</div>`;
}

function h2(text: string): string {
  return `<h2 style="margin:0 0 16px 0;font-size:13px;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};font-weight:600;">${esc(text)}</h2>`;
}

export function renderHtml(r: WeeklyHealthReport): string {
  const metricRows = r.metricMovements
    .map((m) => {
      const color = m.direction === 'up' ? C.up : m.direction === 'down' ? C.down : C.flat;
      const a = m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '—';
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};color:${C.ink};font-size:14px;">${esc(m.label)}<div style="color:${C.muted};font-size:12px;">${esc(m.note)}</div></td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};text-align:right;color:${C.ink};font-size:18px;font-weight:700;">${m.current}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};text-align:right;color:${C.muted};font-size:13px;">from ${m.previous}</td>
        <td style="padding:10px 0;border-bottom:1px solid ${C.border};text-align:right;color:${color};font-size:14px;font-weight:600;white-space:nowrap;">${a} ${signed(m.deltaPct)}%</td>
      </tr>`;
    })
    .join('');

  const advocates = r.advocates.length
    ? r.advocates
        .map(
          (a) => `<div style="padding:12px 0;border-bottom:1px solid ${C.border};">
        <div style="font-size:15px;font-weight:600;color:${C.ink};">${esc(a.name)}
          <span style="display:inline-block;margin-left:8px;background:#eef2ff;color:${C.accent};font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;">score ${a.score} · ${signed(a.delta)} WoW</span>
        </div>
        <div style="font-size:13px;color:${C.sub};margin-top:2px;">${esc(a.reason)}</div>
      </div>`
        )
        .join('')
    : `<div style="color:${C.muted};font-size:14px;">No standout contributors this week.</div>`;

  const governance = r.governanceHighlights.length
    ? r.governanceHighlights
        .map((g) => {
          const solved = g.type === 'solution_accepted';
          const badge = solved
            ? `<span style="background:#dcfce7;color:${C.up};font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;">SOLVED</span>`
            : `<span style="background:#e0e7ff;color:${C.accent};font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;">NEW TOPIC</span>`;
          const title = g.url
            ? `<a href="${esc(g.url)}" style="color:${C.link};text-decoration:none;">${esc(g.title)}</a>`
            : esc(g.title);
          return `<div style="padding:10px 0;border-bottom:1px solid ${C.border};font-size:14px;color:${C.ink};">${badge} &nbsp;${title}<div style="color:${C.muted};font-size:12px;margin-top:2px;">${esc(g.member)} · ${esc(g.note)}</div></div>`;
        })
        .join('')
    : `<div style="color:${C.muted};font-size:14px;">No governance-flagged activity this week.</div>`;

  const risks = r.risks.length
    ? r.risks
        .map(
          (risk) => `<div style="padding:12px 14px;border-left:3px solid ${sev(risk.severity)};background:#fafafa;border-radius:6px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:${sev(risk.severity)};text-transform:uppercase;letter-spacing:0.03em;">${esc(risk.severity)} · ${esc(risk.type)}</div>
        <div style="font-size:14px;color:${C.sub};margin-top:4px;">${esc(risk.detail)}</div>
      </div>`
        )
        .join('')
    : `<div style="color:${C.muted};font-size:14px;">No material risks detected.</div>`;

  const actions = r.recommendedActions
    .map(
      (a, i) => `<div style="display:flex;padding:12px 0;border-bottom:1px solid ${C.border};">
      <div style="flex:0 0 28px;height:28px;width:28px;border-radius:999px;background:${C.accent};color:#fff;font-weight:700;font-size:14px;text-align:center;line-height:28px;">${i + 1}</div>
      <div style="margin-left:12px;">
        <div style="font-size:14px;color:${C.ink};">${esc(a.action)}</div>
        <div style="font-size:12px;color:${C.accent};margin-top:4px;font-weight:600;">▸ ${esc(a.priority)}</div>
      </div>
    </div>`
    )
    .join('');

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:${C.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
    <div style="background:linear-gradient(135deg,${C.accent},#7c3aed);border-radius:12px;padding:28px 24px;margin-bottom:20px;">
      <div style="color:#c7d2fe;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Attrakt Intelligence</div>
      <div style="color:#ffffff;font-size:24px;font-weight:800;margin-top:6px;">${esc(r.clientName)} — Weekly Ecosystem Health</div>
      <div style="color:#e0e7ff;font-size:13px;margin-top:6px;">${fmtDate(r.periodStart)} – ${fmtDate(r.periodEnd)} · template ${esc(r.version)}</div>
    </div>

    ${card(`${h2('Headline')}<div style="font-size:16px;line-height:1.6;color:${C.ink};">${esc(r.headlineSummary)}</div>`)}

    ${card(`${h2('Key metric movements')}<table style="width:100%;border-collapse:collapse;">${metricRows}</table>`)}

    ${card(`${h2('Notable advocates this week')}${advocates}`)}

    ${card(`${h2('Governance highlights')}${governance}`)}

    ${card(`${h2('Risks & anomalies')}${risks}`)}

    ${card(`${h2('Recommended actions')}${actions}`)}

    <div style="text-align:center;color:${C.muted};font-size:12px;padding:8px 0 24px 0;">
      Generated by Attrakt Intelligence · Community Pulse
    </div>
  </div>
</body>
</html>`;
}
