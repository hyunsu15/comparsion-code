import React, { useState, useEffect, useCallback, useMemo } from 'react';
import LINK_PRESETS from './Link';
import type { CodeSourceSet } from './FileLink';
import CodeBlock from './CodeBlock';
import PBCode from './PBCode';
import { mockPbCall } from './mock/pbCodeCall';
import { discussionService } from './discussionService';
import type { DiscussionThread, DiscussionMessage } from './discussionService';

// 브라우저 기반 가상 파일 시스템 설정
// 가상 파일 시스템 관련 코드는 환경에 따라 필요시 사용 (현재는 pb5CodeCall이 서버 액션이므로 최소화)
// const fs = new FS('code-diff-fs');
// const pfs = fs.promises;

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const getSmartPosition = (clientX: number, clientY: number) => {
  return { x: clientX - 160, y: clientY - 100 };
};

interface MethodInfo {
  name: string;
  line: number;
  endLine: number;
}

interface MethodMatch {
  name: string;
  pbLine: number;
  pb5Line: number;
}

interface SourceFetchContext {
  link: string;
  side: 'A' | 'B';
}

interface CodeFetcher {
  canFetch: (context: SourceFetchContext) => boolean;
  fetchCode: (context: SourceFetchContext) => Promise<string>;
}

const isLocalFileLink = (link: string) => link.startsWith('/api/links?');

const fetchLocalFile = async ({ link }: SourceFetchContext) => {
  const res = await fetch(link);
  if (!res.ok) throw new Error(`Local file not found: ${link}`);
  return res.text();
};



const fetchPbCode = async ( context: SourceFetchContext) =>{
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

const fetchCodeFromSource = async (context: SourceFetchContext) => {
  const fetcher = codeFetchers.find(candidate => candidate.canFetch(context));
  if (!fetcher) throw new Error(`Unsupported source: ${context.link}`);
  return fetcher.fetchCode(context);
};

const getFileNameFromSource = (source: string) => {
  try {
    const url = new URL(source, 'http://localhost');
    return url.searchParams.get('file') ?? url.pathname;
  } catch {
    return source;
  }
};

const getSavedLinks = () => {
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

const normalizeMethodName = (name: string) => (
  name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
);

const areSameMethodName = (left: string, right: string) => {
  const normalizedLeft = normalizeMethodName(left);
  const normalizedRight = normalizeMethodName(right);

  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
};

const NON_METHOD_NAMES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'return',
  'sizeof',
  'case',
  'do',
]);

const stripCodeForBraces = (line: string, state: { inBlockComment: boolean }) => {
  let result = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];

    if (state.inBlockComment) {
      if (char === '*' && next === '/') {
        state.inBlockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        i++;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '/' && next === '*') {
      state.inBlockComment = true;
      i++;
      continue;
    }

    if (char === '/' && next === '/') break;

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    result += char;
  }

  return result;
};

