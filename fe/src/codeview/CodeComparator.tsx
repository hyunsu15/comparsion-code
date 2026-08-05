import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { resolveSourceContent, resolveXmlByName, resolvePcByNameCI } from '../Link';
import type { CodeLang, ResolveStatus } from '../Link';
import type { CodeSourceSet } from '../FileLink';
import CodeBlock from './CodeBlock';
import PBCode from '../PBCode';
import { mockPbCall } from '../mock/pbCodeCall';
import { discussionService } from '../discussionService';
import type { DiscussionThread, DiscussionMessage, CodeKind, ServiceInfo, ThreadReaction } from '../discussionService';
import { OPINION_TYPES, getOpinionMeta } from '../config/opinionType';
import { REACTIONS, getReactionMeta } from '../config/reaction';
import type { OpinionType } from '../config/opinionType';
import CategorySelector from '../CategorySelector';
import Checklist from '../checklist/Checklist';
import ShortcutsHelp from '../component/ShortcutsHelp';
import { findImportRegions } from './importRegion';
import {
  resolveProgramFileName,
  extractJumpName,
  findMethodByName,
  findCorrespondingMethod,
  extractMethods,
} from '../methodJump';
import { findMatches } from './codeSearch';
import { detectMapperCall, findMapperStatement, extractEmbeddedSql, matchEmbeddedSql, pbSqlFileName } from './sqlLink';
import SqlSlidePanel from './SqlSlidePanel';
import { sortThreadsForBoard } from '../discussion/commentSort';
import { getErrorMessage } from '../errorMessage';
import { describeResolveFailure, formatDateTime, getSmartPosition } from './codeViewFormat';
import { fetchCodeFromSource, getSavedLinks } from './sourceLoad';

// 브라우저 기반 가상 파일 시스템 설정
// 가상 파일 시스템 관련 코드는 환경에 따라 필요시 사용 (현재는 pb5CodeCall이 서버 액션이므로 최소화)
// const fs = new FS('code-diff-fs');
// const pfs = fs.promises;

interface MethodMatch {
  name: string;
  pbLine: number;
  pb5Line: number;
}


// 성능 최적화된 Shiki 하이라이터 컴포넌트 (가로 세로 스크롤 완벽 지원)
export interface NavRequest {
  serviceId: string;
  line: number;
  codeKind: CodeKind;
  nonce: number; // 같은 좌표를 다시 눌러도 트리거되도록 증가하는 값
}

