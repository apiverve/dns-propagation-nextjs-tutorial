'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Result = {
  server: string;
  location: string;
  ip: string;
  success: boolean;
  records: string[];
  error: string | null;
  responseTime?: number | null; // paid plans
};
type Check = {
  domain: string;
  recordType: string;
  propagationComplete: boolean;
  serversChecked: number;
  serversResponded: number;
  uniqueResponses: number;
  results: Result[];
};
type ApiError = { error: string; code?: string };

const TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
// One colour per distinct answer, so matching resolvers share a colour.
const SWATCHES = ['#1f8a5b', '#2f6fd6', '#b4561f', '#8a3fd1', '#c2366b', '#11818f', '#7a6a12', '#4b5563'];

const answerOf = (r: Result) => (r.success ? [...r.records].sort().join(' · ') || '(no records)' : '');

export default function DnsApp() {
  const [domain, setDomain] = useState('github.com');
  const [type, setType] = useState('A');
  const [data, setData] = useState<Check | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (d: string, t: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/check?domain=${encodeURIComponent(d)}&type=${t}`);
      const body = await res.json();
      if (!res.ok) throw body;
      setData(body);
    } catch (e) {
      setData(null);
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // ?domain=...&type=... opens on that check.
    const q = new URLSearchParams(window.location.search);
    const d = q.get('domain') || 'github.com';
    const t = (q.get('type') || 'A').toUpperCase();
    setDomain(d);
    setType(TYPES.includes(t) ? t : 'A');
    check(d, TYPES.includes(t) ? t : 'A');
  }, [check]);

  // Distinct answers, most common first; the most common one is treated as the "main" answer.
  const answers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data?.results ?? []) if (r.success) counts.set(answerOf(r), (counts.get(answerOf(r)) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const colour = (a: string) => SWATCHES[answers.findIndex(([x]) => x === a) % SWATCHES.length];

  if (error?.code === 'missing_key') {
    return (
      <main className="page">
        <section className="card missing">
          <h1>Add your API key</h1>
          <p>
            Get a free APIVerve key at{' '}
            <a href="https://dashboard.apiverve.com/signup?api=dnspropagation" target="_blank" rel="noreferrer">
              dashboard.apiverve.com
            </a>
            , set <code>APIVERVE_API_KEY</code> in <code>.env</code> or your Vercel project, then reload.
          </p>
        </section>
      </main>
    );
  }

  const agree = answers[0]?.[1] ?? 0;
  const pct = data ? Math.round((agree / Math.max(1, data.serversChecked)) * 100) : 0;

  return (
    <main className="page">
      <header className="top">
        <h1>
          Has my DNS <span>propagated?</span>
        </h1>
        <p>Ask public resolvers around the world for a record, side by side.</p>
      </header>

      <form
        className="query card"
        onSubmit={(e) => {
          e.preventDefault();
          check(domain, type);
        }}
      >
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" aria-label="Domain" spellCheck={false} />
        <div className="types" role="radiogroup" aria-label="Record type">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t}
              role="radio"
              aria-checked={type === t}
              className={type === t ? 'on' : ''}
              onClick={() => {
                setType(t);
                check(domain, t);
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <button className="go" disabled={busy || !domain.trim()}>
          {busy ? 'Checking…' : 'Check'}
        </button>
      </form>

      {error && <p className="err">{error.error}</p>}

      {data && (
        <>
          <section className="verdict card">
            <div className="ring" style={{ ['--pct' as string]: `${pct}%` }}>
              <span>{pct}%</span>
            </div>
            <div>
              <h2>{data.propagationComplete ? 'Every resolver agrees' : answers.length > 1 ? `${answers.length} different answers` : 'Not everywhere yet'}</h2>
              <p>
                {agree} of {data.serversChecked} resolvers return the most common {data.recordType} answer for <b>{data.domain}</b>.
                {answers.length > 1 && ' Different answers are normal for sites that use round-robin or geo-routed DNS.'}
              </p>
            </div>
          </section>

          <ul className="rows">
            {data.results.map((r) => (
              <li key={r.ip} className="card">
                <span className="dot" style={{ background: r.success ? colour(answerOf(r)) : '#d4d0c4' }} />
                <div className="who">
                  <strong>{r.server}</strong>
                  <span>
                    {r.location} · {r.ip}
                  </span>
                </div>
                <div className="what">
                  {r.success ? (
                    r.records.length ? (
                      r.records.map((rec) => <code key={rec}>{rec}</code>)
                    ) : (
                      <em>no records</em>
                    )
                  ) : (
                    <em className="fail">{r.error || 'no response'}</em>
                  )}
                </div>
                {typeof r.responseTime === 'number' && <span className="ms">{r.responseTime} ms</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <footer className="foot">
        Built with the <a href="https://apiverve.com/marketplace/dnspropagation">DNS Propagation</a> API from APIVerve.
      </footer>
    </main>
  );
}
