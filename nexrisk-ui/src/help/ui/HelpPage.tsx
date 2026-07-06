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
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set(DOMAIN_ORDER));
  const { messages, loading, ask } = useHelpAsk(undefined); // no page context on the manual itself
  const threadRef = useRef<HTMLDivElement>(null);

  const toggleDomain = (d: string) =>
    setOpenDomains((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

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
    <div style={{ display: 'grid', gridTemplateColumns: '307px 1fr', height: '100%', background: T.pageBg, color: T.text, fontFamily: T.ui }}>
      {/* corpus tree — matches the app Sidebar tokens */}
      <aside style={{ background: T.railBg, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '12px 12px 10px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, letterSpacing: '0.10em', textTransform: 'uppercase', color: T.owner, fontWeight: 500, marginBottom: 10 }}>
            Operational Manual
          </div>
          <input
            value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter articles…"
            style={{ width: '100%', boxSizing: 'border-box', background: T.hoverBg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 15, padding: '8px 10px', outline: 'none' }}
          />
        </div>
        <nav style={{ overflowY: 'auto', padding: '4px 0 12px', flex: 1 }}>
          {DOMAIN_ORDER.filter((d) => grouped[d]?.length).map((d) => {
            const open = openDomains.has(d) || !!filter;   // filtering forces groups open
            return (
              <div key={d} style={{ borderBottom: `1px solid ${T.border}` }}>
                <button
                  onClick={() => toggleDomain(d)}
                  className="w-full flex items-center gap-2 transition-colors"
                  style={{ padding: '9px 12px', fontSize: 16, fontWeight: 600, color: open ? T.text : '#cfcfcf', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ display: 'inline-block', width: 12, color: T.textDim, fontSize: 10, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
                  <span style={{ flex: 1 }}>{DOMAIN_LABEL[d] || d}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textMute }}>{grouped[d].length}</span>
                </button>
                {open && (
                  <div style={{ paddingBottom: 6, marginLeft: 18, borderLeft: `1px solid ${T.border}` }}>
                    {grouped[d].map((a) => {
                      const isActive = active?.id === a.id;
                      const navLabel = a.title.split('—')[0].trim() || a.title;
                      return (
                        <button
                          key={a.id}
                          onClick={() => openArticle(a.id)}
                          title={a.title}
                          onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                          onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = T.textLeaf; }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                            background: isActive ? T.hoverBg : 'transparent',
                            border: 'none',
                            borderLeft: `2px solid ${isActive ? T.accent : 'transparent'}`,
                            marginLeft: -1,
                            color: isActive ? T.accent : T.textLeaf,
                            fontSize: 15, lineHeight: 1.4,
                            padding: '7px 12px 7px 12px', cursor: 'pointer',
                          }}
                        >
                          <svg width="13" height="14" viewBox="0 0 13 14" fill="none" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
                            <path d="M2 1.5h5L11 5v7.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke={isActive ? T.accent : T.textDim} strokeWidth="1" fill="none"/>
                            <path d="M7 1.5V5h4" stroke={isActive ? T.accent : T.textDim} strokeWidth="1" fill="none"/>
                          </svg>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* main */}
      <main style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 22px', minHeight: 0 }}>
          {active ? (
            <article>
              <button onClick={() => setActive(null)} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 10 }}>← Back to chat</button>
              <h2 style={{ fontSize: 18, color: T.text, margin: '0 0 4px' }}>{active.title}</h2>
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