const CodeComparator: React.FC<{ navRequest?: NavRequest | null; favorites?: string[]; onToggleFavorite?: (serviceId: string) => void }> = ({ navRequest, favorites, onToggleFavorite }) => {
  // SSR 지원을 위해 초기값은 고정된 기본값으로 설정
  const [links, setLinks] = useState<CodeSourceSet>({ sourceA: '', sourceB: '' });
  // 비교 소스 카탈로그 (DB comparsion_services). 대/중 카테고리 + code_kind로 소스를 선택한다.
  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [selectedBig, setSelectedBig] = useState<string>('');
  const [selectedMiddle, setSelectedMiddle] = useState<string>('');
  const [fileNameA, setFileNameA] = useState<string>(''); // 왼쪽(PB) 파일명 표시용
  const [fileNameB, setFileNameB] = useState<string>(''); // 오른쪽(PB5) 파일명 표시용
  // 코드 로드 후 자동 점프할 이름(file_name 마지막 조각). 매칭되는 메소드로 1회 스크롤.
  const [pendingJumpA, setPendingJumpA] = useState<string | null>(null); // 왼쪽(PB) 자동 점프 대기
  const [pendingJumpB, setPendingJumpB] = useState<string | null>(null);
  // 코멘트 모아보기 → 소스 비교 점프 시, 코드 로드 후 이동할 지정 줄(자동 메소드 점프보다 우선).
  const [navPending, setNavPending] = useState<{ line: number; codeKind: CodeKind } | null>(null);
  const [isLoadingA, setIsLoadingA] = useState<boolean>(false);
  const [isLoadingB, setIsLoadingB] = useState<boolean>(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);
  
  const [codeA, setCodeA] = useState<string>('');
  const [codeB, setCodeB] = useState<string>('');
  const [isMounted, setIsMounted] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'PB' | 'PB5'>('PB');
  const [fontSize, setFontSize] = useState<number>(15);
  const [activePresetKey, setActivePresetKey] = useState<string>('');
  const [hoveredSide, setHoveredSide] = useState<'A' | 'B' | null>(null);
  // 체크리스트 우측 슬라이드 패널 열림 상태
  const [isChecklistOpen, setIsChecklistOpen] = useState<boolean>(false);
  // 즐겨찾기 빠른 선택(★ 토글) 열림 상태 — 켜면 즐겨찾기 프로그램을 칩으로 나열한다.
  const [showFavPicker, setShowFavPicker] = useState<boolean>(false);
  // 조작 단축키 도움말(헤더 "?") 펼침 상태 — PB/PB5 공유 + localStorage. 기본 펼침.
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('shortcutsHelpOpen') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('shortcutsHelpOpen', String(shortcutsOpen)); } catch { /* noop */ }
  }, [shortcutsOpen]);

  // SQL 대응 보기: PB5 매퍼 호출 클릭 → 카드(양쪽 SQL 스니펫) + 전체 매퍼 XML 패널
  interface SqlPeekState {
    methodName: string;
    pbFileName: string;
    pbFound: boolean;
    pbFullContent: string | null;
    pbStartLine: number;
    pb5FileName: string;
    pb5Sql: string;
    pb5FullContent: string;
    pb5StartLine: number;
    pbSql: string | null;
    candidateCount: number;
    x: number;
    y: number;
  }
  const [sqlPeek, setSqlPeek] = useState<SqlPeekState | null>(null);
  const [sqlPanel, setSqlPanel] = useState<{ fileName: string; content: string; line: number } | null>(null);
  const [sqlPanelPb, setSqlPanelPb] = useState<{ fileName: string; content: string; line: number } | null>(null);

  // IDE식 코드 내용 검색 (Ctrl+F). PB/PB5는 네이밍 규칙이 달라 좌·우 각각 검색어를 둔다.
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQueryA, setSearchQueryA] = useState(''); // PB(왼쪽) 검색어
  const [searchQueryB, setSearchQueryB] = useState(''); // PB5(오른쪽) 검색어
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [matchIdxA, setMatchIdxA] = useState(0);
  const [matchIdxB, setMatchIdxB] = useState(0);
  const searchInputRefA = React.useRef<HTMLInputElement>(null);
  const searchInputRefB = React.useRef<HTMLInputElement>(null);

  const [splitOffset, setSplitOffset] = useState<number>(50); // 좌우 분할 비율 (15% ~ 85%)
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const [draftComment, setDraftComment] = useState<string>('');
  // 새 스레드(처음 여는 댓글)에서 선택한 의견 유형 — 미선택 시 전송 불가(강제)
  const [draftOpinionType, setDraftOpinionType] = useState<OpinionType | null>(null);
  // 작성자 이름 (빈 값 불가) — localStorage에 저장하여 세션 간 유지
  const [writerName, setWriterName] = useState<string>('');

  // 인앱 피드백(토스트)·확인 모달 상태 (네이티브 alert/confirm 대체 → UX 일관성/피드백)
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState<boolean>(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState<boolean>(false);

  const showToast = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, type });
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  // 댓글 관련 상태
  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  // code_kind 기준으로 좌(pb)/우(pb5) 코드에 표시할 스레드를 분리
  const threadsA = useMemo(() => threads.filter(t => t.code_kind === 'pb'), [threads]);
  const threadsB = useMemo(() => threads.filter(t => t.code_kind === 'pb5'), [threads]);
  const [activeThread, setActiveThread] = useState<{thread: DiscussionThread, messages: DiscussionMessage[], x: number, y: number} | null>(null);
  const [markerPick, setMarkerPick] = useState<{ threads: DiscussionThread[]; x: number; y: number } | null>(null);
  const [isCommentInputOpen, setIsCommentInputOpen] = useState<{line: number, threadId?: number, codeKind: CodeKind, x: number, y: number} | null>(null);

  const [highlightCount, setHighlightCount] = useState(0);

  // 접기(Fold) 상태 관리 (시작 라인 번호를 저장)
  const [foldedA, setFoldedA] = useState<Set<number>>(new Set());
  const [foldedB, setFoldedB] = useState<Set<number>>(new Set());

  // 스크롤 제어를 위한 Ref 추가
  const scrollRefA = React.useRef<any>(null);
  const scrollRefB = React.useRef<any>(null);
  const commentTextRef = React.useRef<HTMLTextAreaElement>(null);

  // 드래그 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingTarget, setDraggingTarget] = useState<'input' | 'view' | 'sql' | null>(null);

  const handleMouseDown = (e: React.MouseEvent, target: 'input' | 'view' | 'sql') => {
    const currentPos = target === 'input' ? isCommentInputOpen : target === 'sql' ? sqlPeek : activeThread;
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
    } else if (draggingTarget === 'sql') {
      setSqlPeek(prev => prev ? { ...prev, x: newX, y: newY } : null);
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

  // 가로 사이즈 조절 (Resizing) 로직
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const container = document.getElementById('main-split-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        const percentage = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitOffset(Math.max(15, Math.min(percentage, 85))); // 최소 15%, 최대 85% 제한
      }
    };
    const onUp = () => setIsResizing(false);

    if (isResizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      document.body.style.cursor = 'col-resize';
    } else {
      document.body.style.cursor = '';
    }
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isResizing]);

  // 동기 스크롤 관련 상태
  const [isSyncEnabled, setIsSyncEnabled] = useState(false);
  const isSyncingRef = React.useRef(false);
  const syncOffsetRef = React.useRef(0); // 두 창의 스크롤 위치 차이 저장
  const activeScrollSideRef = React.useRef<'A' | 'B' | null>(null);

  const handleWheel = useCallback((source: 'A' | 'B') => (e: React.WheelEvent<HTMLDivElement>) => {
    if (!isSyncEnabled) return;

    // 세로 스크롤 위주인 경우에만 커스텀 동기화 로직 적용 (가로 스크롤은 개별 동작 유지)
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      const delta = e.deltaY;
      
      // 한쪽이 벽에 닿아도 다른 쪽은 계속 이동할 수 있도록 delta 값을 직접 더해줌
      // 브라우저가 범위 밖의 값은 자동으로 최소/최대치로 클램핑(Clamping) 처리함
      const elA = scrollRefA.current?.getScrollElement?.() || scrollRefA.current;
      const elB = scrollRefB.current?.getScrollElement?.() || scrollRefB.current;

      if (elA) elA.scrollTop += delta;
      if (elB) elB.scrollTop += delta;
    }
  }, [isSyncEnabled]);

  const handleScroll = useCallback((source: 'A' | 'B') => (e: React.UIEvent<HTMLDivElement>) => {
    // 휠 이벤트로 인한 스크롤은 handleWheel에서 이미 처리했으므로, 
    // 스크롤바 드래그와 같은 마우스가 영역 밖에 있는 경우에만 기존 동기화 수행
    if (!isSyncEnabled || isSyncingRef.current || hoveredSide === source) return;

    isSyncingRef.current = true;
    const targetHandle = source === 'A' ? scrollRefB.current : scrollRefA.current;
    const target = targetHandle?.getScrollElement?.() || targetHandle;

    if (target) {
      // 스크롤바를 직접 드래그할 때는 저장된 오프셋을 유지하며 강제 이동
      const currentScrollTop = e.currentTarget.scrollTop;
      target.scrollTop = source === 'A' 
        ? currentScrollTop + syncOffsetRef.current 
        : currentScrollTop - syncOffsetRef.current;
    }
    
    window.requestAnimationFrame(() => { isSyncingRef.current = false; });
  }, [isSyncEnabled, hoveredSide]);

  // 동기 스크롤 토글 — 켤 때 두 창의 현재 스크롤 차(offset)를 저장해 상대 위치를 유지한다.
  // 분할선 가운데 체인 버튼과 단축키(Alt+S)가 공유한다.
  const toggleSync = useCallback(() => {
    const elA = scrollRefA.current?.getScrollElement?.() || scrollRefA.current;
    const elB = scrollRefB.current?.getScrollElement?.() || scrollRefB.current;
    if (!isSyncEnabled && elA && elB) {
      syncOffsetRef.current = elB.scrollTop - elA.scrollTop;
    }
    setIsSyncEnabled(!isSyncEnabled);
  }, [isSyncEnabled]);

  // 선택한 소스의 실제 확장자에서 결정된 언어. pb는 항상 c 계열, pb5는 java 또는 xml.
  const [langA, setLangA] = useState<CodeLang>('c');
  const [langB, setLangB] = useState<CodeLang>('java');
  const methodsA = useMemo(() => extractMethods(codeA, langA), [codeA, langA]);
  const methodsB = useMemo(() => extractMethods(codeB, langB), [codeB, langB]);
  // 상단/중간의 import/include 묶음들 — 접기 영역으로 추가(기본 접힘). 흩어진 #include·EXEC SQL INCLUDE
  // 묶음을 각각 잡는다. methodsA/B(개수·점프·매칭)는 그대로 두고, CodeBlock 접기 목록(foldRegions)에만 합친다.
  const importRegionsA = useMemo(() => findImportRegions(codeA, langA), [codeA, langA]);
  const importRegionsB = useMemo(() => findImportRegions(codeB, langB), [codeB, langB]);
  const foldRegionsA = useMemo(() => [...importRegionsA, ...methodsA], [importRegionsA, methodsA]);
  const foldRegionsB = useMemo(() => [...importRegionsB, ...methodsB], [importRegionsB, methodsB]);
  // PB5(오른쪽) 매퍼 호출 줄 — hover 안내·커서용(발견성). 클릭 시 정확 판별은 openSqlPeek(detectMapperCall)가 한다.
  const mapperCallLinesB = useMemo(() => {
    const set = new Set<number>();
    if (langB !== 'java') return set;
    codeB.split('\n').forEach((line, i) => {
      if (/\b\w*[Mm]apper\.\w+\s*\(/.test(line)) set.add(i + 1);
    });
    return set;
  }, [codeB, langB]);

  // 검색 매치(좌·우 각각) + 현재(active) 매치
  const matchesA = useMemo(() => findMatches(codeA, searchQueryA, searchCaseSensitive), [codeA, searchQueryA, searchCaseSensitive]);
  const matchesB = useMemo(() => findMatches(codeB, searchQueryB, searchCaseSensitive), [codeB, searchQueryB, searchCaseSensitive]);
  const activeMatchA = matchesA[matchIdxA] ?? null;
  const activeMatchB = matchesB[matchIdxB] ?? null;

  // 상태 초기화 (코드 변경 시)
  // 코드 변경 시 접힘 초기화 — import/include 묶음들은 기본 접힘(사용자가 ▶ 로 펼침).
  useEffect(() => { setFoldedA(new Set(importRegionsA.map((r) => r.line))); }, [importRegionsA]);
  useEffect(() => { setFoldedB(new Set(importRegionsB.map((r) => r.line))); }, [importRegionsB]);

  // PB(왼쪽)·PB5(오른쪽) 메소드를 이름으로 대응시킨다.
  // 1순위 정규화 일치 > 2순위 pb⊇pb5 포함(가장 가까운). 좌우 점프(Alt+클릭)에 사용.
  const methodMatches = useMemo(() => {
    const usedLinesB = new Set<number>();
    const matches: MethodMatch[] = [];

    methodsA.forEach(mA => {
      const match = findCorrespondingMethod(methodsB, mA.name, true, mB => usedLinesB.has(mB.line));

      if (!match) return;

      usedLinesB.add(match.line);
      matches.push({ name: mA.name, pbLine: mA.line, pb5Line: match.line });
    });

    return matches;
  }, [methodsA, methodsB]);

  // ── 비교 소스 선택 핸들러 (옵션 파생/렌더는 CategorySelector 가 담당) ──
  // 하위 선택 초기화 (대/중분류가 바뀌면 호출)
  const resetSourceSelection = () => {
    setActivePresetKey('');
    setFileNameA('');
    setFileNameB('');
    setLinks({ sourceA: '', sourceB: '' });
  };

  const handleSelectBig = (big: string) => {
    setSelectedBig(big);
    setSelectedMiddle('');
    resetSourceSelection();
  };

  const handleSelectMiddle = (middle: string) => {
    setSelectedMiddle(middle);
    resetSourceSelection();
  };

  // 즐겨찾기 칩 클릭 — 유형/업무 드롭다운도 그 프로그램 기준으로 맞춘 뒤 좌우 비교를 로드한다.
  const pickFavorite = (serviceId: string) => {
    const base = services.find((s) => s.service_id === serviceId);
    if (base?.big_category) setSelectedBig(base.big_category);
    if (base?.middle_category) setSelectedMiddle(base.middle_category);
    handleSelectProgram(serviceId);
  };

  // 프로그램명(service_id)까지 고르면 pb/pb5 소스를 세팅하고 바로 열기(자동 로드).
  // 소스 내용은 DB의 file_name(프로그램ID)으로 로컬 에셋을 찾아온다.
  //   - 새 폴더 구조(code/c/**, code/java/**/*-online/**)는 확장자로 pb/pb5를 구분해 자동 매칭.
  //   - 매칭 실패 시 구버전(폴더명=service_id) 방식으로 폴백.
  // 내용은 선택 시점에만 지연 로딩하므로 초기 로딩이 가볍다.
  const handleSelectProgram = async (serviceId: string, jumpOverride?: { line: number; codeKind: CodeKind }) => {
    const rows = services.filter(s => s.service_id === serviceId);
    const pbRow = rows.find(r => r.code_kind === 'pb');
    const pb5Row = rows.find(r => r.code_kind === 'pb5');
    // 대분류가 '서비스'면 file_name(프로그램ID)으로 실제 파일명 도출(pb=<file_name>_APS.pc, pb5=<file_name>Service.java).
    const bigCategory = (pbRow ?? pb5Row)?.big_category;
    const pbFileName = resolveProgramFileName('pb', bigCategory, pbRow?.file_name);
    const pb5FileName = resolveProgramFileName('pb5', bigCategory, pb5Row?.file_name);
    setActivePresetKey(serviceId);
    setFileNameA(pbFileName ?? '');
    setFileNameB(pb5FileName ?? '');
    if (jumpOverride) {
      // 코멘트 모아보기에서 온 점프: 자동(메소드) 점프 대신 지정한 줄로 이동한다.
      setPendingJumpA(null);
      setPendingJumpB(null);
      setNavPending(jumpOverride);
    } else {
      // file_name 마지막 조각(확장자면 없음)을 자동 점프 이름으로 쓴다. 코드 로드 후 좌/우에서
      // 이름 매칭(1순위 일치, 2순위 포함)으로 위치를 찾는다. 한쪽만 있으면 양쪽이 공유한다.
      const nameA = extractJumpName(pbFileName);
      const nameB = extractJumpName(pb5FileName);
      setPendingJumpA(nameA ?? nameB);
      setPendingJumpB(nameB ?? nameA);
    }

    // 소스를 찾는 동안에도 즉시 로딩 상태를 보여 준다.
    setIsLoadingA(true);
    setIsLoadingB(true);
    setErrorA(null);
    setErrorB(null);

    try {
      const [resA, resB] = await Promise.all([
        resolveSourceContent(pbFileName, 'pb', serviceId),
        resolveSourceContent(pb5FileName, 'pb5', serviceId),
      ]);
      setLangA(resA.lang);
      setLangB(resB.lang);
      setLinks({ sourceA: resA.content, sourceB: resB.content });

      // 매칭 실패 시 '디버깅 가능한' 사유를 만든다(어느 측/어떤 file_name/어디서 실패).
      const diag = {
        a: describeResolveFailure('PB', pbFileName, resA.status, 'src/assets/code/c/**/*.pc'),
        b: describeResolveFailure('PB5', pb5FileName, resB.status, 'src/assets/code/java/**/*-online/**/*.{java,xml}'),
      };
      if (diag.a) console.warn('[CodeComparator]', diag.a); // 콘솔에도 남겨 디버깅을 돕는다
      if (diag.b) console.warn('[CodeComparator]', diag.b);

      loadSources(resA.content, resB.content, diag); // 열기 버튼 없이 자동 로드
    } catch (err) {
      setIsLoadingA(false);
      setIsLoadingB(false);
      showToast(`소스를 불러오지 못했습니다: ${getErrorMessage(err)}`, 'error');
    }
  };


  const scrollToLine = useCallback((ref: React.RefObject<any>, line: number): boolean => {
    if (!ref.current) return false;

    // 1. 데이터 기반 점프 (Virtualizer가 있는 CodeBlock인 경우)
    if (typeof ref.current.scrollToLine === 'function') {
      return ref.current.scrollToLine(line) !== false;
    }

    // 2. 레거시 DOM 기반 점프 (PBCode 등 일반 div인 경우)
    const lineElement = ref.current.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
    if (!lineElement) return false;

    lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    lineElement.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
    setTimeout(() => {
      if (lineElement) lineElement.style.backgroundColor = 'transparent';
    }, 2000);
    return true;
  }, []);

  // 코드 로딩·하이라이트가 끝나는 즉시, file_name 이름과 매칭되는 메소드로 자동 점프한다.
  // (highlightCount = 토큰 준비 신호) 무매칭이면 조용히 스킵(자동 점프는 best-effort).
  useEffect(() => {
    if (!pendingJumpB) return;
    const target = findMethodByName(methodsB, pendingJumpB);
    if (!target) return; // 아직 메소드 추출 전이거나 무매칭 → 다음 갱신 때 재시도
    if (scrollToLine(scrollRefB, target.line)) setPendingJumpB(null); // 점프 성공 시 1회만 수행
  }, [pendingJumpB, methodsB, highlightCount, scrollToLine]);

  // 좌측(PB)도 동일.
  useEffect(() => {
    if (!pendingJumpA) return;
    const target = findMethodByName(methodsA, pendingJumpA);
    if (!target) return;
    if (scrollToLine(scrollRefA, target.line)) setPendingJumpA(null);
  }, [pendingJumpA, methodsA, highlightCount, scrollToLine]);

  // 외부(코멘트 모아보기 탭)에서 온 점프 요청 → 해당 프로그램 로드 + 지정 줄로 이동.
  useEffect(() => {
    if (!navRequest) return;
    handleSelectProgram(navRequest.serviceId, { line: navRequest.line, codeKind: navRequest.codeKind });
    // nonce 가 바뀔 때만(=새 요청) 실행. handleSelectProgram 은 매 렌더 재생성되므로 deps 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navRequest?.nonce]);

  // 지정 줄 점프: 코드 로딩·하이라이트가 끝나면 해당 코드(pb/pb5) 패널에서 1회 스크롤.
  useEffect(() => {
    if (!navPending) return;
    const ref = navPending.codeKind === 'pb' ? scrollRefA : scrollRefB;
    if (scrollToLine(ref, navPending.line)) setNavPending(null);
  }, [navPending, highlightCount, scrollToLine]);

  const toggleFold = useCallback((side: 'A' | 'B', startLine: number) => {
    const setter = side === 'A' ? setFoldedA : setFoldedB;
    setter(prev => {
      const next = new Set(prev);
      if (next.has(startLine)) next.delete(startLine);
      else next.add(startLine);
      return next;
    });
  }, []);

  // ── IDE식 코드 검색: 매치로 이동(접힌 메소드는 펼친 뒤 스크롤) ──
  const unfoldContaining = useCallback((side: 'A' | 'B', line: number) => {
    const methods = side === 'A' ? methodsA : methodsB;
    const setter = side === 'A' ? setFoldedA : setFoldedB;
    setter(prev => {
      let changed = false;
      const next = new Set(prev);
      for (const m of methods) {
        if (next.has(m.line) && line > m.line && line <= m.endLine) { next.delete(m.line); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [methodsA, methodsB]);

  const goToMatch = useCallback((side: 'A' | 'B', match: { line: number }) => {
    unfoldContaining(side, match.line);
    const ref = side === 'A' ? scrollRefA : scrollRefB;
    // 펼침(setState) 반영 후 스크롤하도록 다음 프레임에 실행
    requestAnimationFrame(() => scrollToLine(ref, match.line));
  }, [unfoldContaining, scrollToLine]);

  const stepSearch = useCallback((side: 'A' | 'B', dir: 1 | -1) => {
    const matches = side === 'A' ? matchesA : matchesB;
    if (matches.length === 0) return;
    const cur = side === 'A' ? matchIdxA : matchIdxB;
    const nextIdx = (cur + dir + matches.length) % matches.length;
    (side === 'A' ? setMatchIdxA : setMatchIdxB)(nextIdx);
    goToMatch(side, matches[nextIdx]);
  }, [matchesA, matchesB, matchIdxA, matchIdxB, goToMatch]);

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
    requestAnimationFrame(() => searchInputRefA.current?.focus());
  }, []);
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQueryA('');
    setSearchQueryB('');
  }, []);

  // PB 검색어/옵션 변경 시: 인덱스 초기화 + 첫 매치로 이동
  useEffect(() => {
    setMatchIdxA(0);
    if (searchQueryA && matchesA.length) goToMatch('A', matchesA[0]);
    // matchesA 는 의도적으로 deps 제외(검색어/옵션이 바뀔 때만 첫 매치로 점프)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQueryA, searchCaseSensitive]);

  // PB5 검색어/옵션 변경 시
  useEffect(() => {
    setMatchIdxB(0);
    if (searchQueryB && matchesB.length) goToMatch('B', matchesB[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQueryB, searchCaseSensitive]);

  // Ctrl/Cmd+F: 검색 열기·포커스
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  // Alt+S: 동기 스크롤 토글 (소스 비교 탭이 화면에 보일 때만)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 's' && e.key !== 'S')) return;
      const container = document.getElementById('main-split-container');
      if (!container || container.offsetParent === null) return; // 다른 탭이면 무시
      e.preventDefault();
      toggleSync();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleSync]);

  // PB5(Java) 매퍼 호출 줄 클릭 → 매퍼 XML SQL 을 끌어와 PB 인라인 SQL 과 대응 카드를 연다.
  // 매퍼 호출이 아니면 무동작(반환만). 실패는 토스트로 정직하게 안내(추측 금지).
  const openSqlPeek = useCallback(async (lineNum: number, clientX: number, clientY: number): Promise<void> => {
    const lineText = codeB.split('\n')[lineNum - 1] ?? '';
    const call = detectMapperCall(lineText, codeB);
    if (!call) return;

    try {
      const xml = await resolveXmlByName(call.mapperType);
      if (!xml) {
        showToast(`관련 매퍼 XML(${call.mapperType})을 찾지 못했습니다.`, 'error');
        return;
      }
      const stmt = findMapperStatement(xml.content, call.methodName);
      if (!stmt) {
        showToast(`매퍼에 ${call.methodName} 구문이 없습니다.`, 'error');
        return;
      }
      const pcName = pbSqlFileName(import.meta.env.VITE_PB_SQL_PREFIX ?? '', call.mapperType);
      let pbFound = false, pbSql: string | null = null, pbFullContent: string | null = null, pbStartLine = 1, candidateCount = 0;
      let pbFileName = pcName ?? '';
      if (pcName) {
        const pc = await resolvePcByNameCI(pcName);
        if (pc) {
          pbFound = true;
          pbFullContent = pc.content;
          pbFileName = pc.path.split('/').pop() ?? pcName;
          const m = matchEmbeddedSql(stmt, extractEmbeddedSql(pc.content));
          pbSql = m.match?.sqlText ?? null;
          pbStartLine = m.match?.startLine ?? 1;
          candidateCount = m.candidateCount;
        }
      }
      if (!pbFound) {
        showToast(pcName ? `PB 파일(${pcName})을 찾지 못했습니다.` : 'PB SQL 접두사(VITE_PB_SQL_PREFIX)가 설정되지 않았습니다.', 'error');
      }
      const xmlFileName = xml.path.split('/').pop() ?? `${call.mapperType}.xml`;
      const { x, y } = getSmartPosition(clientX, clientY);
      setSqlPeek({
        methodName: call.methodName,
        pbFileName, pbFound, pbSql, pbFullContent, pbStartLine,
        pb5FileName: xmlFileName, pb5Sql: stmt.sqlText, pb5FullContent: xml.content, pb5StartLine: stmt.startLine,
        candidateCount, x, y,
      });
    } catch (err) {
      showToast(`SQL을 불러오지 못했습니다: ${getErrorMessage(err)}`, 'error');
    }
  }, [codeB, showToast]);

  // 코드 클릭 핸들러 (접기 또는 점프)
  const handleCodeClick = useCallback((side: 'A' | 'B') => (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // 메시지 표식 클릭 체크
    if (target.classList.contains('ds-marker')) {
      const { x, y } = getSmartPosition(e.clientX, e.clientY);
      const threadId = parseInt(target.getAttribute('data-thread-id') || '0', 10);
      if (threadId && activePresetKey) {
        discussionService.getMessages(activePresetKey, threadId).then(msgs => {
          const thread = threads.find(t => t.id === threadId);
          if (thread) {
            // 첫 글 포함 모든 메시지를 id 순(작성순)으로. 가장 오래된 글이 본문(첫 글) — 모두 실제 메시지라 리액션 가능.
            const ordered = [...msgs].sort((a, b) => a.id - b.id);
            setActiveThread({ thread, messages: ordered, x, y });
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

    // Shift + 클릭 시 새 댓글 작성 (양쪽 코드 모두 지원, code_kind는 클릭한 쪽으로 결정)
    if (e.shiftKey) {
      const { x, y } = getSmartPosition(e.clientX, e.clientY);
      setIsCommentInputOpen({
        line: lineNum,
        codeKind: side === 'A' ? 'pb' : 'pb5',
        x, y
      });
    } else if (method) {
      if (e.altKey) {
        // 반대편에서 대응되는 메소드를 찾아 점프. 실패하면 토스트로 안내한다.
        const match = side === 'A'
          ? methodMatches.find(m => m.pbLine === lineNum)
          : methodMatches.find(m => m.pb5Line === lineNum);
        const targetRef = side === 'A' ? scrollRefB : scrollRefA;
        const targetLine = side === 'A' ? match?.pb5Line : match?.pbLine;
        const otherLabel = side === 'A' ? 'PB5' : 'PB';

        if (!match || targetLine === undefined) {
          showToast(`대응되는 ${otherLabel} 메소드를 찾을 수 없어 점프하지 못했습니다.`, 'error');
        } else if (!scrollToLine(targetRef, targetLine)) {
          showToast(`${otherLabel} 메소드 위치로 이동하지 못했습니다. (접혀있는지 확인하세요)`, 'error');
        }
      } else {
        toggleFold(side, lineNum);
      }
    } else if (!e.altKey && side === 'B' && langB === 'java') {
      // 비-메소드 줄 plain 클릭(PB5/Java): 매퍼 호출이면 SQL 대응 카드 시도
      void openSqlPeek(lineNum, e.clientX, e.clientY);
    }
  }, [methodsA, methodsB, methodMatches, scrollToLine, toggleFold, threads, activePresetKey, showToast, langB, openSqlPeek]);

  const foldAll = (side: 'A' | 'B', fold: boolean) => {
    const regions = side === 'A' ? foldRegionsA : foldRegionsB;
    const setter = side === 'A' ? setFoldedA : setFoldedB;
    if (fold) {
      setter(new Set(regions.map(m => m.line)));
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
      const fetched = await discussionService.getThreads(activePresetKey);
      setThreads(fetched);
    } catch (err) {
      console.error('Failed to fetch threads:', err);
    }
  }, [activePresetKey]);

  // 스레드 id 로 메시지를 불러와 (x,y) 위치에 스레드 팝오버를 연다. 단일 마커/선택 팝오버 공유.
  const openThreadById = useCallback((id: number, x: number, y: number) => {
    const thread = threads.find((t) => t.id === id);
    if (!thread || !activePresetKey) return;
    discussionService.getMessages(activePresetKey, id).then((msgs) => {
      const ordered = [...msgs].sort((a, b) => a.id - b.id);
      setActiveThread({ thread, messages: ordered, x, y });
    });
  }, [threads, activePresetKey]);

  // 본인(현재 작성자 측 activePlatform)과 같은 측이 쓴 글에는 리액션 불가 — 상대 측 글에만 리액션한다.
  const isOwnSide = (writerRole?: string) => activePlatform.toLowerCase() === (writerRole ?? '').toLowerCase();

  // 메시지(댓글) 리액션 토글 — 낙관적 업데이트(실패 시 롤백). refreshThreads 로 마커/스레드 마지막 리액션 갱신.
  const handleMessageReaction = async (messageId: number, key: ThreadReaction) => {
    if (!activeThread || !activePresetKey) return;
    const msg = activeThread.messages.find((m) => m.id === messageId);
    if (msg && isOwnSide(msg.writer_role)) return; // 본인 측 글은 리액션 불가
    const next = msg?.reaction === key ? null : key;
    setActiveThread((prev) => (prev ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, reaction: next } : m)) } : prev));
    try {
      await discussionService.updateReaction(activePresetKey, activeThread.thread.id, messageId, next);
      refreshThreads();
    } catch (err) {
      setActiveThread((prev) => (prev ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, reaction: msg?.reaction ?? null } : m)) } : prev));
      showToast(`리액션 변경 실패: ${getErrorMessage(err)}`, 'error');
    }
  };

  const handleAddComment = async (content: string) => {
    if (!isCommentInputOpen || !content.trim() || !activePresetKey) return;
    if (!writerName.trim()) {
      showToast('작성자 이름을 먼저 입력해주세요.', 'error');
      return;
    }
    // 새 스레드(처음 여는 댓글)는 의견 유형 선택을 강제한다 (답글은 유형 없음).
    const isNewThread = !isCommentInputOpen.threadId;
    if (isNewThread && !draftOpinionType) {
      showToast('의견 유형을 먼저 선택해주세요.', 'error');
      return;
    }
    if (isSubmittingComment) return; // 중복 제출 방지 (오류 방지)
    setIsSubmittingComment(true);
    try {
      await discussionService.saveComment(
        activePresetKey,
        isCommentInputOpen.line,
        content,
        activePlatform.toLowerCase(),
        writerName.trim(),
        isCommentInputOpen.codeKind,
        isNewThread ? (draftOpinionType ?? undefined) : undefined,
        isCommentInputOpen.threadId,
      );
      setIsCommentInputOpen(null);
      setDraftOpinionType(null);
      refreshThreads();
      if (activeThread && activePresetKey) {
        const msgs = await discussionService.getMessages(activePresetKey, activeThread.thread.id);
        setActiveThread({
          ...activeThread,
          messages: [...msgs].sort((a, b) => a.id - b.id),
        });
      }
      showToast('메시지를 등록했습니다.', 'success');
    } catch (err) {
      showToast(`등록 실패: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // CLOSE THREAD → 확인 모달을 연다. (오류 방지: 되돌릴 수 없는 작업은 확인 절차)
  const requestCloseThread = () => {
    if (!activeThread || !activePresetKey) return;
    setIsCloseConfirmOpen(true);
  };

  const confirmCloseThread = async () => {
    if (!activeThread || !activePresetKey) return;
    try {
      await discussionService.closeThread(activePresetKey, activeThread.thread.id);
      setIsCloseConfirmOpen(false);
      setActiveThread(null);
      refreshThreads();
      showToast('스레드를 종료했습니다.', 'success');
    } catch (err) {
      setIsCloseConfirmOpen(false);
      showToast(`스레드 종료 실패: ${getErrorMessage(err)}`, 'error');
    }
  };

  // 메시지 내의 코드 블록(``` ```)을 처리하는 함수
  const renderMessageContent = (content: string, isRoot: boolean) => {
    const blockParts = content.split(/(```[\s\S]*?```)/g);
    return blockParts.map((blockPart, bIdx) => {
      if (blockPart.startsWith('```') && blockPart.endsWith('```')) {
        const code = blockPart.slice(3, -3);
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

  // ESC 키로 열려있는 오버레이를 닫는다. (UX 체크리스트: 모달 ESC 닫기 일관성)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isCloseConfirmOpen) setIsCloseConfirmOpen(false);
      else if (isCommentInputOpen) setIsCommentInputOpen(null);
      else if (activeThread) setActiveThread(null);
      else if (markerPick) setMarkerPick(null);
      else if (sqlPanel) setSqlPanel(null);
      else if (sqlPanelPb) setSqlPanelPb(null);
      else if (sqlPeek) setSqlPeek(null);
      else if (isChecklistOpen) setIsChecklistOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCloseConfirmOpen, isCommentInputOpen, activeThread, markerPick, sqlPanel, sqlPanelPb, sqlPeek, isChecklistOpen]);

  // 클라이언트 마운트 시 localStorage 데이터 로드 (Hydration Mismatch 방지)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    setLinks(getSavedLinks());
    setCodeA(localStorage.getItem('sourceA') ?? '');
    setCodeB(localStorage.getItem('sourceB') ?? '');
    setLangA((localStorage.getItem('langA') as CodeLang) ?? 'c');
    setLangB((localStorage.getItem('langB') as CodeLang) ?? 'java');
    setActivePlatform((localStorage.getItem('activePlatform') as 'PB' | 'PB5') ?? 'PB');
    setFontSize(parseInt(localStorage.getItem('codeFontSize') ?? '15', 10));
    setActivePresetKey(localStorage.getItem('activePresetKey') ?? '');
    setWriterName(localStorage.getItem('writerName') ?? '');

    // 비교 소스 카탈로그를 DB(comparsion_services)에서 로드
    discussionService.getServices()
      .then(setServices)
      .catch(err => console.error('Failed to load services:', err));
  }, []);

  // 서비스 카탈로그 로드 후, 이미 선택된 service_id가 있으면 파일명/대분류를 복원
  useEffect(() => {
    if (services.length === 0 || !activePresetKey) return;
    const rows = services.filter(s => s.service_id === activePresetKey);
    if (rows.length === 0) return;
    const pbRow = rows.find(r => r.code_kind === 'pb');
    const pb5Row = rows.find(r => r.code_kind === 'pb5');
    // 대분류가 '서비스'면 표시 파일명도 동일 규칙으로 도출해 일관성을 유지한다.
    const bigCategory = rows[0].big_category;
    setFileNameA(resolveProgramFileName('pb', bigCategory, pbRow?.file_name) ?? '');
    setFileNameB(resolveProgramFileName('pb5', bigCategory, pb5Row?.file_name) ?? '');
    setSelectedBig(prev => prev || (rows[0].big_category ?? ''));
    setSelectedMiddle(prev => prev || (rows[0].middle_category ?? ''));
  }, [services, activePresetKey]);

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

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('codeFontSize', fontSize.toString());
  }, [fontSize, isMounted]);

  // 복원 시 xml/java를 올바로 하이라이트하도록 선택된 언어도 저장한다.
  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('langA', langA);
    localStorage.setItem('langB', langB);
  }, [langA, langB, isMounted]);

  useEffect(() => {
    if (!isMounted) return;
    localStorage.setItem('writerName', writerName);
  }, [writerName, isMounted]);

  // 주어진 소스 내용을 좌/우 코드뷰에 로드한다. (프로그램명 선택 시 자동 호출)
  // diag: 해석(매칭) 단계에서 만든 측별 실패 사유. 빈 소스인 측은 이 사유를 그대로 노출한다.
  const loadSources = useCallback(async (
    sourceA: string,
    sourceB: string,
    diag: { a: string | null; b: string | null } = { a: null, b: null },
  ) => {
    setIsLoadingA(true);
    setIsLoadingB(true);
    // 매칭 실패 사유를 먼저 깔아 둔다. 로딩에 성공한 측은 아래에서 null 로 덮인다.
    setErrorA(diag.a);
    setErrorB(diag.b);
    setCodeA('');
    setCodeB('');

    try {
      // 내용이 없는(매칭 실패) 측은 fetch 하지 않고 사유 메시지를 유지한다.
      const [resA, resB] = await Promise.allSettled([
        sourceA ? fetchCodeFromSource({ link: sourceA, side: 'A' }) : Promise.resolve(''),
        sourceB ? fetchCodeFromSource({ link: sourceB, side: 'B' }) : Promise.resolve(''),
      ]);

      let nextA = '';
      let nextB = '';

      if (resA.status === 'fulfilled') {
        nextA = resA.value;
        setCodeA(nextA);
        if (nextA) setErrorA(null); // 로딩 성공 → 해석 단계 경고 제거
      } else {
        setErrorA(getErrorMessage(resA.reason));
      }

      if (resB.status === 'fulfilled') {
        nextB = resB.value;
        setCodeB(nextB);
        if (nextB) setErrorB(null);
      } else {
        setErrorB(getErrorMessage(resB.reason));
      }

      saveLocally(nextA, nextB);
    } finally {
      setIsLoadingA(false);
      setIsLoadingB(false);
      refreshThreads(); // 코드 로딩 후 즉시 마커 갱신
    }
  }, [saveLocally, refreshThreads]);

  const handleHighlight = useCallback(() => setHighlightCount(prev => prev + 1), []);

  // HTML 소스인지 판별 (단순 확장자 체크 또는 내용 체크)
  const renderCodeContent = (
    code: string, 
    lang: string, 
    isLoading: boolean, 
    error: string | null, 
    side: 'A' | 'B',
    scrollRef: React.RefObject<HTMLDivElement | null>,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => void,
    onWheel: (e: React.WheelEvent<HTMLDivElement>) => void
  ) => {
    if (isLoading) return <div className="text-gray-400 font-mono text-xs p-4 animate-pulse">소스 코드를 불러오는 중...</div>;
    if (error) return <div className="font-mono text-xs p-4 italic text-red-500 font-bold">불러오기 실패: {error}</div>;
    if (!code) return <div className="font-mono text-xs p-4 italic text-gray-400">소스 코드를 불러오세요.</div>;

    // 만약 소스가 이미 완성된 HTML 형태(PB 레거시 특징)라면 Shiki를 거치지 않고 직접 렌더링.
    // 단, xml 소스(<?xml ...>)는 Shiki(xml)로 하이라이트해야 하므로 이 판정에서 제외한다.
    const isAlreadyHtml = lang !== 'xml' && code.trim().startsWith('<') && (code.includes('</') || code.includes('/>'));
    
    if (isAlreadyHtml) {
      return (
        <div 
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={onWheel}
          style={{ fontSize: `${fontSize}px`, overflow: 'auto', height: '100%', minHeight: 0 }}
        >
          <PBCode srcListTab ={code}/>
        </div>
      );
    }

    return (
      <CodeBlock 
        ref={scrollRef}
        code={code} 
        lang={lang} 
        onHighlight={handleHighlight} 
        fontSize={fontSize}
        methods={side === 'A' ? foldRegionsA : foldRegionsB}
        foldedLines={side === 'A' ? foldedA : foldedB}
        threads={side === 'A' ? threadsA : threadsB}
        searchQuery={side === 'A' ? searchQueryA : searchQueryB}
        searchCaseSensitive={searchCaseSensitive}
        activeMatch={side === 'A' ? activeMatchA : activeMatchB}
        mapperCallLines={side === 'B' ? mapperCallLinesB : undefined}
        onFoldToggle={(line) => toggleFold(side, line)}
        onScroll={onScroll}
        onWheel={onWheel}
        onMarkerClick={(lineThreads, x, y) => {
          if (lineThreads.length === 1) { openThreadById(lineThreads[0].id, x - 160, y - 100); return; }
          setMarkerPick({ threads: lineThreads, x, y });
        }}
        onLineShiftClick={(line, x, y) => {
          setIsCommentInputOpen({ line, codeKind: side === 'A' ? 'pb' : 'pb5', x: x - 160, y: y - 100 });
        }}
      />
    );
  };

  return (
    <div className="code-compare p-3 w-full h-full bg-slate-100 flex flex-col gap-1.5 overflow-hidden relative font-sans">
      {/* 헤더 영역 최적화 */}
      <header className="border-b bg-white -mx-3 -mt-3 px-4 py-0.5 shadow-sm flex-shrink-0 flex justify-between items-center">
        <div>
          <h1 className="text-sm font-black text-slate-800 m-0 tracking-tighter">PB-5세대 비교검증</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">작성자 소속</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-inner">
              <button
                onClick={() => setActivePlatform('PB')}
                aria-pressed={activePlatform === 'PB'}
                className={`px-5 py-0.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-400 hover:text-indigo-500'}`}
              >
                PB
              </button>
              <button
                onClick={() => setActivePlatform('PB5')}
                aria-pressed={activePlatform === 'PB5'}
                className={`px-5 py-0.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB5' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-slate-400 hover:text-emerald-500'}`}
              >
                PB5
              </button>
            </div>
          </div>

          {/* 작성자 이름 입력 (빈 값 불가) */}
          <div className={`flex items-center gap-2 bg-slate-100 px-3 py-0.5 rounded-xl border shadow-inner ${writerName.trim() ? 'border-slate-200' : 'border-red-300'}`}>
            <label htmlFor="writer-name-input" className="text-[11px] font-black text-slate-500 uppercase">작성자</label>
            <input
              id="writer-name-input"
              type="text"
              aria-label="작성자 이름"
              value={writerName}
              onChange={(e) => setWriterName(e.target.value)}
              placeholder="이름 입력"
              className="w-24 bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0 placeholder:text-red-300 placeholder:font-normal"
            />
          </div>

          {/* 폰트 조절 UI */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-0.5 rounded-xl border border-slate-200 shadow-inner">
            <label htmlFor="font-size-input" className="text-[11px] font-black text-slate-500 uppercase">글자 크기</label>
            <input
              id="font-size-input"
              type="number"
              min="14"
              aria-label="글자 크기(px)"
              value={fontSize}
              onChange={(e) => setFontSize(Math.max(14, parseInt(e.target.value) || 14))}
              className="w-12 bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0 text-center"
            />
            <span className="text-[11px] font-bold text-slate-400">px</span>
          </div>
        </div>
      </header>

      {/* 비교 세트 선택 */}
      <div className="px-4 py-2.5 border rounded-xl bg-indigo-700 flex flex-col gap-3 shadow-lg flex-shrink-0 text-white">
        <div className="flex items-center gap-3">
          <CategorySelector
            services={services}
            selectedBig={selectedBig}
            selectedMiddle={selectedMiddle}
            selectedProgram={activePresetKey}
            onSelectBig={handleSelectBig}
            onSelectMiddle={handleSelectMiddle}
            onSelectProgram={handleSelectProgram}
            favorites={favorites}
            onToggleFavorite={onToggleFavorite}
          />
          <button
            type="button"
            onClick={() => setShowFavPicker((v) => !v)}
            aria-pressed={showFavPicker}
            aria-label="즐겨찾기 빠른 선택 열기/닫기"
            title="즐겨찾기한 프로그램 빠르게 열기"
            className={`px-4 py-2 rounded font-bold text-sm shadow-sm transition-all flex items-center gap-2 whitespace-nowrap ${
              showFavPicker ? 'bg-amber-400 text-amber-900 ring-2 ring-amber-200' : 'bg-indigo-500 text-white hover:bg-indigo-400'
            }`}
          >
            ★ 즐겨찾기{favorites && favorites.length > 0 ? ` (${favorites.length})` : ''}
          </button>
          <button
            onClick={() => (isSearchOpen ? closeSearch() : openSearch())}
            aria-pressed={isSearchOpen}
            aria-label="코드 내용 검색"
            title="코드 내용 검색 (Ctrl+F)"
            className={`px-4 py-2 rounded font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${
              isSearchOpen ? 'bg-amber-400 text-amber-900 ring-2 ring-amber-200' : 'bg-indigo-500 text-white hover:bg-indigo-400'
            }`}
          >
            🔍 검색
          </button>
          <button
            onClick={() => setIsChecklistOpen((v) => !v)}
            aria-pressed={isChecklistOpen}
            aria-label="체크리스트 열기/닫기"
            title="체크리스트 관리"
            className={`px-4 py-2 rounded font-bold text-sm shadow-sm transition-all flex items-center gap-2 ${
              isChecklistOpen ? 'bg-amber-400 text-amber-900 ring-2 ring-amber-200' : 'bg-indigo-500 text-white hover:bg-indigo-400'
            }`}
          >
            📋 체크리스트
          </button>
        </div>
      </div>

      {/* ★ 즐겨찾기 빠른 선택 — 켜면 즐겨찾기한 프로그램을 칩으로 나열, 클릭 시 좌우 비교 로드 */}
      {showFavPicker && (
        <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0 px-1 max-h-24 overflow-y-auto">
          <span className="text-[11px] font-black text-slate-500 mr-0.5">★ 즐겨찾기</span>
          {!favorites || favorites.length === 0 ? (
            <span className="text-[12px] text-slate-400 font-bold">즐겨찾기한 프로그램이 없습니다. 프로그램 선택 후 옆 ☆로 추가하세요.</span>
          ) : (
            favorites.map((sid) => {
              const rows = services.filter((s) => s.service_id === sid);
              const pbRow = rows.find((r) => r.code_kind === 'pb');
              const base = pbRow ?? rows[0];
              const pbSourceName = resolveProgramFileName('pb', base?.big_category, pbRow?.file_name);
              const main = pbSourceName ? `${pbSourceName} / ${sid}` : sid;
              const sub = [base?.big_category, base?.middle_category].filter(Boolean).join(' · ');
              const active = activePresetKey === sid;
              return (
                <button
                  key={sid}
                  type="button"
                  onClick={() => pickFavorite(sid)}
                  aria-pressed={active}
                  title={sub ? `${main} · ${sub}` : main}
                  className={`px-2.5 py-1 rounded-lg text-[12px] font-bold border transition-all ${active ? 'bg-amber-400 text-amber-900 border-amber-300 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'}`}
                >
                  <span className="font-mono">{main}</span>
                  {sub && <span className="ml-1.5 text-[11px] opacity-60 font-sans">{sub}</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* IDE식 코드 내용 검색 — PB/PB5는 네이밍 규칙이 달라 좌·우 각각 검색 */}
      {isSearchOpen && (
        <div className="flex items-stretch gap-2 flex-shrink-0">
          {/* PB(왼쪽) 검색 */}
          <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="text-[11px] font-black text-indigo-600 shrink-0">PB</span>
            <input
              ref={searchInputRefA}
              value={searchQueryA}
              onChange={(e) => setSearchQueryA(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); stepSearch('A', e.shiftKey ? -1 : 1); }
                else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
              }}
              placeholder="PB 코드 검색…"
              className="flex-1 min-w-0 bg-transparent border-none text-sm text-slate-800 focus:ring-0 p-0 placeholder:text-slate-400"
            />
            <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
              {matchesA.length ? `${matchIdxA + 1}/${matchesA.length}` : (searchQueryA ? '0' : '')}
            </span>
            <button onClick={() => stepSearch('A', -1)} disabled={!matchesA.length} aria-label="PB 이전 매치" className="px-1.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">◀</button>
            <button onClick={() => stepSearch('A', 1)} disabled={!matchesA.length} aria-label="PB 다음 매치" className="px-1.5 text-slate-500 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed">▶</button>
          </div>

          {/* PB5(오른쪽) 검색 */}
          <div className="flex items-center gap-2 flex-1 min-w-0 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
            <span className="text-[11px] font-black text-emerald-600 shrink-0">PB5</span>
            <input
              ref={searchInputRefB}
              value={searchQueryB}
              onChange={(e) => setSearchQueryB(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); stepSearch('B', e.shiftKey ? -1 : 1); }
                else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
              }}
              placeholder="PB5 코드 검색…"
              className="flex-1 min-w-0 bg-transparent border-none text-sm text-slate-800 focus:ring-0 p-0 placeholder:text-slate-400"
            />
            <span className="text-[11px] font-mono text-slate-400 shrink-0 tabular-nums">
              {matchesB.length ? `${matchIdxB + 1}/${matchesB.length}` : (searchQueryB ? '0' : '')}
            </span>
            <button onClick={() => stepSearch('B', -1)} disabled={!matchesB.length} aria-label="PB5 이전 매치" className="px-1.5 text-slate-500 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed">◀</button>
            <button onClick={() => stepSearch('B', 1)} disabled={!matchesB.length} aria-label="PB5 다음 매치" className="px-1.5 text-slate-500 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed">▶</button>
          </div>

          {/* 공통: 대소문자 구분 / 닫기 */}
          <div className="flex items-center gap-1 px-2 py-2 bg-white border border-slate-200 rounded-xl shadow-sm shrink-0">
            <button
              onClick={() => setSearchCaseSensitive((v) => !v)}
              aria-pressed={searchCaseSensitive}
              title="대소문자 구분"
              className={`w-8 h-7 rounded text-[12px] font-black transition-colors ${searchCaseSensitive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >Aa</button>
            <button onClick={closeSearch} aria-label="검색 닫기" className="w-8 h-7 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-lg leading-none">×</button>
          </div>
        </div>
      )}

      {/* 메인 비교 영역 간격 조정 */}
      <div 
        id="main-split-container"
        className={`flex flex-1 min-h-0 relative ${isResizing ? 'select-none' : ''}`}
      >
        {/* 왼쪽 패널 (PB) */}
        <div
          style={{ width: `${splitOffset}%` }}
          className="flex flex-col gap-2 min-h-0 pr-1"
        >
          <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1 min-h-0 relative group">
            <h3 className="p-2 text-xs flex justify-between items-center bg-blue-600 text-white m-0 sticky top-0 z-20 flex-shrink-0">
              <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold whitespace-nowrap">PB 코드</span>
                  <button
                    onClick={() => toggleFoldAll('A')}
                    className="px-2 py-0.5 bg-blue-700 hover:bg-blue-800 rounded border border-blue-400/30 text-[11px] font-bold transition-colors"
                  >
                    {foldedA.size > 0 ? '전체 펴기' : '전체 접기'}
                  </button>
                </div>
                {fileNameA && <span className="text-[11px] font-mono text-blue-100 truncate" title={fileNameA}>📄 {fileNameA}</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[15px] bg-white/20 px-2 py-0.5 rounded font-mono">
                  L: {codeA ? codeA.split('\n').length : 0} / M: {methodsA.length}
                </span>
                <ShortcutsHelp open={shortcutsOpen} onToggle={() => setShortcutsOpen((o) => !o)} />
              </div>
            </h3>
            <div 
              onMouseEnter={() => {
                activeScrollSideRef.current = 'A';
                setHoveredSide('A');
              }}
              onMouseLeave={() => {
                if (activeScrollSideRef.current === 'A') activeScrollSideRef.current = null;
                setHoveredSide(null);
              }}
              onClick={handleCodeClick('A')}
              className="flex-1 text-[15px] font-mono min-h-0 w-full border-r border-slate-200 overflow-hidden"
            >
              <div className="w-full h-full min-h-0 text-slate-900">
                {renderCodeContent(codeA, langA, isLoadingA, errorA, 'A', scrollRefA, handleScroll('A'), handleWheel('A'))}
              </div>
            </div>
          </div>
          {errorA && (
            <div className="bg-red-50 text-red-600 text-[11px] p-2 border-t border-red-100 font-bold flex-shrink-0">
              ⚠️ {errorA}
            </div>
          )}
        </div>

        {/* 드래그 핸들 (Splitter) */}
        <div
          onMouseDown={() => setIsResizing(true)}
          role="separator"
          aria-orientation="vertical"
          aria-label="좌우 패널 너비 조절"
          className={`group relative w-3 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-all ${isResizing ? 'bg-indigo-400/20' : 'hover:bg-indigo-200/30 bg-transparent'}`}
        >
          <div className={`w-1 h-16 rounded-full transition-all ${isResizing ? 'bg-indigo-600 scale-x-150' : 'bg-slate-300 group-hover:bg-indigo-400'}`} />
          {/* 동기 스크롤 토글 — 두 패널 사이(스크롤 정중앙)에 항상 보이는 체인 버튼. 단축키 Alt+S. */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); toggleSync(); }}
            aria-pressed={isSyncEnabled}
            aria-label={isSyncEnabled ? '동기 스크롤 끄기 (Alt+S)' : '동기 스크롤 켜기 (Alt+S)'}
            title={isSyncEnabled ? '동기 스크롤 켜짐 · 클릭 또는 Alt+S로 끄기' : '동기 스크롤 꺼짐 · 클릭 또는 Alt+S로 켜기'}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full grid place-items-center text-[15px] shadow-md border cursor-pointer transition-all before:absolute before:-inset-1.5 before:content-[''] ${
              isSyncEnabled
                ? 'bg-amber-400 text-amber-900 border-amber-300 ring-2 ring-amber-200'
                : 'bg-white text-slate-400 border-slate-300 hover:text-indigo-500 hover:border-indigo-300'
            }`}
          >🔗</button>
          {/* 양쪽 전체보기 패널 동시 열림 시: 동기스크롤 토글 바로 아래(여백 두고)에서 한꺼번에 닫기.
              분할선 기준 절대배치라 화면/헤더/splitOffset 무관하게 체인과 일정 간격. z-130 으로 패널 위. */}
          {sqlPanel && sqlPanelPb && (
            <button
              onClick={() => { setSqlPanel(null); setSqlPanelPb(null); }}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="양쪽 패널 닫기"
              title="양쪽 전체보기 패널 닫기"
              className="absolute top-[calc(50%+72px)] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[130] w-9 h-9 rounded-full bg-white text-slate-600 border border-slate-300 shadow-md hover:bg-slate-100 hover:text-slate-800 flex items-center justify-center text-lg leading-none"
            >&times;</button>
          )}
        </div>

        {/* 오른쪽 패널 (PB5) */}
        <div 
          style={{ width: `${100 - splitOffset}%` }}
          className="flex flex-col gap-2 min-h-0 pl-1"
        >
          <div className="flex flex-col border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm flex-1 min-h-0 relative group">
            <h3 className="p-2 text-xs flex justify-between items-center bg-green-600 text-white m-0 sticky top-0 z-20 flex-shrink-0">
              <div className="flex flex-col gap-1 min-w-0 flex-1 mr-4">
                <div className="flex items-center gap-2">
                  <span className="font-bold whitespace-nowrap">PB5 코드</span>
                  <button
                    onClick={() => toggleFoldAll('B')}
                    className="px-2 py-0.5 bg-green-700 hover:bg-green-800 rounded border border-green-400/30 text-[11px] font-bold transition-colors"
                  >
                    {foldedB.size > 0 ? '전체 펴기' : '전체 접기'}
                  </button>
                </div>
                {fileNameB && <span className="text-[11px] font-mono text-green-100 truncate" title={fileNameB}>📄 {fileNameB}</span>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-[15px] bg-white/20 px-2 py-0.5 rounded font-mono">
                  L: {codeB ? codeB.split('\n').length : 0} / M: {methodsB.length}
                </span>
                <ShortcutsHelp open={shortcutsOpen} onToggle={() => setShortcutsOpen((o) => !o)} includeSql />
              </div>
            </h3>
            <div 
              onMouseEnter={() => {
                activeScrollSideRef.current = 'B';
                setHoveredSide('B');
              }}
              onMouseLeave={() => {
                if (activeScrollSideRef.current === 'B') activeScrollSideRef.current = null;
                setHoveredSide(null);
              }}
              onClick={handleCodeClick('B')}
              className="flex-1 text-[15px] font-mono min-h-0 w-full overflow-hidden"
            >
              <div className="w-full h-full min-h-0 text-slate-900">
                {renderCodeContent(codeB, langB, isLoadingB, errorB, 'B', scrollRefB, handleScroll('B'), handleWheel('B'))}
              </div>
            </div>
          </div>
          {errorB && (
            <div className="bg-red-50 text-red-600 text-[11px] p-2 border-t border-red-100 font-bold flex-shrink-0">
              ⚠️ {errorB}
            </div>
          )}
        </div>
      </div>

      {/* 다건 마커 선택 팝오버 — 한 줄에 스레드 2개 이상일 때 골라서 연다. */}
      {markerPick && (
        <div className="fixed inset-0 z-[100]" onClick={() => setMarkerPick(null)}>
          <div
            className="absolute"
            style={{ left: markerPick.x - 160, top: markerPick.y - 100 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white border border-gray-200 rounded-2xl w-[360px] shadow-2xl text-gray-800 font-sans overflow-hidden flex flex-col border-t-4 border-t-indigo-500">
              <div className="bg-white px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                <span className="font-black text-[14px] text-gray-900">이 줄의 의견 {markerPick.threads.length}개</span>
                <button onClick={() => setMarkerPick(null)} aria-label="닫기" className="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-slate-400 hover:text-slate-600 text-lg">&times;</button>
              </div>
              <div className="p-2 max-h-[50vh] overflow-y-auto custom-scrollbar">
                {sortThreadsForBoard(markerPick.threads).map((t) => {
                  const op = getOpinionMeta(t.opinion_type);
                  const dot = t.status === 'RESOLVED' ? 'bg-slate-300' : t.status === 'CHECK_PB' ? 'bg-indigo-500' : 'bg-emerald-500';
                  return (
                    <button
                      key={t.id}
                      onClick={() => { const { x, y } = markerPick; setMarkerPick(null); openThreadById(t.id, x - 160, y - 100); }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex items-start gap-2 transition-colors"
                    >
                      <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 mb-0.5">
                          {op && <span className={`px-1.5 py-0.5 rounded text-[11px] font-black ${op.badgeClass}`}>{op.label}</span>}
                          <span className="text-[11px] text-slate-400 font-bold">#{t.id}</span>
                        </span>
                        <span className="block text-[13px] text-slate-700 truncate">{t.content || '(내용 없음)'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <div className="flex items-center gap-2">
                    <span className="font-black text-[16px] text-gray-900 tracking-tight">스레드</span>
                    {(() => {
                      const op = getOpinionMeta(activeThread.thread.opinion_type);
                      return op ? <span className={`px-2 py-0.5 rounded text-[11px] font-black ${op.badgeClass}`}>{op.label}</span> : null;
                    })()}
                    {(() => {
                      const r = getReactionMeta(activeThread.thread.last_reaction);
                      return r ? <span className={`px-2 py-0.5 rounded text-[11px] font-black ${r.activeClass}`} title="마지막 리액션">{r.label}</span> : null;
                    })()}
                  </div>
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">{activeThread.thread.line_number}번 줄 토론</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={requestCloseThread}
                    aria-label="스레드 종료"
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-black rounded-lg transition-all border border-red-200"
                  >
                    스레드 종료
                  </button>
                  <button onClick={() => setActiveThread(null)} aria-label="스레드 창 닫기" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors text-xl">&times;</button>
                </div>
              </div>
              <div className="p-6 space-y-6 max-h-[55vh] overflow-y-auto custom-scrollbar bg-white text-left">
                {
                activeThread.messages.map((msg, index) => {
                  const isRoot = index === 0;
                  return (
                    <div key={msg.id} className={`flex gap-4 items-start group ${isRoot ? 'pb-6 border-b border-slate-100' : ''}`}>
                      <div className={`${isRoot ? 'w-10 h-10 text-[14px]' : 'w-9 h-9 text-[12px]'} rounded-lg flex-shrink-0 flex items-center justify-center font-black text-white shadow-sm transition-transform group-hover:scale-105 ${msg.writer_role === 'pb' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                        {(msg.writer_name || msg.writer_role || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`font-black ${isRoot ? 'text-[16px]' : 'text-[14px]'} text-slate-900`}>{msg.writer_name || msg.writer_role?.toUpperCase()}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-black uppercase ${msg.writer_role === 'pb' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{msg.writer_role?.toUpperCase()}</span>
                          <span className="text-[11px] text-slate-400 font-bold tracking-tight">{formatDateTime(msg.created_at)}</span>
                        </div>
                        <div className={`${isRoot ? 'text-[15px] text-slate-800' : 'text-[14px] text-slate-700'} leading-relaxed break-words`}>

                          {renderMessageContent(msg.content, isRoot)}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {REACTIONS.map((r) => {
                            const on = msg.reaction === r.key;
                            return (
                              <button
                                key={r.key}
                                onClick={() => handleMessageReaction(msg.id, r.key)}
                                disabled={isOwnSide(msg.writer_role)}
                                aria-pressed={on}
                                title={isOwnSide(msg.writer_role) ? '본인 측 글에는 리액션할 수 없습니다' : undefined}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all ${on ? r.activeClass : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'} disabled:opacity-40 disabled:cursor-not-allowed`}
                              >{r.label}</button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="p-4 bg-slate-50 border-t border-gray-100">
                <button 
                  onClick={() => setIsCommentInputOpen({ line: activeThread.thread.line_number, threadId: activeThread.thread.id, codeKind: activeThread.thread.code_kind, x: activeThread.x + 10, y: activeThread.y + 50 })}
                  className="w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-400 text-[14px] font-bold hover:border-indigo-300 hover:text-indigo-500 transition-all text-left px-4 shadow-sm flex items-center gap-2 group"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs group-hover:bg-indigo-100">+</span>
                  이 스레드에 답글 달기...
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comment Input Modal (Writing) */}
      {isCommentInputOpen && (
        <div className="fixed inset-0 z-[110]" onClick={() => { setIsCommentInputOpen(null); setDraftOpinionType(null); }}>
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
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[11px] font-black uppercase">새 메시지</span>
                  <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase ${isCommentInputOpen.codeKind === 'pb' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{isCommentInputOpen.codeKind.toUpperCase()}</span>
                  <span className="text-[14px] tracking-tight">{isCommentInputOpen.line}번 줄</span>
                </div>
              </h4>
              {!isCommentInputOpen.threadId && (
                <div className="mb-3">
                  <div className="text-[11px] font-black text-slate-500 mb-1.5">의견 유형 <span className="text-rose-500">*</span></div>
                  <div className="flex flex-wrap gap-1.5">
                    {OPINION_TYPES.map((t) => {
                      const on = draftOpinionType === t.code;
                      return (
                        <button
                          key={t.code}
                          type="button"
                          title={t.description}
                          onClick={() => setDraftOpinionType(t.code)}
                          className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition-all ${on ? `${t.badgeClass} border-current shadow-sm` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <textarea 
                ref={commentTextRef}
                autoFocus
                value={draftComment}
                onChange={(e) => setDraftComment(e.target.value)}
                className="w-full h-36 p-4 text-[15px] focus:outline-none focus:ring-4 resize-none mb-3 transition-all shadow-inner rounded-xl bg-slate-50 text-slate-800 border-slate-200 font-sans focus:ring-indigo-500/10 focus:border-indigo-500"
                placeholder="메시지를 입력하세요... (코드는 ``` 또는 ` ` 사용)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment(draftComment);
                  }
                }}
              />
              {draftComment.trim() && (
                <div className="mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl max-h-32 overflow-y-auto shadow-inner">
                  <div className="text-[11px] text-slate-400 font-black uppercase mb-1 tracking-widest">미리보기</div>
                  <div className="text-[13px] leading-relaxed break-words text-slate-600">
                    {renderMessageContent(draftComment, false)}
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center px-1">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-slate-400 font-bold italic leading-tight">Shift + Enter 줄바꿈</span>
                  <span className="text-[11px] text-indigo-400 font-bold italic leading-tight">``` 코드 블록 · ` 인라인 코드</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setIsCommentInputOpen(null); setDraftOpinionType(null); }} className="px-4 py-2 text-slate-400 text-[14px] font-black hover:text-slate-600 transition-all">취소</button>
                  <button
                    onClick={() => handleAddComment(draftComment)}
                    disabled={!draftComment.trim() || isSubmittingComment || (!isCommentInputOpen.threadId && !draftOpinionType)}
                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[14px] font-black rounded-xl shadow-lg shadow-indigo-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    {isSubmittingComment ? '전송 중...' : '전송'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 스레드 종료 확인 모달 (오류 방지: 되돌릴 수 없는 작업은 확인 절차) */}
      {isCloseConfirmOpen && (
        <div
          className="fixed inset-0 z-[130] bg-black/30 flex items-center justify-center p-4"
          onClick={() => setIsCloseConfirmOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-confirm-title"
            className="bg-white rounded-2xl w-[360px] shadow-2xl p-6 font-sans border-t-4 border-t-red-500"
            onClick={e => e.stopPropagation()}
          >
            <h4 id="close-confirm-title" className="text-slate-900 font-black text-[16px] mb-2">스레드를 종료할까요?</h4>
            <p className="text-slate-500 text-[13px] leading-relaxed mb-5">종료하면 더 이상 이 스레드에 메시지를 남길 수 없습니다.</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsCloseConfirmOpen(false)}
                className="px-4 py-2 text-slate-500 text-[14px] font-black hover:text-slate-700 transition-all"
              >
                취소
              </button>
              <button
                onClick={confirmCloseThread}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-[14px] font-black rounded-xl shadow-lg shadow-red-200 transition-all active:scale-95"
              >
                종료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 알림 (피드백/가시성: 모든 행동에 즉각 반응, 스크린리더 대응) */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[140] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold text-white ${
            toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-emerald-600' : 'bg-slate-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* SQL 대응 카드: PB 원본 EXEC SQL ↔ PB5 매퍼 SQL */}
      {sqlPeek && (
        <div className="fixed inset-0 z-[120]" onClick={() => setSqlPeek(null)}>
          <div className="absolute" style={{ left: sqlPeek.x, top: sqlPeek.y }} onClick={(e) => e.stopPropagation()}>
            <div className="bg-white border border-gray-200 rounded-2xl w-[560px] shadow-2xl text-gray-800 font-sans overflow-hidden flex flex-col border-t-4 border-t-amber-500">
              <div
                onMouseDown={(e) => handleMouseDown(e, 'sql')}
                className="bg-white px-5 py-3 border-b border-gray-100 flex justify-between items-center cursor-move select-none"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[11px] font-black uppercase">SQL 대응</span>
                  <span className="font-black text-[15px] text-gray-900 truncate">{sqlPeek.methodName}</span>
                  {sqlPeek.candidateCount > 1 && (
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[11px] font-black whitespace-nowrap">대응 후보 {sqlPeek.candidateCount}건</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (sqlPeek.pbFound && sqlPeek.pbFullContent) {
                        setSqlPanelPb({ fileName: sqlPeek.pbFileName, content: sqlPeek.pbFullContent, line: sqlPeek.pbStartLine });
                      }
                      setSqlPanel({ fileName: sqlPeek.pb5FileName, content: sqlPeek.pb5FullContent, line: sqlPeek.pb5StartLine });
                      setSqlPeek(null);
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-900 text-white rounded text-[11px] font-black transition-colors whitespace-nowrap"
                  >둘 다 보기</button>
                  <button onClick={() => setSqlPeek(null)} aria-label="SQL 대응 닫기" className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-slate-400 hover:text-slate-600 text-xl">&times;</button>
                </div>
              </div>
              <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
                <div>
                  <div className="text-[11px] font-black text-indigo-600 mb-1 flex items-center justify-between gap-2">
                    <span className="truncate">📄 PB 원본 · {sqlPeek.pbFileName || '(파일 없음)'}</span>
                    {sqlPeek.pbFound && sqlPeek.pbFullContent && (
                      <button
                        onClick={() => { setSqlPanelPb({ fileName: sqlPeek.pbFileName, content: sqlPeek.pbFullContent!, line: sqlPeek.pbStartLine }); setSqlPeek(null); }}
                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-black transition-colors whitespace-nowrap"
                      >전체 보기</button>
                    )}
                  </div>
                  {!sqlPeek.pbFound ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 font-bold italic">해당 파일명이 없습니다.</div>
                  ) : sqlPeek.pbSql ? (
                    <pre className="m-0 p-3 bg-[#1e1e1e] rounded-lg font-mono text-[12.5px] text-slate-200 overflow-x-auto whitespace-pre">{sqlPeek.pbSql}</pre>
                  ) : (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700 font-bold italic">대응되는 PB 원본 SQL을 찾지 못했습니다.</div>
                  )}
                </div>
                <div>
                  <div className="text-[11px] font-black text-emerald-600 mb-1 flex items-center justify-between gap-2">
                    <span className="truncate">📄 PB5 매퍼 · {sqlPeek.pb5FileName}</span>
                    <button
                      onClick={() => {
                        setSqlPanel({ fileName: sqlPeek.pb5FileName, content: sqlPeek.pb5FullContent, line: sqlPeek.pb5StartLine });
                        setSqlPeek(null);
                      }}
                      className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-black transition-colors whitespace-nowrap"
                    >
                      전체 매퍼 보기
                    </button>
                  </div>
                  <pre className="m-0 p-3 bg-[#1e1e1e] rounded-lg font-mono text-[12.5px] text-slate-200 overflow-x-auto whitespace-pre">{sqlPeek.pb5Sql}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 전체보기 패널: PB .pc(좌) / PB5 매퍼 XML(우). 둘 다 동시 가능. */}
      <SqlSlidePanel
        open={!!sqlPanelPb} side="left" lang="c" headerClass="bg-indigo-600"
        fileName={sqlPanelPb?.fileName ?? ''} content={sqlPanelPb?.content ?? null} line={sqlPanelPb?.line ?? 1}
        fontSize={fontSize} onClose={() => setSqlPanelPb(null)}
      />
      <SqlSlidePanel
        open={!!sqlPanel} side="right" lang="xml" headerClass="bg-emerald-600"
        fileName={sqlPanel?.fileName ?? ''} content={sqlPanel?.content ?? null} line={sqlPanel?.line ?? 1}
        fontSize={fontSize} onClose={() => setSqlPanel(null)}
      />

      {/* 체크리스트 우측 슬라이드 패널 (선택된 프로그램 단위로 점검 항목 관리) */}
      <Checklist
        serviceId={activePresetKey}
        isOpen={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
        showToast={showToast}
      />
    </div>
  );
};

export default CodeComparator;
