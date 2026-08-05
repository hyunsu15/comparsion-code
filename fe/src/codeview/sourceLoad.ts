// 좌(PB)/우(PB5) 코드 소스를 링크로부터 불러오는 전략(fetcher) + localStorage 링크 저장 로드.

export interface SourceFetchContext {
  link: string;
  side: 'A' | 'B';
}

interface CodeFetcher {
  canFetch: (context: SourceFetchContext) => boolean;
  fetchCode: (context: SourceFetchContext) => Promise<string>;
}

export const isLocalFileLink = (link: string) => link.startsWith('/api/links?');

const fetchLocalFile = async ({ link }: SourceFetchContext) => {
  const res = await fetch(link);
  if (!res.ok) throw new Error(`Local file not found: ${link}`);
  return res.text();
};

const fetchPbCode = async (context: SourceFetchContext) => {
  return context.link;
};

const fetchPb5Code = async (context: SourceFetchContext) => {
  return context.link;
};

const codeFetchers: CodeFetcher[] = [
  {
    canFetch: ({ link }) => isLocalFileLink(link),
    fetchCode: fetchLocalFile,
  },
  {
    canFetch: ({ side }) => side === 'A',
    fetchCode: fetchPbCode,
  },
  {
    canFetch: ({ side }) => side === 'B',
    fetchCode: fetchPb5Code,
  },
];

export const fetchCodeFromSource = async (context: SourceFetchContext) => {
  const fetcher = codeFetchers.find((candidate) => candidate.canFetch(context));
  if (!fetcher) throw new Error(`Unsupported source: ${context.link}`);
  return fetcher.fetchCode(context);
};

export const getSavedLinks = () => {
  if (typeof window === 'undefined') return { sourceA: '', sourceB: '' };
  const savedLinks = localStorage.getItem('sourceLinks');
  if (!savedLinks) return { sourceA: '', sourceB: '' };

  try {
    const parsed = JSON.parse(savedLinks) as Partial<{ sourceA: string; sourceB: string }>;
    return {
      sourceA: parsed.sourceA ?? '',
      sourceB: parsed.sourceB ?? '',
    };
  } catch {
    return { sourceA: '', sourceB: '' };
  }
};
