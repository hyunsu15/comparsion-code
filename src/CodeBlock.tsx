import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import type { DiscussionThread } from './discussionService';

interface MethodInfo {
  name: string;
  line: number;
  endLine: number;
}

type CodeBlockProps = {
  code: string;
  lang: string;
  onHighlight?: () => void;
  fontSize?: number;
  foldedLines?: Set<number>;
  methods?: MethodInfo[];
  threads?: DiscussionThread[];
  onMarkerClick?: (threadId: number, x: number, y: number) => void;
  onFoldToggle?: (line: number) => void;
  onLineShiftClick?: (line: number, x: number, y: number) => void;
};

type Highlighter = {
  codeToHtml: (
    code: string,
    options: {
      lang: string;
      theme: string;
      transformers: Array<{
        line(node: { properties: Record<string, unknown> }, line: number): void;
      }>;
    },
  ) => string;
  codeToTokens: (
    code: string,
    options: {
      lang: string;
      theme: string;
    }
  ) => {
    tokens: Array<Array<{ content: string; color?: string; fontStyle?: number }>>;
  };
};

const normalizeLang = (lang: string) => {

  if (lang === 'text' || lang === 'plaintext' || lang === 'txt') return 'text';
  return lang;
};

const getHighlighter = (() => {
  let highlighterPromise: Promise<Highlighter> | null = null;

  return () => {
    highlighterPromise ??= Promise.all([
      import('@shikijs/langs/c'),
      import('@shikijs/langs/css'),
      import('@shikijs/langs/html'),
      import('@shikijs/langs/java'),
      import('@shikijs/langs/javascript'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/jsx'),
      import('@shikijs/langs/tsx'),
      import('@shikijs/langs/typescript'),
      import('@shikijs/themes/github-light'),
      import('shiki/core'),
      import('shiki/engine/javascript'),
    ]).then(([
      c,
      css,
      html,
      java,
      javascript,
      json,
      jsx,
      tsx,
      typescript,
      githubLight,
      core,
      engine,
    ]) => core.createHighlighterCore({
      themes: [githubLight.default],
      langs: [
        c.default,
        css.default,
        html.default,
        java.default,
        javascript.default,
        json.default,
        jsx.default,
        tsx.default,
        typescript.default,
      ],
      engine: engine.createJavaScriptRegexEngine(),
    }));

    return highlighterPromise;
  };
})();

export default function CodeBlock({ code, lang, onHighlight, fontSize = 15 }: CodeBlockProps) {
export default function CodeBlock({ 
  code, 
  lang, 
  onHighlight, 
  fontSize = 15,
  foldedLines = new Set(),
  methods = [],
  threads = [],
  onMarkerClick,
  onFoldToggle,
  onLineShiftClick
}: CodeBlockProps) {
  const [tokens, setTokens] = useState<any[][]>([]);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const lineHeight = Math.floor(fontSize * 1.5);

  useEffect(() => {
    let isMounted = true;
    const highlight = async () => {
      setTokens([]);
      setHasError(false);
      try {
        const highlighter = await getHighlighter();
        const result = highlighter.codeToTokens(code, {
          lang: normalizeLang(lang),
          theme: 'github-light',
        });
        if (isMounted) setTokens(result.tokens);
      } catch (error) {
        console.error('Shiki error:', error);
        if (isMounted) setHasError(true);
      }
    };
    highlight();
    return () => { isMounted = false; };
  }, [code, lang]);

  useEffect(() => {
    if (tokens.length > 0) onHighlight?.();
  }, [tokens, onHighlight]);

  // 가상 스크롤을 위한 뷰포트 측정
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // 실제로 화면에 그려야 할 라인 계산 (접힌 라인 제외)
  const visibleLines = useMemo(() => {
    const lines: any[] = [];
    let currentSkipUntil = -1;

    tokens.forEach((lineTokens, idx) => {
      const lineNum = idx + 1;
      if (currentSkipUntil !== -1 && lineNum <= currentSkipUntil) return;
      
      currentSkipUntil = -1;
      lines.push({ tokens: lineTokens, lineNum });

      if (foldedLines.has(lineNum)) {
        const method = methods.find(m => m.line === lineNum);
        if (method) currentSkipUntil = method.endLine;
      }
    });
    return lines;
  }, [tokens, foldedLines, methods]);

  const startIndex = Math.max(0, Math.floor(scrollTop / lineHeight) - 5);
  const endIndex = Math.min(visibleLines.length, Math.ceil((scrollTop + containerHeight) / lineHeight) + 5);
  
  const offsetY = startIndex * lineHeight;
  const totalHeight = visibleLines.length * lineHeight;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ 
        '--code-font-size': `${fontSize}px`,
        fontSize: `${fontSize}px`,
        position: 'relative',
        height: '100%',
        overflow: 'auto'
      } as React.CSSProperties}
      className="w-full"
    >
      {!hasError ? (
        <div style={{ height: `${totalHeight}px`, position: 'relative', minWidth: 'max-content' }}>
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleLines.slice(startIndex, endIndex).map((lineData) => {
              const { lineNum, tokens: lineTokens } = lineData;
              const isMethodStart = methods.some(m => m.line === lineNum);
              const isFolded = foldedLines.has(lineNum);
              const thread = threads.find(t => t.line_number === lineNum);

              return (
                <div
                  key={lineNum}
                  onClick={(e) => {
                    if (e.shiftKey) onLineShiftClick?.(lineNum, e.clientX, e.clientY);
                    else if (isMethodStart) onFoldToggle?.(lineNum);
                  }}
                  className="line flex hover:bg-slate-50 transition-colors"
                  style={{ height: `${lineHeight}px`, lineHeight: `${lineHeight}px`, cursor: isMethodStart ? 'pointer' : 'default' }}
                >
                  {/* Line Number & Indicators */}
                  <div className="w-16 flex-shrink-0 flex items-center justify-end pr-4 mr-4 border-r border-gray-200 text-gray-400 select-none text-[12px] font-mono">
                    {thread && (
                      <div 
                        onClick={(e) => { e.stopPropagation(); onMarkerClick?.(thread.id, e.clientX, e.clientY); }}
                        className={`w-2 h-2 rounded-full mr-2 ${thread.status === 'RESOLVED' ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`}
                      />
                    )}
                    {lineNum}
                  </div>

                  {/* Code Tokens */}
                  <div className="flex items-center whitespace-pre pr-4">
                    {isMethodStart && (
                      <span className="mr-2 text-blue-500 font-bold text-[11px] bg-blue-50 px-1 rounded">
                        {isFolded ? '[ + folded ]' : '[ - ]'}
                      </span>
                    )}
                    {lineTokens.map((token: any, tIdx: number) => (
                      <span 
                        key={tIdx} 
                        style={{ 
                          color: token.color,
                          fontWeight: token.fontStyle === 1 ? 'bold' : 'normal',
                          fontStyle: token.fontStyle === 2 ? 'italic' : 'normal'
                        }}
                      >
                        {token.content}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <pre className="p-4 opacity-50 whitespace-pre">{code}</pre>
      )}
    </div>
  );
}
