import { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
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

const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(({
  code, 
  lang, 
  onHighlight, 
  fontSize = 15,
  foldedLines = new Set(),
  methods = [],
  threads = [],
  onMarkerClick,
  onFoldToggle,
  onLineShiftClick,
  onScroll: externalOnScroll,
  onWheel: externalOnWheel
}, ref) => {
  const [tokens, setTokens] = useState<any[][]>([]);
  const [hasError, setHasError] = useState(false);
  const internalRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => internalRef.current!);

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

  // TanStack Virtual 설정
  const virtualizer = useVirtualizer({
    count: visibleLines.length,
    getScrollElement: () => internalRef.current,
    estimateSize: () => lineHeight,
    overscan: 10, // 상하 버퍼 라인 수
  });

  return (
    <div
      ref={internalRef}
      onScroll={externalOnScroll}
      onWheel={externalOnWheel}
      style={{ 
        '--code-font-size': `${fontSize}px`,
        fontSize: `${fontSize}px`,
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'auto'
      } as React.CSSProperties}
      className="w-full"
    >
      {!hasError ? (
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', minWidth: 'max-content' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const lineData = visibleLines[virtualRow.index];
            if (!lineData) return null;
            
            const { lineNum, tokens: lineTokens } = lineData;
              const isMethodStart = methods.some(m => m.line === lineNum);
              const isFolded = foldedLines.has(lineNum);
              const lineThreads = threads.filter(t => t.line_number === lineNum);

              return (
                <div
                  key={lineNum}
                  onClick={(e) => {
                    if (e.shiftKey) onLineShiftClick?.(lineNum, e.clientX, e.clientY);
                    else if (isMethodStart) onFoldToggle?.(lineNum);
                  }}
                  className="line flex hover:bg-slate-50 transition-colors absolute top-0 left-0 w-full"
                  style={{ 
                    height: `${virtualRow.size}px`, 
                    lineHeight: `${virtualRow.size}px`, 
                    cursor: isMethodStart ? 'pointer' : 'default',
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  {/* Line Number & Indicators (Gutter) */}
                  <div className="w-20 flex-shrink-0 flex items-center justify-end pr-4 mr-4 border-r border-gray-200 text-gray-400 select-none text-[12px] font-mono relative">
                    {/* Folding Marker - Moved to Gutter to prevent indent shift */}
                    {isMethodStart && (
                      <span className="absolute left-2 text-blue-500 font-bold text-[10px]">
                        {isFolded ? '▶' : '▼'}
                      </span>
                    )}
                    
                    <div className="flex gap-0.5 items-center mr-1.5 overflow-hidden">
                      {lineThreads.map(thread => (
                        <div 
                          key={thread.id}
                          onClick={(e) => { e.stopPropagation(); onMarkerClick?.(thread.id, e.clientX, e.clientY); }}
                          className={`w-2 h-2 rounded-full flex-shrink-0 cursor-pointer ${thread.status === 'RESOLVED' ? 'bg-slate-300' : 'bg-indigo-500 animate-pulse'}`}
                          title={`Thread #${thread.id}`}
                        />
                      ))}
                    </div>
                    {lineNum}
                  </div>

                  {/* Code Tokens - Original Indentation Preserved */}
                  <div className="flex items-center whitespace-pre pr-4" style={{ tabSize: 4 }}>
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
                    {/* Folded hint displayed AFTER the code line */}
                    {isFolded && (
                      <span className="ml-4 text-blue-400 text-[11px] italic bg-blue-50 px-2 rounded-full border border-blue-100">
                        ... method folded
                      </span>
                    )}
                  </div>
                </div>
              );
          })}
        </div>
      ) : (
        <pre className="p-4 opacity-50 whitespace-pre">{code}</pre>
      )}
    </div>
  );
});

export default CodeBlock;
