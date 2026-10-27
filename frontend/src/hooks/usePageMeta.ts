import { useEffect } from 'react';

const SITE = 'https://refsale.ru';
const DEFAULT_TITLE = 'RefSale — оригинальная парфюмерия и косметика дешевле магазинов';

function setMeta(selector: string, attr: 'content' | 'href', value: string) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

/**
 * The page's title, description and canonical address — what a search engine
 * and a shared link show for it. `path` is the canonical one (/catalog?c=3).
 */
export default function usePageMeta(title: string | null, description?: string, path?: string) {
  useEffect(() => {
    if (!title) return;
    document.title = title;
    if (description) {
      setMeta('meta[name="description"]', 'content', description);
      setMeta('meta[property="og:description"]', 'content', description);
    }
    setMeta('meta[property="og:title"]', 'content', title);
    if (path) {
      setMeta('link[rel="canonical"]', 'href', SITE + path);
      setMeta('meta[property="og:url"]', 'content', SITE + path);
    }
    return () => { document.title = DEFAULT_TITLE; };
  }, [title, description, path]);
}
