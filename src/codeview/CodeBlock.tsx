import { useEffect, useState, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { DiscussionThread } from '../discussionService';
import { buildSearchSegments } from './codeSearch';
import { lineMarkerSummary } from './markerSummary';

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
  onMarkerClick?: (threads: DiscussionThread[], x: number, y: number) => void;
  onFoldToggle?: (line: number) => void;
  onLineShiftClick?: (line: number, x: number, y: number) => void;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  // IDE식 코드 검색: 검색어/대소문자 옵션/현재(active) 매치 위치
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  activeMatch?: { line: number; start: number } | null;
  mapperCallLines?: Set<number>; // PB5 매퍼 호출 줄(클릭 시 대응 SQL) — hover 안내·커서 표시용
};

export interface CodeBlockHandle {
  scrollToLine: (lineNum: number) => boolean;
  getScrollElement: () => HTMLDivElement | null;
}

// Shiki codeToTokens 가 돌려주는 토큰(한 줄 = 토큰 배열, 전체 = 그 배열의 배열).
type Token = { content: string; color?: string; fontStyle?: number };
// 접힘을 반영해 실제로 그릴 줄 — 그 줄의 토큰들 + 원본 줄 번호(1-base).
type VisibleLine = { tokens: Token[]; lineNum: number };

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
    tokens: Token[][];
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
      import('@shikijs/langs/xml'),
      import('@shikijs/langs/sql'),
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
      xml,
      sql,
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
        xml.default,
        sql.default,
      ],
      engine: engine.createJavaScriptRegexEngine(),
    }));

    return highlighterPromise;
  };
})();

const CodeBlock = forwardRef<CodeBlockHandle, CodeBlockProps>(({
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
  onWheel: externalOnWheel,
  searchQuery = '',
  searchCaseSensitive = false,
  activeMatch = null,
  mapperCallLines = new Set(),
}, ref) => {
  const [tokens, setTokens] = useState<Token[][]>([]);
  const [hasError, setHasError] = useState(false);
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);
  const internalRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    scrollToLine: (lineNum: number) => {
      const index = visibleLines.findIndex(l => l.lineNum === lineNum);
      if (index === -1) return false; // 접혀있거나 아직 렌더 전이라 대상 라인을 못 찾음
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
      // 시각적 피드백: 잠시 강조
      setHighlightedLine(lineNum);
      setTimeout(() => setHighlightedLine(null), 2000);
      return true;
    },
    getScrollElement: () => internalRef.current
  }));

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
    const lines: VisibleLine[] = [];
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
              const isMapperCall = mapperCallLines.has(lineNum);

              return (
                <div
                  key={lineNum}
                  data-line={lineNum} // 부모의 Alt+클릭 점프 로직(closest) 지원을 위해 추가
                  title={isMapperCall ? '클릭하면 대응 SQL(매퍼 XML) 보기' : undefined}
                  onClick={(e) => {
                    if (e.shiftKey) {
                      e.stopPropagation(); // 중복 처리 방지
                      onLineShiftClick?.(lineNum, e.clientX, e.clientY);
                    } else if (isMethodStart && !e.altKey) {
                      e.stopPropagation(); // 알트 키가 없을 때만 접기를 실행하고 버블링 중단
                      onFoldToggle?.(lineNum);
                    }
                  }}
                  className={`line flex transition-colors absolute top-0 left-0 w-full ${isMapperCall ? 'bg-indigo-50/50 hover:bg-indigo-100/70' : 'hover:bg-slate-50'}`}
                  style={{
                    height: `${virtualRow.size}px`,
                    lineHeight: `${virtualRow.size}px`,
                    cursor: isMethodStart || isMapperCall ? 'pointer' : 'default',
                    backgroundColor: highlightedLine === lineNum ? 'rgba(255, 255, 0, 0.3)' : undefined,
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
                    
                    {lineThreads.length > 0 && (() => {
                      const sum = lineMarkerSummary(lineThreads);
                      const dotClass =
                        sum.status === 'RESOLVED'
                          ? 'bg-slate-300'
                          : sum.status === 'CHECK_PB'
                            ? 'bg-indigo-500 animate-pulse' // PB 토글과 동일(indigo)
                            : 'bg-emerald-500 animate-pulse'; // PB5 토글과 동일(emerald)
                      return (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onMarkerClick?.(lineThreads, e.clientX, e.clientY); }}
                          className="flex items-center gap-0.5 mr-1.5 cursor-pointer"
                          title={`스레드 ${sum.count}개`}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                          {sum.count > 1 && <span className="text-[10px] font-black text-slate-500 leading-none">{sum.count}</span>}
                        </button>
                      );
                    })()}
                    {lineNum}
                  </div>

                  {/* Code Tokens - Original Indentation Preserved */}
                  <div 
                    className="whitespace-pre pr-4 font-mono" 
                    style={{ 
                      tabSize: 4
                    }}
                  >
                    {buildSearchSegments(
                      lineTokens,
                      searchQuery,
                      searchCaseSensitive,
                      searchQuery && activeMatch && activeMatch.line === lineNum ? activeMatch.start : null,
                    ).map((seg, tIdx: number) => {
                      const fs = seg.fontStyle ?? 0;
                      return (
                        <span
                          key={tIdx}
                          style={{
                            color: seg.hl === 'active' ? '#1a1a1a' : seg.color,
                            fontWeight: (fs & 1) ? 'bold' : 'normal',
                            fontStyle: (fs & 2) ? 'italic' : 'normal',
                            textDecoration: (fs & 4) ? 'underline' : 'none',
                            backgroundColor:
                              seg.hl === 'active'
                                ? 'rgba(255,140,0,0.85)'
                                : seg.hl === 'match'
                                  ? 'rgba(250,220,0,0.45)'
                                  : undefined,
                            borderRadius: seg.hl !== 'none' ? '2px' : undefined,
                          }}
                        >
                          {seg.content}
                        </span>
                      );
                    })}
                    {/* Folded hint displayed AFTER the code line */}
                    {isFolded && (
                      <span className="ml-4 text-blue-400 text-[11px] italic bg-blue-50 px-2 rounded-full border border-blue-100">
                        ··· 접힘
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
