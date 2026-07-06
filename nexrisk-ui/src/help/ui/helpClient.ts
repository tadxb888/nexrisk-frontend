// help/ui/helpClient.ts
// Thin client for the Help BFF routes. All grounding/refusal happens server-side;
// the client just calls the endpoints and returns their shapes.

export interface HelpArticleMeta {
  id: string; title: string; type: string; domain: string;
  module: string; route: string; tags: string[]; related: string[];
  chapters?: { title: string; id: string }[];
}
export interface HelpManifest { version: string; articles: HelpArticleMeta[]; }
export interface HelpArticle extends HelpArticleMeta { anchors: string[]; body: string; }
export interface HelpCitation { id: string; title: string; route: string; }
export interface HelpAnswer {
  refused: boolean;
  reason?: 'advice' | 'no-match' | 'no-answer' | 'unavailable';
  answer: string;
  citations: HelpCitation[];
  sources?: string[];
}

async function j<Ttype>(res: Response): Promise<Ttype> {
  if (!res.ok) throw new Error(`help api ${res.status}`);
  return res.json() as Promise<Ttype>;
}

export const helpClient = {
  getManifest: (): Promise<HelpManifest> =>
    fetch('/api/v1/help/manifest', { credentials: 'include' }).then(j),

  getArticle: (id: string): Promise<HelpArticle> =>
    fetch(`/api/v1/help/article/${encodeURIComponent(id)}`, { credentials: 'include' }).then(j),

  ask: (question: string, route?: string): Promise<HelpAnswer> =>
    fetch('/api/v1/help/ask', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, route }),
    }).then(j),
};
