// help/ui/HelpPage.tsx
// The Operational Manual page (route /help/manual). Left: corpus domain tree.
// Right: a conversation area (grounded, cited answers) or a selected article,
// a draggable divider, the ask box, and the AI disclaimer.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { T, DOMAIN_LABEL, DOMAIN_ORDER } from './helpTheme';
import { helpClient, HelpArticle, HelpArticleMeta } from './helpClient';
import { useHelpAsk } from './useHelpAsk';
import Markdown from './Markdown';
import { HELP_GRAPHIC } from './helpGraphic';

export default function HelpPage() {
  const [manifest, setManifest] = useState<HelpArticleMeta[]>([]);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<HelpArticle | null>(null);
  const [activeChapter, setActiveChapter] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [inputH, setInputH] = useState(120);
  const [openDomains, setOpenDomains] = useState<Set<string>>(new Set()); // collapsed by default
  const [expandedLeaves, setExpandedLeaves] = useState<Set<string>>(new Set());
  const { messages, loading, ask } = useHelpAsk(undefined); // no page context on the manual itself
  const threadRef = useRef<HTMLDivElement>(null);

  const toggleLeaf = (id: string) =>
    setExpandedLeaves((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // open an article and scroll to a specific chapter once it has rendered
  const openArticleAt = useCallback(async (id: string, chapterId: string) => {
    try {
      const a = await helpClient.getArticle(id);
      setActive(a);
      setActiveChapter(chapterId);
      setTimeout(() => document.getElementById(chapterId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    } catch { /* ignore */ }
  }, []);

  const toggleDomain = (d: string) =>
    setOpenDomains((prev) => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });

  useEffect(() => { helpClient.getManifest().then((m) => setManifest(m.articles)).catch(() => {}); }, []);
  useEffect(() => { threadRef.current?.scrollTo(0, threadRef.current.scrollHeight); }, [messages, loading]);

  const openArticle = useCallback(async (id: string, anchor?: string) => {
    try {
      const a = await helpClient.getArticle(id);
      setActive(a);
      setActiveChapter(null);
      requestAnimationFrame(() => {
        if (anchor) document.getElementById(`help-${anchor}`)?.scrollIntoView({ block: 'start' });
        else threadRef.current?.scrollTo(0, 0);
      });
    } catch { /* ignore */ }
  }, []);

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f ? manifest.filter((a) => (a.title + ' ' + a.tags.join(' ')).toLowerCase().includes(f)) : manifest;
    const byDomain: Record<string, HelpArticleMeta[]> = {};
    for (const a of list) (byDomain[a.domain] ||= []).push(a);

    // When browsing (no filter), show one row per page: many pages carry a deep
    // task guide plus older reference fragments that collapse to the same page
    // name. Prefer the task guide, else the non-fragment reference. Fragments stay
    // in the corpus (the assistant can still cite them) — they're just not listed
    // twice in the tree. When filtering, show every match so search hides nothing.
    if (!f) {
      const FRAG = /-(controls|states|fields|analytics|form|labels|panels|columns|filters|config|nodes|results|rules)$/;
      const shortLabel = (t: string) => t.split('—')[0].trim() || t;
      for (const d of Object.keys(byDomain)) {
        // 1) hide explicit page-fragments (reference stubs superseded by the page
        //    guide); they remain in the corpus for the assistant to cite.
        const kept = byDomain[d].filter((a) => !(a.type === 'reference' && FRAG.test(a.id)));
        // 2) collapse anything still sharing a page name to one primary row.
        const groups: Record<string, HelpArticleMeta[]> = {};
        for (const a of kept) (groups[shortLabel(a.title)] ||= []).push(a);
        byDomain[d] = Object.values(groups).map((g) =>
          g.find((a) => a.type === 'task') || g.find((a) => a.type === 'reference') || g[0],
        );
      }
    }

    const byOrder = (x: HelpArticleMeta, y: HelpArticleMeta) => {
      const ox = x.order ?? 999, oy = y.order ?? 999;
      return ox !== oy ? ox - oy : (x.title.split('—')[0].trim()).localeCompare(y.title.split('—')[0].trim());
    };
    for (const d of Object.keys(byDomain)) byDomain[d].sort(byOrder);
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
            Content
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
                      const chapters = a.chapters || [];
                      const hasChapters = chapters.length >= 3;   // only long, manual-backed pages expand
                      const leafOpen = expandedLeaves.has(a.id);
                      return (
                        <div key={a.id}>
                          <div style={{ display: 'flex', alignItems: 'center', marginLeft: -1, borderLeft: `2px solid ${isActive ? T.accent : 'transparent'}`, background: isActive ? T.hoverBg : 'transparent' }}>
                            {hasChapters ? (
                              <button
                                onClick={() => toggleLeaf(a.id)}
                                title={leafOpen ? 'Collapse chapters' : 'Expand chapters'}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.textDim, fontSize: 9, width: 16, padding: '7px 0 7px 6px', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                              >
                                <span style={{ display: 'inline-block', transform: leafOpen ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
                              </button>
                            ) : <span style={{ width: 16, flexShrink: 0 }} />}
                            <button
                              onClick={() => openArticle(a.id)}
                              title={a.title}
                              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = T.textLeaf; }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, textAlign: 'left',
                                background: 'transparent', border: 'none',
                                color: isActive ? T.accent : T.textLeaf,
                                fontSize: 15, lineHeight: 1.4, padding: '7px 12px 7px 4px', cursor: 'pointer',
                              }}
                            >
                              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" style={{ flexShrink: 0, opacity: isActive ? 1 : 0.75 }}>
                                <path d="M2 1.5h5L11 5v7.5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke={isActive ? T.accent : T.textDim} strokeWidth="1" fill="none"/>
                                <path d="M7 1.5V5h4" stroke={isActive ? T.accent : T.textDim} strokeWidth="1" fill="none"/>
                              </svg>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{navLabel}</span>
                            </button>
                          </div>
                          {hasChapters && leafOpen && (
                            <div style={{ marginLeft: 16, borderLeft: `1px solid ${T.border}` }}>
                              {chapters.map((c) => {
                                const chActive = isActive && activeChapter === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    onClick={() => openArticleAt(a.id, c.id)}
                                    title={c.title}
                                    onMouseEnter={(e) => { if (!chActive) (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                                    onMouseLeave={(e) => { if (!chActive) (e.currentTarget as HTMLButtonElement).style.color = T.textDim; }}
                                    style={{
                                      display: 'block', width: '100%', textAlign: 'left', marginLeft: -1,
                                      background: chActive ? T.hoverBg : 'transparent',
                                      border: 'none', borderLeft: `2px solid ${chActive ? T.accent : 'transparent'}`,
                                      color: chActive ? T.accent : T.textDim,
                                      fontSize: 13.5, lineHeight: 1.35, padding: '5px 10px 5px 18px', cursor: 'pointer',
                                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {c.title.replace(/^\d+\.\s*/, '')}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textDim, marginBottom: 10 }}>
                <button onClick={() => { setActive(null); setActiveChapter(null); }} style={{ background: 'transparent', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', padding: 0 }}>← Back to chat</button>
                <span style={{ color: T.textMute }}>·</span>
                <span>{DOMAIN_LABEL[active.domain] || active.domain}</span>
                <span style={{ color: T.textMute }}>›</span>
                <button
                  onClick={() => { setActiveChapter(null); threadRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  title="Back to the top of this page"
                  style={{ background: 'transparent', border: 'none', color: activeChapter ? T.accent : T.textDim, fontSize: 12, cursor: activeChapter ? 'pointer' : 'default', padding: 0 }}
                >
                  {active.title.split('—')[0].trim()}
                </button>
              </div>
              <h2 style={{ fontSize: 20, color: T.text, margin: '0 0 12px' }}>{active.title}</h2>
              {(() => {
                const slug = (t: string) => t.toLowerCase().replace(/\{#[a-z0-9-]+\}/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const chapters = active.body.split('\n').filter((l) => /^##\s/.test(l)).map((l) => {
                  const t = l.replace(/^##\s+/, '').replace(/\s*\{#[a-z0-9-]+\}\s*$/, '');
                  return { t, id: `help-${slug(t)}` };
                });
                if (chapters.length < 3) return null;   // TOC only for long, chaptered articles
                return (
                  <nav style={{ background: T.railBg, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', margin: '0 0 20px' }}>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.owner, fontWeight: 600, marginBottom: 8 }}>Contents</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: T.textBody, fontSize: 14, lineHeight: 1.9 }}>
                      {chapters.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => document.getElementById(c.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            style={{ background: 'transparent', border: 'none', color: T.accent, cursor: 'pointer', padding: 0, fontSize: 14, textAlign: 'left' }}
                          >
                            {c.t.replace(/^\d+\.\s*/, '')}
                          </button>
                        </li>
                      ))}
                    </ol>
                  </nav>
                );
              })()}
              <Markdown text={active.body} onCite={openArticle} />
            </article>
          ) : messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 24, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
              <div style={{ width: '100%', maxWidth: 420, margin: '0 auto', opacity: 0.96, lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: HELP_GRAPHIC }} />
              <div style={{ color: T.textDim, fontSize: 14, maxWidth: 560, marginTop: 8, lineHeight: 1.6 }}>
                Ask about any Taiga feature — how to configure it, what a field means, or where a setting lives.
                Answers are drawn only from the Content library and cite their sources. Browse the sections on the left.
              </div>
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