const findBlockEndLine = (lines: string[], startIndex: number) => {
  const commentState = { inBlockComment: false };
  let braceCount = 0;
  let foundOpen = false;

  for (let j = startIndex; j < lines.length; j++) {
    const lineText = stripCodeForBraces(lines[j], commentState);

    for (const char of lineText) {
      if (char === '{') {
        braceCount++;
        foundOpen = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (foundOpen && braceCount === 0) return j + 1;
  }

  return startIndex + 1;
};

const getCMethodName = (header: string) => {
  const normalizedHeader = header
    .replace(/\bEXEC\s+SQL\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const openParenIndex = normalizedHeader.indexOf('(');

  if (openParenIndex < 0) return null;

  const beforeParen = normalizedHeader.slice(0, openParenIndex);
  const nameMatch = beforeParen.match(/([A-Za-z_]\w*)\s*$/);
  const name = nameMatch?.[1];

  if (!name || NON_METHOD_NAMES.has(name)) return null;
  return name;
};

const extractCMethods = (code: string): MethodInfo[] => {
  const lines = code.split('\n');
  const results: MethodInfo[] = [];
  const commentState = { inBlockComment: false };
  let topLevelDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const lineForDepth = stripCodeForBraces(lines[i], commentState);

    if (topLevelDepth === 0 && lineForDepth.includes('(')) {
      const headerLines: string[] = [];
      let headerEndIndex = i;
      let foundBody = false;
      let foundPrototype = false;

      for (let j = i; j < lines.length && j < i + 40; j++) {
        const candidateLine = stripCodeForBraces(lines[j], { inBlockComment: false }).trim();
        headerLines.push(candidateLine);

        const joinedHeader = headerLines.join(' ');
        const bodyIndex = joinedHeader.indexOf('{');
        const prototypeIndex = joinedHeader.indexOf(';');

        if (prototypeIndex >= 0 && (bodyIndex < 0 || prototypeIndex < bodyIndex)) {
          foundPrototype = true;
          break;
        }

        if (bodyIndex >= 0) {
          foundBody = true;
          headerEndIndex = j;
          break;
        }
      }

      if (foundBody && !foundPrototype) {
        const name = getCMethodName(headerLines.join(' '));

        if (name) {
          results.push({
            name,
            line: i + 1,
            endLine: findBlockEndLine(lines, headerEndIndex),
          });
          i = headerEndIndex;
        }
      }
    }

    for (const char of lineForDepth) {
      if (char === '{') topLevelDepth++;
      else if (char === '}') topLevelDepth = Math.max(0, topLevelDepth - 1);
    }
  }

  return results;
};

// 성능 최적화된 Shiki 하이라이터 컴포넌트 (가로 세로 스크롤 완벽 지원)
const CodeComparator: React.FC = () => {
  // SSR 지원을 위해 초기값은 고정된 기본값으로 설정
  const [links, setLinks] = useState<CodeSourceSet>({ sourceA: '', sourceB: '' });
  const [filePresets, setFilePresets] = useState<Record<string, CodeSourceSet>>({});
  const [isLoadingHttp, setIsLoadingHttp] = useState<boolean>(false);
  const [isLoadingGit, setIsLoadingGit] = useState<boolean>(false);
  const [httpError, setHttpError] = useState<string | null>(null);
  const [gitError, setGitError] = useState<string | null>(null);
  
  const [codeA, setCodeA] = useState<string>('');
  const [codeB, setCodeB] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'PB' | 'PB5'>('PB');
  const [activePresetKey, setActivePresetKey] = useState<string>('');

  const [draftComment, setDraftComment] = useState<string>('');

  // 댓글 관련 상태
  const [threadsB, setThreadsB] = useState<DiscussionThread[]>([]);
  const [activeThread, setActiveThread] = useState<{thread: DiscussionThread, messages: DiscussionMessage[]} | null>(null);
  const [isCommentInputOpen, setIsCommentInputOpen] = useState<{line: number, threadId?: number, x: number, y: number} | null>(null);

  const [highlightCount, setHighlightCount] = useState(0);

  // 접기(Fold) 상태 관리 (시작 라인 번호를 저장)
  const [foldedA, setFoldedA] = useState<Set<number>>(new Set());
  const [foldedB, setFoldedB] = useState<Set<number>>(new Set());

  // 스크롤 제어를 위한 Ref 추가
  const scrollRefA = React.useRef<HTMLDivElement>(null);
  const scrollRefB = React.useRef<HTMLDivElement>(null);
  const commentTextRef = React.useRef<HTMLTextAreaElement>(null);

  // 드래그 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingTarget, setDraggingTarget] = useState<'input' | 'view' | null>(null);

  const handleMouseDown = (e: React.MouseEvent, target: 'input' | 'view') => {
    const currentPos = target === 'input' ? isCommentInputOpen : activeThread;
    if (!currentPos) return;
    
    setIsDragging(true);
    setDraggingTarget(target);
    setDragOffset({
      x: e.clientX - currentPos.x,
      y: e.clientY - currentPos.y
    });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !draggingTarget) return;
    
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;

    if (draggingTarget === 'input') {
      setIsCommentInputOpen(prev => prev ? { ...prev, x: newX, y: newY } : null);
    } else {
      setActiveThread(prev => prev ? { ...prev, x: newX, y: newY } : null);
    }
  }, [isDragging, draggingTarget, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setDraggingTarget(null);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 동기 스크롤 관련 상태
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const isSyncingRef = React.useRef(false);

  const handleScroll = useCallback((source: 'A' | 'B') => (e: React.UIEvent<HTMLDivElement>) => {
    if (!isSyncEnabled || isSyncingRef.current) return;

    isSyncingRef.current = true;
    const target = source === 'A' ? scrollRefB.current : scrollRefA.current;
    if (target) {
      // 세로 스크롤(scrollTop)만 동기화하여 좌우 스크롤은 독립적으로 유지
      target.scrollTop = e.currentTarget.scrollTop;
    }
    
    window.requestAnimationFrame(() => { isSyncingRef.current = false; });
  }, [isSyncEnabled]);

  const extractMethods = useCallback((code: string, lang: string): MethodInfo[] => {
    const lines = code.split('\n');
    if (lang !== 'java') return extractCMethods(code);

    // Java와 C/JS를 구분하여 메서드 추출
    const methodRegex = /(?:public|protected|private|static|\s) +[\w<>\[\]]+\s+([\w$]+)\s*\(.*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/;
    
    const results: MethodInfo[] = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(methodRegex);
      if (match) {
        const name = match[1];
        if (NON_METHOD_NAMES.has(name)) continue;

        results.push({ name, line: i + 1, endLine: findBlockEndLine(lines, i) });
      }
    }
    return results;
  }, []);

  const langA = useMemo(() => 'c', [links.sourceA]);
  const langB = useMemo(() => 'java', [links.sourceB]);
  const methodsA = useMemo(() => extractMethods(codeA, langA), [codeA, langA, extractMethods]);
  const methodsB = useMemo(() => extractMethods(codeB, langB), [codeB, langB, extractMethods]);

  // 상태 초기화 (코드 변경 시)
  useEffect(() => { setFoldedA(new Set()); }, [codeA]);
  useEffect(() => { setFoldedB(new Set()); }, [codeB]);

  // PB 메소드 이름과 PB5 메소드 이름을 snake_case/camelCase 차이를 무시하고 매칭
  const methodMatches = useMemo(() => {
    const usedLinesB = new Set<number>();
    const matches: MethodMatch[] = [];

    methodsA.forEach(mA => {
      const match = methodsB.find(mB => (
        !usedLinesB.has(mB.line) && areSameMethodName(mA.name, mB.name)
      ));

      if (!match) return;

      usedLinesB.add(match.line);
      matches.push({ name: mA.name, pbLine: mA.line, pb5Line: match.line });
    });

    return matches;
  }, [methodsA, methodsB]);


  const scrollToLine = useCallback((ref: React.RefObject<HTMLDivElement>, line: number) => {
    if (!ref.current) return;
    const lineElement = ref.current.querySelector(`[data-line="${line}"]`) as HTMLElement;
    if (lineElement) {
      lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 시각적 피드백을 위해 잠시 강조
      lineElement.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
      setTimeout(() => {
        if (lineElement) {
          lineElement.style.backgroundColor = 'transparent';
        }
      }, 2000);
    }
  }, []);

  const toggleFold = useCallback((side: 'A' | 'B', startLine: number) => {
    const setter = side === 'A' ? setFoldedA : setFoldedB;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  }, []);

  // 코드 클릭 핸들러 (접기 또는 점프)
  const handleCodeClick = useCallback((side: 'A' | 'B') => (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 메시지 표식 클릭 체크
    if (target.classList.contains('ds-marker')) {
      const { x, y } = getSmartPosition(e.clientX, e.clientY);
      const threadId = parseInt(target.getAttribute('data-thread-id') || '0', 10);
      if (threadId && activePresetKey) {
        discussionService.getMessages(activePresetKey, threadId).then(msgs => {
          const thread = threadsB.find(t => t.id === threadId);
          if (thread) {
            // 스레드 본문 내용을 첫 번째 메시지로 구성
            const rootMsg: DiscussionMessage = {
              id: -thread.id, // 가상 ID
              writer_id: thread.writer_id || 'pb',
              content: thread.content || '',
              created_at: thread.created_at || new Date().toLocaleString()
            };

            // 서버에서 가져온 메시지 중 본문과 중복되는 내용이 있다면 제외하고 나머지를 댓글(replies)로 취급
            const replies = msgs.filter(m => m.content !== thread.content);
            
            setActiveThread({ 
              thread, 
              messages: [rootMsg, ...replies], 
              x, y 
            });
          }
        });
      }
      return;
    }
    const lineElement = target.closest('[data-line]');
    if (!lineElement) return;

    const lineNum = parseInt(lineElement.getAttribute('data-line') || '0', 10);
    if (!lineNum) return;

    const methods = side === 'A' ? methodsA : methodsB;
    const method = methods.find(m => m.line === lineNum);

    // Shift + 클릭 시 새 댓글 작성
    if (side === 'B' && e.shiftKey) {
      const { x, y } = getSmartPosition(e.clientX, e.clientY);
      setIsCommentInputOpen({ 
        line: lineNum, 
        x, y 
      });
    } else if (method) {
      if (e.altKey) {
        if (side === 'A') {
          const match = methodMatches.find(m => m.pbLine === lineNum);
          if (match) scrollToLine(scrollRefB, match.pb5Line);
        } else {
          const match = methodMatches.find(m => m.pb5Line === lineNum);
          if (match) scrollToLine(scrollRefA, match.pbLine);
        }
      } else {
        toggleFold(side, lineNum);
      }
    }
  }, [methodsA, methodsB, methodMatches, scrollToLine, toggleFold, threadsB]);

  // 접기 상태 시각화 및 라인 숨김 적용
  useEffect(() => {
    const applyFolding = (ref: React.RefObject<HTMLDivElement>, methods: MethodInfo[], foldedSet: Set<number>) => {
      if (!ref.current) return;

      // 모든 라인 초기화
      const allLines = ref.current.querySelectorAll('[data-line]');
      allLines.forEach(el => {
        (el as HTMLElement).style.display = 'flex';
        el.classList.remove('method-folded');
        const foldIndicator = el.querySelector('.fold-indicator');
        if (foldIndicator) foldIndicator.remove();
        const dsMarker = el.querySelector('.ds-marker');
        if (dsMarker) dsMarker.remove();
      });

      methods.forEach(method => {
        const startEl = ref.current?.querySelector(`[data-line="${method.line}"]`) as HTMLElement;
        if (!startEl) return;

        startEl.style.cursor = 'pointer';
        
        if (foldedSet.has(method.line)) {
          startEl.classList.add('method-folded');
          // [+] 표시 추가
          const indicator = document.createElement('span');
          indicator.className = 'fold-indicator mr-2 text-blue-500 font-bold bg-blue-50 px-1 rounded text-[13px] flex-shrink-0';
          indicator.innerText = '[ + folded ]';
          indicator.title = '클릭하여 메서드 펼치기';
          startEl.prepend(indicator);

          // 내부 라인 숨기기
          for (let i = method.line + 1; i <= method.endLine; i++) {
            const lineToHide = ref.current?.querySelector(`[data-line="${i}"]`) as HTMLElement;
            if (lineToHide) lineToHide.style.display = 'none';
          }
        }
      });

      // 다크소울 메시지 마커 추가 (PB5 영역)
      if (ref === scrollRefB) {
        threadsB.forEach(t => {
          const el = ref.current?.querySelector(`[data-line="${t.line_number}"]`) as HTMLElement;
          if (el) {
            const marker = document.createElement('span');
            const isResolved = t.status === 'RESOLVED';
            const colorClass = t.status === 'CHECK_PB5' 
              ? 'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]' 
              : t.status === 'CHECK_PB'
                ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
                : 'bg-slate-400';

            marker.className = `ds-marker mr-2 inline-block w-3 h-3 rounded-full ${colorClass} ${isResolved ? '' : 'animate-pulse'} cursor-pointer flex-shrink-0 transition-all`;
            marker.setAttribute('data-thread-id', t.id.toString());

            // 상태별 안내 툴팁 추가
            let statusDesc = '';
            if (t.status === 'CHECK_PB5') statusDesc = 'PB가 의견을 남겼습니다. (PB5 확인 필요)';
            else if (t.status === 'CHECK_PB') statusDesc = 'PB5가 의견을 남겼습니다. (PB 확인 필요)';
            else if (isResolved) statusDesc = '해결된 이슈입니다.';

            marker.title = `${statusDesc}\n클릭하여 대화 보기`;

            el.prepend(marker);
          }
        });
      }
    };

    applyFolding(scrollRefA, methodsA, foldedA);
    applyFolding(scrollRefB, methodsB, foldedB);
  }, [
    foldedA, 
    foldedB, 
    methodsA, 
    methodsB, 
    codeA, 
    codeB, 
    isMounted, 
    threadsB, 
    !!activeThread, // 모달이 열리거나 닫힐 때 마커 재적용
    !!isCommentInputOpen,
    highlightCount // 코드 하이라이팅이 완료되었을 때 마커 재적용
  ]);

  const foldAll = (side: 'A' | 'B', fold: boolean) => {
    const methods = side === 'A' ? methodsA : methodsB;
    const setter = side === 'A' ? setFoldedA : setFoldedB;
    if (fold) {
      setter(new Set(methods.map(m => m.line)));
    } else {
      setter(new Set());
    }
  };

  const toggleFoldAll = (side: 'A' | 'B') => {
    const methods = side === 'A' ? methodsA : methodsB;
    const foldedSet = side === 'A' ? foldedA : foldedB;
    // 하나라도 접혀있으면 모두 펴고, 모두 펴져있으면 모두 접음
    const shouldFold = foldedSet.size === 0;
    foldAll(side, shouldFold);
  };

  const refreshThreads = useCallback(async () => {
    if (!activePresetKey) return;
    try {
      const threads = await discussionService.getThreads(activePresetKey);
      setThreadsB(threads);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    }
  }, [activePresetKey]);

  const handleAddComment = async (content: string) => {
    if (!isCommentInputOpen || !content.trim() || !activePresetKey) return;
    await discussionService.saveComment(activePresetKey, isCommentInputOpen.line, content, activePlatform.toLowerCase(), isCommentInputOpen.threadId);
    setIsCommentInputOpen(null);
    refreshThreads();
    if (activeThread && activePresetKey) {
      const msgs = await discussionService.getMessages(activePresetKey, activeThread.thread.id);
      
      // 갱신 시에도 본문 메시지를 유지하며 병합
      const rootMsg: DiscussionMessage = {
        id: -activeThread.thread.id,
        writer_id: activeThread.thread.writer_id || 'pb',
        content: activeThread.thread.content || '',
        created_at: activeThread.thread.created_at || new Date().toLocaleString()
      };

      const replies = msgs.filter(m => m.content !== activeThread.thread.content);
      setActiveThread({ 
        ...activeThread, 
        messages: [rootMsg, ...replies] 
      });
    }
  };

  const handleCloseThread = async () => {
    if (!activeThread || !activePresetKey) return;
    if (window.confirm('이 쓰레드를 종료하시겠습니까? 종료 후에는 더 이상 메시지를 남길 수 없습니다.')) {
      try {
        await discussionService.closeThread(activePresetKey, activeThread.thread.id);
        setActiveThread(null);
        refreshThreads();
      } catch (err) {
        alert('쓰레드 종료 처리 중 오류가 발생했습니다.');
      }
    }
  };

  // 메시지 내의 코드 블록(``` ```)을 처리하는 함수
  const renderMessageContent = (content: string, isRoot: boolean) => {
    const blockParts = content.split(/(```[\s\S]*?```)/g);
    return blockParts.map((blockPart, bIdx) => {
      if (blockPart.startsWith('```') && blockPart.endsWith('```')) {
        const code = blockPart.slice(3, -3).trim();
        return (
          <div key={`b-${bIdx}`} className="my-2 p-3 bg-[#1e1e1e] rounded-lg font-mono text-[13px] text-slate-300 border border-slate-800 overflow-x-auto whitespace-pre shadow-inner">
            {code}
          </div>
        );
      }
      
      const inlineParts = blockPart.split(/(`[^`\n]+`)/g);
      return inlineParts.map((inlinePart, iIdx) => {
        if (inlinePart.startsWith('`') && inlinePart.endsWith('`')) {
          return (
            <code key={`i-${bIdx}-${iIdx}`} className="px-1.5 py-0.5 mx-0.5 bg-indigo-50 border border-indigo-100 rounded font-mono text-[0.9em] text-indigo-700 font-bold">
              {inlinePart.slice(1, -1)}
            </code>
          );
        }
        return <span key={`s-${bIdx}-${iIdx}`} className="whitespace-pre-wrap">{inlinePart}</span>;
      });
    });
  };

  useEffect(() => {
    if (!isCommentInputOpen) setDraftComment('');
  }, [isCommentInputOpen]);

  // 클라이언트 마운트 시 localStorage 데이터 로드 (Hydration Mismatch 방지)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    setLinks(getSavedLinks());
    setCodeA(localStorage.getItem('sourceA') ?? '');
    setCodeB(localStorage.getItem('sourceB') ?? '');
    setActivePlatform((localStorage.getItem('activePlatform') as 'PB' | 'PB5') ?? 'PB');
    setActivePresetKey(localStorage.getItem('activePresetKey') ?? '');

    // 동적 파일 프리셋 로드
    fetch('/api/links')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setFilePresets(data);
      })
      .catch(err => console.error('Failed to load dynamic presets:', err));
  }, []);

  useEffect(() => {
    if (!isMounted || !activePresetKey) return;
    
    refreshThreads();
    
    // 30초마다 쓰레드 정보를 서버에서 가져와 마커를 최신화합니다.
    const timer = setInterval(refreshThreads, 30000);
    return () => clearInterval(timer);
  }, [activePresetKey, isMounted, refreshThreads]);

  const saveLocally = useCallback((a: string, b: string) => {
    localStorage.setItem('sourceA', a);
    localStorage.setItem('sourceB', b);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('sourceLinks', JSON.stringify(links));
  }, [links, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('activePlatform', activePlatform);
  }, [activePlatform, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('activePresetKey', activePresetKey);
  }, [activePresetKey, isMounted]);

  const handleLoadAll = async () => {
    if (!links.sourceA || !links.sourceB) {
      alert('프리셋을 먼저 선택해주세요.');
      return;
    }

    setIsLoadingHttp(true);
    setIsLoadingGit(true);
    setHttpError(null);
    setGitError(null);
    setCodeA('');
    setCodeB('');

    try {
      const [resA, resB] = await Promise.allSettled([
        fetchCodeFromSource({
          link: links.sourceA,
          side: 'A',
        }),
        fetchCodeFromSource({
          link: links.sourceB,
          side: 'B',
        }),
      ]);

      let nextA = '';
      let nextB = '';

      if (resA.status === 'fulfilled') {
        nextA = resA.value;
        setCodeA(nextA);
      } else {
        setHttpError(getErrorMessage(resA.reason));
      }

      if (resB.status === 'fulfilled') {
        nextB = resB.value;
        setCodeB(nextB);
      } else {
        setGitError(getErrorMessage(resB.reason));
      }

      saveLocally(nextA, nextB);
    } finally {
      setIsLoadingHttp(false);
      setIsLoadingGit(false);
      refreshThreads(); // 코드 로딩 후 즉시 마커 갱신
    }
  };

  const handleHighlight = useCallback(() => setHighlightCount(prev => prev + 1), []);

  // HTML 소스인지 판별 (단순 확장자 체크 또는 내용 체크)
  const renderCodeContent = (code: string, lang: string, isLoading: boolean, error: string | null) => {
    if (isLoading) return <div className="text-gray-400 font-mono text-xs p-4 animate-pulse">Loading source code...</div>;
    if (error) return <div className="font-mono text-xs p-4 italic text-red-500 font-bold">Load failed: {error}</div>;
    if (!code) return <div className="font-mono text-xs p-4 italic text-gray-400">Load source code.</div>;

    // 만약 소스가 이미 완성된 HTML 형태(PB 레거시 특징)라면 Shiki를 거치지 않고 직접 렌더링
    const isAlreadyHtml = code.trim().startsWith('<') && (code.includes('</') || code.includes('/>'));
    
    if (isAlreadyHtml) {
      return <PBCode srcListTab ={code}/>
    }

    return <CodeBlock code={code} lang={lang} onHighlight={handleHighlight} />;
  };

  return (
    <div className="code-compare p-3 w-full h-full bg-slate-100 flex flex-col gap-3 overflow-hidden relative font-sans">
      {/* 헤더 영역 최적화 */}
      <header className="border-b bg-white -mx-3 -mt-3 p-4 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-xl font-black text-slate-800 m-0 tracking-tighter">CODE COMPARISON</h1>
          <p className="text-slate-500 text-[11px] mt-0.5 font-bold m-0 uppercase opacity-70">Legacy PB vs New PB5 (Git)</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
          <button 
            onClick={() => setActivePlatform('PB')}
            className={`px-6 py-1.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-400 hover:text-indigo-500'}`}
          >
            PB
          </button>
          <button 
            onClick={() => setActivePlatform('PB5')}
            className={`px-6 py-1.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB5' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-slate-400 hover:text-emerald-500'}`}
          >
            PB5
          </button>
        </div>
      </header>

      {/* 비교 세트 선택 */}
      <div className="px-4 py-3 border rounded-xl bg-indigo-700 flex flex-col gap-3 shadow-lg flex-shrink-0 text-white">
        <div className="flex items-center gap-3">
          <label className="text-xs font-black whitespace-nowrap m-0 opacity-80 uppercase">Preset:</label>
          <select 
            className="flex-1 p-2 border-0 rounded bg-white text-gray-900 text-sm font-semibold focus:ring-4 focus:ring-indigo-300 outline-none" 
            onChange={(e) => {
              const key = e.target.value;
              setActivePresetKey(key);
              const preset = LINK_PRESETS[key] || filePresets[key];
              if (preset) setLinks(preset);
            }}
            value={activePresetKey}
          >
            <option value="" disabled>Select a source preset</option>
            {Object.keys(LINK_PRESETS).map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
            {Object.keys(filePresets).map(key => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>
          <button 
            onClick={handleLoadAll}
            className="bg-white text-indigo-700 px-6 py-2 rounded hover:bg-indigo-50 transition font-bold text-sm shadow-sm disabled:bg-gray-300 disabled:text-gray-500" 
            disabled={isLoadingHttp || isLoadingGit}
          >
            {isLoadingHttp || isLoadingGit ? 'Loading...' : 'Load all sources'}
          </button>
          <button 
            onClick={() => {
              if (!isSyncEnabled && scrollRefA.current && scrollRefB.current) {
                scrollRefB.current.scrollTop = scrollRefA.current.scrollTop;
              }
              setIsSyncEnabled(!isSyncEnabled);
            }}
            className={`px-4 py-2 rounded font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${
              isSyncEnabled ? 'bg-amber-400 text-amber-900 ring-2 ring-amber-200' : 'bg-indigo-500 text-white hover:bg-indigo-400'
            }`}
          >
            {isSyncEnabled ? '🔒 동기 스크롤 ON' : '🔓 동기 스크롤 OFF'}
          </button>
        </div>
      </div>

      {/* 메인 비교 영역 간격 조정 */}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* ?쇱そ ??*/}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1 min-h-0 relative group">
            <h3 className="p-2 text-xs flex justify-between items-center bg-blue-600 text-white m-0 sticky top-0 z-20 flex-shrink-0">
              <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold whitespace-nowrap">PB 코드 (HTTP)</span>
                  <button 
                    onClick={() => toggleFoldAll('A')}
                    className="px-2 py-0.5 bg-blue-700 hover:bg-blue-800 rounded border border-blue-400/30 text-[10px] font-bold transition-colors"
                  >
                    {foldedA.size > 0 ? '전체 펴기' : '전체 접기'}
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-[15px] bg-white/20 px-2 py-0.5 rounded font-mono">
                  L: {codeA ? codeA.split('\n').length : 0} / M: {methodsA.length}
                </span>
                <span className="text-[12px] opacity-60 mt-0.5">클릭:접기 | Alt+클릭:점프</span>
              </div>
            </h3>
            <div 
              ref={scrollRefA}
              onScroll={handleScroll('A')}
              onClick={handleCodeClick('A')}
              className="flex-1 overflow-auto text-[15px] font-mono min-h-0 w-full border-r border-slate-200"
            >
              <div className="w-full text-slate-900">
                {renderCodeContent(codeA, langA, isLoadingHttp, httpError)}
              </div>
            </div>
          </div>
          {httpError && (
            <div className="bg-red-50 text-red-600 text-[11px] p-2 border-t border-red-100 font-bold flex-shrink-0">
              ⚠️ {httpError}
            </div>
          )}
        </div>

        {/* ?ㅻⅨ履???*/}
        <div className="flex flex-col gap-2 min-h-0">
          <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1 min-h-0 relative group">
            <h3 className="p-2 text-xs flex justify-between items-center bg-green-600 text-white m-0 sticky top-0 z-20 flex-shrink-0">
              <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold whitespace-nowrap">PB5 코드 (Git)</span>
                  <button 
                    onClick={() => toggleFoldAll('B')}
                    className="px-2 py-0.5 bg-green-700 hover:bg-green-800 rounded border border-green-400/30 text-[10px] font-bold transition-colors"
                  >
                    {foldedB.size > 0 ? '전체 펴기' : '전체 접기'}
                  </button>
                </div>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <span className="text-[15px] bg-white/20 px-2 py-0.5 rounded font-mono">
                  L: {codeB ? codeB.split('\n').length : 0} / M: {methodsB.length}
                </span>
                <span className="text-[12px] opacity-60 mt-0.5">클릭:접기 | Alt+클릭:점프 | Shift+클릭:댓글</span>
              </div>
            </h3>
            <div 
              ref={scrollRefB}
              onScroll={handleScroll('B')}
              onClick={handleCodeClick('B')}
              className="flex-1 overflow-auto text-[15px] font-mono min-h-0 w-full"
            >
              <div className="w-full text-slate-900">
                {renderCodeContent(codeB, langB, isLoadingGit, gitError)}
              </div>
            </div>
          </div>
          {gitError && (
            <div className="bg-red-50 text-red-600 text-[11px] p-2 border-t border-red-100 font-bold flex-shrink-0">
              ⚠️ {gitError}
            </div>
          )}
        </div>
      </div>

      {/* Dark Souls Style Message Overlay (Reading) */}
      {activeThread && (
        <div className="fixed inset-0 z-[100]" onClick={() => setActiveThread(null)}>
          <div 
            className="absolute" 
            style={{ left: activeThread.x, top: activeThread.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white border border-gray-200 rounded-2xl w-[420px] shadow-2xl text-gray-800 font-sans overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
              <div 
                onMouseDown={(e) => handleMouseDown(e, 'view')}
                className="bg-white px-5 py-4 border-b border-gray-100 flex justify-between items-center cursor-move select-none"
              >
                <div className="flex flex-col">
                  <span className="font-black text-[16px] text-gray-900 tracking-tight">Thread</span>
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">Line {activeThread.thread.line_number} discussion</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleCloseThread}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-black rounded-lg transition-all border border-red-200"
                  >
                    CLOSE THREAD
                  </button>
                  <button onClick={() => setActiveThread(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors text-xl">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-6 max-h-[55vh] overflow-y-auto custom-scrollbar bg-white text-left">
                {
                activeThread.messages.map((msg, index) => {
                  const isRoot = index === 0;
                  return (
                    <div key={msg.id} className={`flex gap-4 items-start group ${isRoot ? 'pb-6 border-b border-slate-100' : ''}`}>
                      <div className={`${isRoot ? 'w-10 h-10 text-[14px]' : 'w-9 h-9 text-[12px]'} rounded-lg flex-shrink-0 flex items-center justify-center font-black text-white shadow-sm transition-transform group-hover:scale-105 ${msg.writer_id === 'pb' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                        {msg.writer_id.toUpperCase().charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`font-black ${isRoot ? 'text-[16px]' : 'text-[14px]'} text-slate-900`}>{msg.writer_id.toUpperCase()}</span>
                          <span className="text-[11px] text-slate-400 font-bold tracking-tight">{msg.created_at}</span>
                        </div>
                        <div className={`${isRoot ? 'text-[15px] text-slate-800' : 'text-[14px] text-slate-700'} leading-relaxed break-words`}>
                  
                          {renderMessageContent(msg.content, isRoot)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 bg-slate-50 border-t border-gray-100">
                <button 
                  onClick={() => setIsCommentInputOpen({ line: activeThread.thread.line_number, threadId: activeThread.thread.id, x: activeThread.x + 10, y: activeThread.y + 50 })}
                  className="w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-400 text-[14px] font-bold hover:border-indigo-300 hover:text-indigo-500 transition-all text-left px-4 shadow-sm flex items-center gap-2 group"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs group-hover:bg-indigo-100">+</span>
                  Reply to this thread...
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment Input Modal (Writing) */}
      {isCommentInputOpen && (
        <div className="fixed inset-0 z-[110]" onClick={() => setIsCommentInputOpen(null)}>
          <div 
            className="absolute" 
            style={{ left: isCommentInputOpen.x, top: isCommentInputOpen.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-white border border-gray-200 rounded-2xl w-[400px] shadow-2xl p-5 font-sans border-t-4 border-t-emerald-500">
              <h4 
                onMouseDown={(e) => handleMouseDown(e, 'input')}
                className="text-slate-800 font-black mb-4 flex items-center justify-between cursor-move select-none"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">New Message</span>
                  <span className="text-[14px] tracking-tight">Line {isCommentInputOpen.line}</span>
                </div>
              </h4>
              <textarea 
                ref={commentTextRef}
                autoFocus
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                className="w-full h-36 p-4 text-[15px] focus:outline-none focus:ring-4 resize-none mb-3 transition-all shadow-inner rounded-xl bg-slate-50 text-slate-800 border-slate-200 font-sans focus:ring-indigo-500/10 focus:border-indigo-500"
                placeholder="Write your message here... (Use ``` or ` ` for code)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment(draftComment);
                  }
                }}
              />
              {draftComment.trim() && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl max-h-32 overflow-y-auto shadow-inner">
                  <div className="text-[9px] text-slate-400 font-black uppercase mb-1 tracking-widest">Live Preview</div>
                  <div className="text-[13px] leading-relaxed break-words text-slate-600">
                    {renderMessageContent(draftComment, false)}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-400 font-bold italic leading-tight">Shift + Enter for new line</span>
                  <span className="text-[11px] text-indigo-400 font-bold italic leading-tight">Use ``` for code blocks, ` for inline</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setIsCommentInputOpen(null)} className="px-4 py-2 text-slate-400 text-[14px] font-black hover:text-slate-600 transition-all">Cancel</button>
                  <button 
                    onClick={() => handleAddComment(draftComment)}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-black rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CodeComparator;
