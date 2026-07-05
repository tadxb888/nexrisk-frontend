// help/ui/HelpPage.tsx
// The Operational Manual page (route /help/manual). Left: corpus domain tree.
// Right: a conversation area (grounded, cited answers) or a selected article,
// a draggable divider, the ask box, and the AI disclaimer.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { T, DOMAIN_LABEL, DOMAIN_ORDER } from './helpTheme';
import { helpClient, HelpArticle, HelpArticleMeta } from './helpClient';
import { useHelpAsk } from './useHelpAsk';
import Markdown from './Markdown';

export default function HelpPage() {
  const [manifest, setManifest] = useState<HelpArticleMeta[]>([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<HelpArticle | null>(null);
  const [input, setInput] = useState('');
  const [inputH, setInputH] = useState(120);
  const { messages, loading, ask } = useHelpAsk(undefined); // no page context on the manual itself
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => { helpClient.getManifest().then((m) => setManifest(m.articles)).catch(() => {}); }, []);
  useEffect(() => { threadRef.current?.scrollTo(0, threadRef.current.scrollHeight); }, [messages, loading]);

  const openArticle = async (id: string, anchor?: string) => {
    try {
      const a = await helpClient.getArticle(id);
      setActive(a);
      requestAnimationFrame(() => {
        if (anchor) document.getElementById(`help-${anchor}`)?.scrollIntoView({ block: 'start' });
      });
    } catch { /* ignore */ }
  };

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? manifest.filter((a) => (a.title + ' ' + a.tags.join(' ')).toLowerCase().includes(f)) : manifest;
    const byDomain: Record<string, HelpArticleMeta[]> = {};
    for (const a of list) (byDomain[a.domain] ||= []).push(a);
    return byDomain;
  }, [manifest, filter]);

  // draggable divider: resize the ask box height
  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const fromBottom = window.innerHeight - ev.clientY;
      setInputH(Math.max(90, Math.min(360, fromBottom - 34)));
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  const send = () => { if (input.trim() && !loading) { ask(input); setInput(''); } };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '224px 1fr', height: '100%', background: T.pageBg, color: T.text, fontFamily: T.ui }}>
      {/* corpus tree */}
      <aside style={{ borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${T.borderSoft}` }}>
          <div style={{ fontSize: 12, color: T.textMute, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Operational Manual</div>
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter articles"
            style={{ width: '100%', boxSizing: 'border-box', background: T.field, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 12, padding: '6px 8px', outline: 'none' }}
          />
        </div>
        <div style={{ overflowY: 'auto', padding: '6px 0', flex: 1 }}>
          {DOMAIN_ORDER.filter((d) => grouped[d]?.length).map((d) => (
            <div key={d} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: T.textMute, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 12px 2px' }}>{DOMAIN_LABEL[d] || d}</div>
              {grouped[d].map((a) => (
                <button key={a.id} onClick={() => openArticle(a.id)} title={a.title}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: active?.id === a.id ? T.field : 'transparent',
                    border: 'none', borderLeft: `2px solid ${active?.id === a.id ? T.accent : 'transparent'}`,
                    color: active?.id === a.id ? T.text : T.textDim, fontSize: 12.5, padding: '5px 12px', cursor: 'pointer' }}>
                  {a.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* main */}
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', minHeight: 0 }}>
          {active ? (
            <article>
              <button onClick={() => setActive(null)} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to chat</button>
              <h2 style={{ fontSize: 18, color: T.text, margin: '0 0 4px' }}>{active.title}</h2>
              <div style={{ fontSize: 11, color: T.textMute, fontFamily: T.mono, marginBottom: 12 }}>{active.id}</div>
              <div>{active.body.split('\n').map((l, n) => {
                const anc = /\{#([a-z0-9-]+)\}/.exec(l);
                return <div key={n} id={anc ? `help-${anc[1]}` : undefined}><Markdown text={l} onCite={openArticle} /></div>;
              })}</div>
            </article>
          ) : messages.length === 0 ? (
            <div style={{ color: T.textMute, fontSize: 13, maxWidth: 520, marginTop: 40 }}>
              Ask about any Taiga feature — how to configure it, what a field means, or where a setting lives.
              Answers are drawn only from the Operational Manual and cite their sources. Browse the manual on the left.
            </div>
          ) : (
            messages.map((m, n) => (
              <div key={n} style={{ margin: '0 0 16px' }}>
                {m.role === 'user' ? (
                  <div style={{ color: T.textDim, fontSize: 13 }}><span style={{ color: T.textMute, fontFamily: T.mono, fontSize: 11, marginRight: 8 }}>you</span>{m.text}</div>
                ) : (
                  <div style={{ background: T.panel, border: `1px solid ${m.refused ? T.borderSoft : T.border}`, borderRadius: 8, padding: '12px 14px' }}>
                    {m.refused
                      ? <div style={{ color: T.amber, fontSize: 13, lineHeight: 1.6 }}>{m.text}</div>
                      : <Markdown text={m.text} onCite={openArticle} />}
                    {m.citations && m.citations.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${T.borderSoft}`, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <span style={{ fontSize: 11, color: T.textMute, marginRight: 2 }}>Sources:</span>
                        {m.citations.map((c) => (
                          <button key={c.id} onClick={() => openArticle(c.id)} title={c.title}
                            style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, background: 'transparent', border: `1px solid ${T.accentDim}`, borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}>
                            {c.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && <div style={{ color: T.textMute, fontSize: 12, fontFamily: T.mono }}>thinking…</div>}
        </div>

        {/* draggable divider */}
        <div onMouseDown={startDrag} title="Drag to resize"
          style={{ height: 6, cursor: 'row-resize', background: T.pageBg, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.borderSoft}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 2, background: T.border, borderRadius: 2 }} />
        </div>

        {/* ask box */}
        <div style={{ height: inputH, padding: '10px 22px 4px', display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask a question about Taiga…"
            style={{ flex: 1, resize: 'none', background: T.field, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontFamily: T.ui, fontSize: 13, padding: '10px 12px', outline: 'none' }}
          />
          <button onClick={send} disabled={loading || !input.trim()} title="Send"
            style={{ width: 44, background: input.trim() && !loading ? T.accentDim : T.field, border: `1px solid ${T.border}`, borderRadius: 10, color: input.trim() && !loading ? '#fff' : T.textMute, cursor: input.trim() && !loading ? 'pointer' : 'default', fontSize: 18 }}>
            ➤
          </button>
        </div>
        <footer style={{ textAlign: 'center', color: T.textMute, fontSize: 11, padding: '2px 22px 8px' }}>
          Taiga is AI and can make mistakes. Please double-check responses with Technical Support if necessary.
        </footer>
      </main>
    </div>
  );
}
