// help/ui/useHelpAsk.ts
// Conversation state for the Help assistant: holds the message thread, sends a
// question to the BFF (which does retrieval + grounding + refusal), and appends
// the grounded answer or refusal. The BFF is stateless/single-turn, so we send
// only the latest question; the thread here is for display.

import { useState, useCallback } from 'react';
import { helpClient, HelpCitation } from './helpClient';

export interface HelpMessage {
  role: 'user' | 'assistant';
  text: string;
  citations?: HelpCitation[];
  refused?: boolean;
}

export function useHelpAsk(route?: string) {
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || loading) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await helpClient.ask(question, route);
      setMessages((m) => [...m, { role: 'assistant', text: res.answer, citations: res.citations, refused: res.refused }]);
    } catch {
      setMessages((m) => [...m, {
        role: 'assistant', refused: true,
        text: 'The help assistant is temporarily unavailable — please try again shortly, or please contact Technical Support.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [route, loading]);

  const reset = useCallback(() => setMessages([]), []);
  return { messages, loading, ask, reset };
}
