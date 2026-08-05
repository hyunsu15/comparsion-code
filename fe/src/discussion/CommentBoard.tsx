import { useState, useEffect, useCallback, useMemo, useRef, type FC } from 'react';
import { sortBigCategories } from '../config/categoryOrder';
import CategoryChips from '../component/CategoryChips';
import { formatProgramLabel } from '../programLabel';
import { discussionService } from '../discussionService';
import type { ServiceInfo, DiscussionThread, DiscussionMessage, CodeKind, ThreadReaction } from '../discussionService';
import { OPINION_TYPES, getOpinionMeta } from '../config/opinionType';
import type { OpinionType } from '../config/opinionType';
import { sortThreadsForBoard } from './commentSort';
import { buildThreadMessages, getRootMessage } from './commentThread';
import { getTotalPages, getPageNumbers } from '../pagination';
import { REACTIONS } from '../config/reaction';
import { getErrorMessage } from '../errorMessage';

export interface CommentBoardProps {
  services: ServiceInfo[];
  onNavigate: (req: { serviceId: string; line: number; codeKind: CodeKind }) => void;
  favorites?: string[];
  onToggleFavorite?: (serviceId: string) => void;
  active?: boolean; // 탭 활성 여부 — 처음 활성화 시 자동 전체 모아보기
}

const formatDateTime = (input: string | number | Date) => {
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input ?? '');
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const STATUS_LABEL: Record<DiscussionThread['status'], string> = {
  CHECK_PB: 'PB 담당자 확인 필요',
  CHECK_PB5: 'PB5 담당자 확인 필요',
  RESOLVED: '처리완료',
};

// 상태 뱃지 색상 — '미해결'은 담당자 확인 필요(PB/PB5) 색으로 구분, 정확한 문구는 STATUS_LABEL 툴팁
const STATUS_BADGE: Record<DiscussionThread['status'], string> = {
  CHECK_PB: 'bg-indigo-100 text-indigo-700',
  CHECK_PB5: 'bg-emerald-100 text-emerald-700',
  RESOLVED: 'bg-slate-200 text-slate-500',
};

// 상태 뱃지 공통 클래스 — '미해결'과 '처리완료' 크기를 동일하게 고정(min-w + 중앙정렬)
const STATUS_BADGE_BASE =
  'min-w-[62px] inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-black shrink-0';

const PAGE_SIZE = 20;

// 의견 상태 보기 — 미해결(OPEN)/완료(RESOLVED)/전체(ALL). 기본 OPEN(현행: 완료 제외).
type StatusView = 'OPEN' | 'RESOLVED' | 'ALL';
const STATUS_VIEWS: { key: StatusView; label: string }[] = [
  { key: 'OPEN', label: '미해결' },
  { key: 'RESOLVED', label: '처리완료' },
  { key: 'ALL', label: '전체' },
];

/**
 * 코멘트 모아보기 탭. 프로그램을 고르면 그 프로그램의 모든 토론 스레드를
 * 미해결 먼저로 정렬해 카드 목록으로 보여준다. 카드를 펼치면 메시지 스레드와
 * 답글/종료가 가능하고, "소스에서 보기"로 소스 비교 탭의 해당 줄로 점프한다.
 */
const CommentBoard: FC<CommentBoardProps> = ({ services, onNavigate, favorites = [], onToggleFavorite, active = false }) => {
  const [selectedBig, setSelectedBig] = useState('');
  const [selectedMiddle, setSelectedMiddle] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [favMode, setFavMode] = useState(false); // 즐겨찾기 통합 보기(selectedProgram 무시, 즐겨찾기 전체)
  const [opinionFilter, setOpinionFilter] = useState<OpinionType | 'ALL'>('ALL'); // 의견 유형 필터(단일 선택, ALL=전체)
  const [statusFilter, setStatusFilter] = useState<StatusView>('OPEN'); // 의견 상태(미해결/완료/전체). 기본 미해결(현행)
  const [allMode, setAllMode] = useState(false); // 분류별/글로벌 전체(페이징)
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const didAutoAll = useRef(false); // 탭 첫 활성화 시 자동 전체 모아보기를 1회만 켜기 위한 가드

  const [threads, setThreads] = useState<DiscussionThread[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 펼친 스레드의 메시지
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [expandedRoot, setExpandedRoot] = useState<DiscussionMessage | null>(null); // 펼친 스레드의 최초 의견(첫 글) — 리액션용
  const [isMsgLoading, setIsMsgLoading] = useState(false);

  // 의견(메시지) 수정 — 작성자 이름+소속이 같고, 스레드가 미해결일 때만 가능
  const [editingId, setEditingId] = useState<number | null>(null); // 수정 중인 메시지 id
  const [editDraft, setEditDraft] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null); // 삭제 처리 중인 메시지 id

  // 답글 작성 (작성자 측/이름은 소스 비교 탭과 localStorage 공유)
  const [draft, setDraft] = useState('');
  const [activePlatform, setActivePlatform] = useState<'PB' | 'PB5'>('PB');
  const [writerName, setWriterName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setWriterName(localStorage.getItem('writerName') ?? '');
    setActivePlatform((localStorage.getItem('activePlatform') as 'PB' | 'PB5') ?? 'PB');
  }, []);
  useEffect(() => { localStorage.setItem('writerName', writerName); }, [writerName]);
  useEffect(() => { localStorage.setItem('activePlatform', activePlatform); }, [activePlatform]);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // allMode 는 서버가 정렬·필터를 끝내므로 클라 정렬/필터를 우회한다.
  const sorted = useMemo(() => (allMode ? threads : sortThreadsForBoard(threads, activePlatform)), [threads, allMode, activePlatform]);
  const visible = useMemo(
    () => (allMode || opinionFilter === 'ALL' ? sorted : sorted.filter((t) => t.opinion_type === opinionFilter)),
    [sorted, opinionFilter, allMode],
  );

  // 유형/업무/프로그램 옵션 — services 카탈로그에서 파생(캐스케이드 비활성 없음).
  const typeOptions = useMemo(
    () => sortBigCategories(Array.from(new Set(services.map((s) => s.big_category).filter((b): b is string => !!b)))),
    [services],
  );
  const workOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (selectedBig && s.big_category !== selectedBig) continue;
      if (s.middle_category) set.add(s.middle_category);
    }
    return Array.from(set);
  }, [services, selectedBig]);
  const programOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (selectedBig && s.big_category !== selectedBig) continue;
      if (selectedMiddle && s.middle_category !== selectedMiddle) continue;
      set.add(s.service_id);
    }
    return Array.from(set);
  }, [services, selectedBig, selectedMiddle]);

  const loadThreads = useCallback(async (serviceId: string) => {
    if (!serviceId) { setThreads([]); return; }
    setIsLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      setThreads(await discussionService.getThreads(serviceId, statusFilter));
    } catch (e) {
      setError(getErrorMessage(e));
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  // 즐겨찾기 통합: 즐겨찾기한 모든 프로그램의 의견을 합쳐서 로드한다.
  const loadFavThreads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const lists = await Promise.all(favorites.map((id) => discussionService.getThreads(id, statusFilter)));
      setThreads(lists.flat());
    } catch (e) {
      setError(getErrorMessage(e));
      setThreads([]);
    } finally {
      setIsLoading(false);
    }
  }, [favorites, statusFilter]);

  // 분류별/글로벌 전체 — 서버 페이징. 종료 등으로 현재 페이지가 비고 page>1이면 한 페이지 앞으로.
  const loadAllThreads = useCallback(async (targetPage: number) => {
    setIsLoading(true);
    setError(null);
    setExpandedId(null);
    try {
      const res = await discussionService.getThreadsPaged({
        bigCategory: selectedBig || undefined,
        middleCategory: selectedMiddle || undefined,
        opinionType: opinionFilter === 'ALL' ? undefined : opinionFilter,
        status: statusFilter,
        mySide: activePlatform.toLowerCase(),
        page: targetPage,
        size: PAGE_SIZE,
      });
      if (res.items.length === 0 && targetPage > 1) {
        return loadAllThreads(targetPage - 1);
      }
      setThreads(res.items);
      setTotalCount(res.totalCount);
      setPage(res.page);
    } catch (e) {
      setError(getErrorMessage(e));
      setThreads([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [selectedBig, selectedMiddle, opinionFilter, statusFilter, activePlatform]);

  // 현재 모드에 맞춰 목록 재조회 (답글/종료/리액션 후 갱신)
  const reload = useCallback(() => {
    if (allMode) loadAllThreads(page);
    else if (favMode) loadFavThreads();
    else if (selectedProgram) loadThreads(selectedProgram);
  }, [allMode, page, loadAllThreads, favMode, selectedProgram, loadFavThreads, loadThreads]);

  // allMode 진입 및 스코프/유형 변경 시 1페이지부터 재조회
  useEffect(() => {
    if (!allMode) return;
    loadAllThreads(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMode, selectedBig, selectedMiddle, opinionFilter, statusFilter, activePlatform]);

  // 상태 필터 변경 시 비-allMode(즐겨찾기/프로그램) 경로도 재조회. allMode 는 위 효과가 1페이지부터 처리.
  useEffect(() => {
    if (allMode) return;
    if (favMode) loadFavThreads();
    else if (selectedProgram) loadThreads(selectedProgram);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // 탭이 처음 활성화될 때, 아무것도 선택 안 했으면 자동으로 전체 모아보기를 켠다(체크리스트 모아보기와 동일한 탭-1클릭 즉시성). 1회만 — 이후 사용자의 선택(프로그램/즐겨찾기/필터)은 보존.
  useEffect(() => {
    if (!active || didAutoAll.current) return;
    didAutoAll.current = true;
    if (!selectedProgram && !favMode && !allMode) setAllMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // 유형/업무 칩 = 동등 필터(캐스케이드 없음). 클릭 시 집계(allMode) 모드로 그 스코프 재조회.
  const selectType = (big: string) => {
    setFavMode(false);
    setSelectedProgram('');
    setSelectedBig(big);
    // 새 유형에 현재 업무가 없으면 업무를 전체로('전체' 유형은 업무 유지).
    if (big && selectedMiddle && !services.some((s) => s.big_category === big && s.middle_category === selectedMiddle)) {
      setSelectedMiddle('');
    }
    setAllMode(true);
  };
  const selectWork = (middle: string) => {
    setFavMode(false);
    setSelectedProgram('');
    setSelectedMiddle(middle);
    setAllMode(true);
  };
  const handleSelectProgram = (serviceId: string) => { setAllMode(false); setFavMode(false); setSelectedProgram(serviceId); loadThreads(serviceId); };

  // 즐겨찾기 모아보기 토글 (켜면 프로그램 선택 무시하고 즐겨찾기 전체)
  // 끄면 빈 화면 대신 '지금 필터(분류·업무·유형·상태)'로 전체 모아보기를 재조회한다.
  const toggleFavMode = () => {
    if (favMode) {
      setFavMode(false);
      setExpandedId(null);
      setAllMode(true); // allMode 진입 효과가 현재 필터로 1페이지부터 재조회
      return;
    }
    setAllMode(false);
    setFavMode(true);
    setSelectedProgram('');
    loadFavThreads();
  };

  const toggleExpand = useCallback(async (thread: DiscussionThread) => {
    setEditingId(null); // 다른 스레드로 이동/접힘 시 수정 상태 초기화
    setEditDraft('');
    if (expandedId === thread.id) { setExpandedId(null); setExpandedRoot(null); return; }
    setExpandedId(thread.id);
    setMessages([]);
    setExpandedRoot(null);
    setDraft('');
    setIsMsgLoading(true);
    try {
      const msgs = await discussionService.getMessages(thread.service_id, thread.id);
      setExpandedRoot(getRootMessage(msgs));
      setMessages(buildThreadMessages(thread, msgs));
    } catch (e) {
      showToast(`메시지 조회 실패: ${getErrorMessage(e)}`);
    } finally {
      setIsMsgLoading(false);
    }
  }, [expandedId, showToast]);

  const submitReply = async (thread: DiscussionThread) => {
    if (!draft.trim()) return;
    if (!writerName.trim()) { showToast('작성자 이름을 먼저 입력하세요.'); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      await discussionService.saveComment(
        thread.service_id,
        thread.line_number,
        draft,
        activePlatform.toLowerCase(),
        writerName.trim(),
        thread.code_kind,
        undefined, // opinionType — 답글이라 사용 안 함(새 스레드 생성 시에만 필수)
        thread.id,
      );
      setDraft('');
      const msgs = await discussionService.getMessages(thread.service_id, thread.id);
      setExpandedRoot(getRootMessage(msgs));
      setMessages(buildThreadMessages(thread, msgs));
      reload(); // 상태(마커) 갱신
      setExpandedId(thread.id); // 목록 갱신 후에도 펼침 유지
      showToast('답글을 등록했습니다.');
    } catch (e) {
      showToast(`등록 실패: ${getErrorMessage(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const closeThread = async (thread: DiscussionThread) => {
    if (!window.confirm('처리 완료 하시겠습니까?')) return;
    try {
      await discussionService.closeThread(thread.service_id, thread.id);
      setExpandedId(null);
      reload();
      showToast('처리 완료되었습니다.');
    } catch (e) {
      showToast(`처리완료 실패: ${getErrorMessage(e)}`);
    }
  };

  // 본인(현재 작성자 측 activePlatform)과 같은 측이 쓴 글에는 리액션 불가 — 상대 측 글에만 리액션한다.
  const isOwnSide = (writerRole?: string) => activePlatform.toLowerCase() === (writerRole ?? '').toLowerCase();

  // 메시지(댓글) 리액션 토글 — 낙관적 업데이트(실패 시 롤백). 갱신 후 reload 로 스레드 제목의 '마지막 리액션' 파생을 반영.
  const handleReaction = async (thread: DiscussionThread, message: DiscussionMessage, key: ThreadReaction) => {
    if (thread.status === 'RESOLVED') return; // 처리완료된 건은 조치구분(리액션) 수정 불가 — 보기만 가능
    if (isOwnSide(message.writer_role)) return; // 본인 측 글은 리액션 불가
    const next = message.reaction === key ? null : key;
    const prevLast = thread.last_reaction;
    const updatedMessages = messages.map((m) => (m.id === message.id ? { ...m, reaction: next } : m));
    const updatedRoot = expandedRoot && expandedRoot.id === message.id ? { ...expandedRoot, reaction: next } : expandedRoot;
    setMessages(updatedMessages);
    setExpandedRoot(updatedRoot);
    // reload() 는 expandedId 를 닫아 카드가 접히므로 호출하지 않는다. 스레드 카드의 '마지막 리액션'은
    // 루트(원본)+답글 전체 중 리액션 있는 최신(id 최대) — 서버 THREAD_VIEW 파생과 동일하게 로컬 계산해 반영.
    const all = updatedRoot && !updatedMessages.some((m) => m.id === updatedRoot.id) ? [...updatedMessages, updatedRoot] : updatedMessages;
    const nextLast = [...all].filter((m) => m.reaction).sort((a, b) => b.id - a.id)[0]?.reaction ?? null;
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, last_reaction: nextLast } : t)));
    try {
      await discussionService.updateReaction(thread.service_id, thread.id, message.id, next);
    } catch (e) {
      setMessages(messages);
      setExpandedRoot(expandedRoot);
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, last_reaction: prevLast } : t)));
      showToast(`리액션 변경 실패: ${getErrorMessage(e)}`);
    }
  };

  // 펼친 스레드에 보여줄 전체 대화 — 최초 의견(루트) + 답글. 처리완료 스레드도 내용 전체가 보이도록 루트를 포함한다.
  const conversation = useMemo(
    () => (expandedRoot ? [expandedRoot, ...messages] : messages),
    [expandedRoot, messages],
  );

  // 의견 수정 가능 여부 — 작성자 이름·소속(현재 activePlatform)이 모두 같고, 스레드가 처리완료가 아니며,
  // 이 의견 '이후에 다른 소속'이 답하지 않았을 때만. (삭제와 동일 조건: 상대가 이미 답했다면 그 답의 맥락이 되는 원 글은 수정 불가)
  const canEditMessage = (thread: DiscussionThread, msg: DiscussionMessage) => {
    if (thread.status === 'RESOLVED') return false; // 처리완료 스레드는 수정 불가
    const me = writerName.trim();
    if (!me) return false;
    if (!isOwnSide(msg.writer_role) || me !== (msg.writer_name ?? '').trim()) return false; // 본인(이름+소속) 글만
    // 다른 소속이 이 의견 이후에 답했으면 수정 불가.
    const role = (msg.writer_role ?? '').toLowerCase();
    const otherSideRepliedLater = conversation.some((m) => m.id > msg.id && (m.writer_role ?? '').toLowerCase() !== role);
    return !otherSideRepliedLater;
  };

  // 의견(메시지) 수정 저장 — 성공 시 대화를 재조회하고, 최초 의견을 고쳤으면 카드 제목(content)도 맞춘다.
  const submitEdit = async (thread: DiscussionThread, msg: DiscussionMessage) => {
    const next = editDraft.trim();
    if (!next || editSubmitting) return;
    setEditSubmitting(true);
    try {
      await discussionService.updateMessage(thread.service_id, thread.id, msg.id, next, activePlatform.toLowerCase());
      const msgs = await discussionService.getMessages(thread.service_id, thread.id);
      const newRoot = getRootMessage(msgs);
      setExpandedRoot(newRoot);
      setMessages(buildThreadMessages(thread, msgs));
      // 최초 의견을 수정하면 목록 카드 제목(스레드 content)도 새 내용으로 동기화한다.
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, content: newRoot?.content ?? t.content } : t)));
      setEditingId(null);
      setEditDraft('');
      showToast('의견을 수정했습니다.');
    } catch (e) {
      showToast(`수정 실패: ${getErrorMessage(e)}`);
    } finally {
      setEditSubmitting(false);
    }
  };

  // 의견 삭제 가능 여부 — 수정 가능 조건과 동일하다(작성자·소속 일치 & 미해결 & 다른 소속이 이후에 답하지 않음).
  const canDeleteMessage = (thread: DiscussionThread, msg: DiscussionMessage) => canEditMessage(thread, msg);

  // 의견(메시지) 삭제 — 스레드에 이 의견만 남았으면 스레드째 삭제(빈 스레드 방지),
  // 아니면 메시지만 지우고 대화를 재조회한다. 최초 의견을 지우면 카드 제목(content)도 새 최초 의견으로 맞춘다.
  const deleteMessage = async (thread: DiscussionThread, msg: DiscussionMessage) => {
    if (deletingId) return;
    const isLastOne = conversation.length <= 1;
    const confirmMsg = isLastOne
      ? '이 의견을 삭제하면 스레드도 함께 삭제됩니다. 삭제하시겠습니까?'
      : '이 의견을 삭제하시겠습니까?';
    if (!window.confirm(confirmMsg)) return;
    setDeletingId(msg.id);
    try {
      if (isLastOne) {
        await discussionService.deleteThread(thread.service_id, thread.id);
        setExpandedId(null);
        setExpandedRoot(null);
        showToast('의견을 삭제했습니다.');
        reload(); // 목록에서 스레드 제거 반영
        return;
      }
      await discussionService.deleteMessage(thread.service_id, thread.id, msg.id);
      const msgs = await discussionService.getMessages(thread.service_id, thread.id);
      const newRoot = getRootMessage(msgs);
      setExpandedRoot(newRoot);
      setMessages(buildThreadMessages(thread, msgs));
      setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, content: newRoot?.content ?? t.content } : t)));
      showToast('의견을 삭제했습니다.');
    } catch (e) {
      showToast(`삭제 실패: ${getErrorMessage(e)}`);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-3 w-full h-full bg-slate-100 flex flex-col gap-2 overflow-hidden font-sans">
      <header className="border-b bg-white -mx-3 -mt-3 px-4 py-0.5 shadow-sm flex-shrink-0 flex justify-between items-center">
        <h1 className="text-sm font-black text-slate-800 m-0 tracking-tighter">의견 모아보기</h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-black text-slate-500 uppercase whitespace-nowrap">작성자 소속</span>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200 shadow-inner">
              <button
                onClick={() => setActivePlatform('PB')}
                aria-pressed={activePlatform === 'PB'}
                className={`px-5 py-0.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'text-slate-400 hover:text-indigo-500'}`}
              >PB</button>
              <button
                onClick={() => setActivePlatform('PB5')}
                aria-pressed={activePlatform === 'PB5'}
                className={`px-5 py-0.5 rounded-lg text-[14px] font-black transition-all ${activePlatform === 'PB5' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'text-slate-400 hover:text-emerald-500'}`}
              >PB5</button>
            </div>
          </div>
          <div className={`flex items-center gap-2 bg-slate-100 px-3 py-0.5 rounded-xl border shadow-inner ${writerName.trim() ? 'border-slate-200' : 'border-red-300'}`}>
            <label htmlFor="cb-writer" className="text-[11px] font-black text-slate-500 uppercase">작성자</label>
            <input
              id="cb-writer"
              type="text"
              aria-label="작성자 이름"
              value={writerName}
              onChange={(e) => setWriterName(e.target.value)}
              placeholder="이름 입력"
              className="w-24 bg-transparent border-none text-sm font-bold text-slate-700 focus:ring-0 p-0 placeholder:text-red-300 placeholder:font-normal"
            />
          </div>
          <button
            type="button"
            onClick={reload}
            title="목록 새로고침"
            className="px-3 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[12px] font-black rounded-lg border border-indigo-200 transition-all"
          >새로고침</button>
        </div>
      </header>

      {/* 유형/업무 칩 필터(공유) + 프로그램 드릴(보조) + 즐겨찾기/초기화 — 체크리스트 모아보기와 동일 */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <CategoryChips
          typeOptions={typeOptions}
          workOptions={workOptions}
          selectedType={selectedBig}
          selectedWork={selectedMiddle}
          onSelectType={selectType}
          onSelectWork={selectWork}
          labelWidthClass="w-16"
        />
        <div className="flex items-center gap-2 flex-nowrap">
          <span className="text-[11px] font-black text-slate-500 w-16 shrink-0">프로그램</span>
          <select
            aria-label="프로그램 선택"
            value={programOptions.includes(selectedProgram) ? selectedProgram : ''}
            onChange={(e) => { if (e.target.value) handleSelectProgram(e.target.value); }}
            className="min-w-[24rem] max-w-2xl px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
          >
            <option value="">프로그램 보기…</option>
            {programOptions.map((p) => <option key={p} value={p}>{formatProgramLabel(p, services)}</option>)}
          </select>
          {onToggleFavorite && selectedProgram && programOptions.includes(selectedProgram) && (
            <button
              type="button"
              onClick={() => onToggleFavorite(selectedProgram)}
              aria-pressed={favorites.includes(selectedProgram)}
              aria-label={favorites.includes(selectedProgram) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              title={favorites.includes(selectedProgram) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
              className={`shrink-0 px-2 py-1.5 rounded-lg text-lg leading-none transition-colors ${favorites.includes(selectedProgram) ? 'text-amber-500' : 'text-slate-400 hover:text-slate-600'}`}
            >{favorites.includes(selectedProgram) ? '★' : '☆'}</button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={toggleFavMode}
            aria-pressed={favMode}
            className={`shrink-0 px-3 py-2 rounded-xl text-[12px] font-black border transition-all whitespace-nowrap ${favMode ? 'bg-amber-400 text-amber-900 border-amber-400' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >★ 즐겨찾기 모아보기{favorites.length ? ` (${favorites.length})` : ''}</button>
        </div>
        {/* 상태 필터 — 미해결/완료/전체. 항상 노출(완료 0건이어도 되돌릴 수 있게). */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-black text-slate-500 w-16 shrink-0">상태</span>
          {STATUS_VIEWS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setStatusFilter(s.key)}
              aria-pressed={statusFilter === s.key}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition-all ${statusFilter === s.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >{s.label}</button>
          ))}
        </div>
      </div>

      {/* 의견 유형 필터 (의견이 있을 때만 노출, 단일 선택) */}
      {(allMode || sorted.length > 0) && (
        <div className="flex items-center gap-1.5 flex-wrap flex-shrink-0">
          <span className="text-[11px] font-black text-slate-500 w-16 shrink-0">의견 유형</span>
          <button
            type="button"
            onClick={() => setOpinionFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition-all ${opinionFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >전체</button>
          {OPINION_TYPES.map((t) => {
            const on = opinionFilter === t.code;
            return (
              <button
                key={t.code}
                type="button"
                title={t.description}
                onClick={() => setOpinionFilter(t.code)}
                className={`px-2.5 py-1 rounded-lg text-[12px] font-black border transition-all ${on ? `${t.badgeClass} border-current shadow-sm` : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
              >{t.label}</button>
            );
          })}
        </div>
      )}

      {/* 의견 목록 */}
      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2 pr-1">
        {!selectedProgram && !favMode && !allMode && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">유형·업무 칩으로 거르거나 프로그램을 선택해 의견을 보세요.</div>
        )}
        {favMode && favorites.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">즐겨찾기한 프로그램이 없습니다. 선택바의 ☆로 추가하세요.</div>
        )}
        {(selectedProgram || allMode || (favMode && favorites.length > 0)) && isLoading && (
          <div className="text-slate-400 text-sm p-8 text-center animate-pulse">의견을 불러오는 중...</div>
        )}
        {(selectedProgram || allMode || (favMode && favorites.length > 0)) && !isLoading && error && (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl border border-red-100 font-bold">⚠️ {error}</div>
        )}
        {allMode && !isLoading && !error && totalCount === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">등록된 의견이 없습니다.</div>
        )}
        {!allMode && (selectedProgram || (favMode && favorites.length > 0)) && !isLoading && !error && sorted.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">등록된 의견이 없습니다.</div>
        )}
        {!allMode && !isLoading && !error && sorted.length > 0 && visible.length === 0 && (
          <div className="text-slate-400 text-sm font-bold p-8 text-center">해당 유형의 의견이 없습니다.</div>
        )}

        {visible.map((thread) => {
          const expanded = expandedId === thread.id;
          // '내 차례' — 현재 보는 측(activePlatform)이 답해야 하는 'xxx 담당자 확인 필요' 스레드
          const isMyTurn = thread.status === `CHECK_${activePlatform}`;
          return (
            <div key={thread.id} className="shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => toggleExpand(thread)}
                onKeyDown={(e) => {
                  // 키보드 접근: 헤더에 포커스가 있을 때 Enter/Space 로 스레드를 펼치고 접는다.
                  // 내부 '소스에서 보기' 버튼에서 버블링된 키 이벤트는 target!==currentTarget 로 무시(중복 동작 방지).
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(thread); }
                }}
                className="p-3 flex items-start gap-3 cursor-pointer hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400/60 focus:ring-inset"
              >
                <span
                  className={`relative ${STATUS_BADGE_BASE} ${STATUS_BADGE[thread.status]}`}
                  title={thread.status === 'RESOLVED' ? undefined : STATUS_LABEL[thread.status]}
                >
                  {thread.status === 'RESOLVED' ? '처리완료' : '미해결'}
                  {isMyTurn && (
                    <span
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white"
                      title="내 답변이 필요합니다"
                      aria-label="내 답변이 필요합니다"
                    />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-bold mb-0.5">
                    <span className="font-mono text-slate-400" title="스레드 ID">#{thread.id}</span>
                    <span className="font-black text-indigo-500" title={formatProgramLabel(thread.service_id, services)}>{formatProgramLabel(thread.service_id, services)}</span>
                    {(() => {
                      const op = getOpinionMeta(thread.opinion_type);
                      return op ? <span className={`px-1.5 py-0.5 rounded font-black ${op.badgeClass}`}>{op.label}</span> : null;
                    })()}
                    <span className="font-black text-slate-400">{thread.code_kind.toUpperCase()}</span>
                    <span>{thread.line_number}번 줄</span>
                    {thread.last_reaction && (() => {
                      const r = REACTIONS.find((x) => x.key === thread.last_reaction);
                      return r ? <span className={`px-1.5 py-0.5 rounded ${r.activeClass}`} title="마지막 리액션">{r.label}</span> : null;
                    })()}
                    {thread.writer_name && <span>· {thread.writer_name}</span>}
                    {thread.created_at && <span>· {formatDateTime(thread.created_at)}</span>}
                  </div>
                  {/* 제목은 한 줄 요약(요약 헤더). 전체 내용은 펼침 영역의 '최초 의견'에서 보여준다. */}
                  <div className="text-[15px] font-semibold text-slate-900 truncate">{thread.content || '(내용 없음)'}</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigate({ serviceId: thread.service_id, line: thread.line_number, codeKind: thread.code_kind }); }}
                  className="shrink-0 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[11px] font-black rounded-lg border border-indigo-200 transition-all"
                >소스에서 보기</button>
                <span className="shrink-0 text-slate-300 text-xs self-center">{expanded ? '▲' : '▼'}</span>
              </div>

              {expanded && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  {isMsgLoading ? (
                    <div className="text-slate-400 text-xs animate-pulse">메시지를 불러오는 중...</div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {conversation.map((msg, idx) => {
                        const editing = editingId === msg.id;
                        const editable = canEditMessage(thread, msg);
                        const deletable = canDeleteMessage(thread, msg);
                        const showReaction = !isOwnSide(msg.writer_role) || (thread.status === 'RESOLVED' && !!msg.reaction);
                        return (
                          <div key={msg.id} className="flex gap-3">
                            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-black text-white text-[12px] ${msg.writer_role === 'pb' ? 'bg-indigo-500' : 'bg-emerald-500'}`}>
                              {(msg.writer_name || msg.writer_role || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`px-1.5 py-0.5 rounded text-[11px] font-black uppercase ${msg.writer_role === 'pb' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>{msg.writer_role?.toUpperCase()}</span>
                                <span className="font-black text-[13px] text-slate-900">{msg.writer_name || msg.writer_role?.toUpperCase()}</span>
                                {idx === 0 && <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-600" title="이 스레드의 최초 의견">최초 의견</span>}
                                {msg.created_at && <span className="text-[11px] text-slate-400 font-bold">{formatDateTime(msg.created_at)}</span>}
                                {!editing && (editable || deletable) && (
                                  <div className="ml-auto shrink-0 flex items-center gap-1.5">
                                    {editable && (
                                      <button
                                        onClick={() => { setEditingId(msg.id); setEditDraft(msg.content); }}
                                        className="px-2 py-0.5 text-[11px] font-black text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200 transition-all"
                                      >수정</button>
                                    )}
                                    {deletable && (
                                      <button
                                        onClick={() => deleteMessage(thread, msg)}
                                        disabled={deletingId === msg.id}
                                        className="px-2 py-0.5 text-[11px] font-black text-red-600 hover:text-red-700 hover:bg-red-50 rounded border border-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                      >{deletingId === msg.id ? '삭제 중…' : '삭제'}</button>
                                    )}
                                  </div>
                                )}
                              </div>
                              {editing ? (
                                <div className="flex flex-col gap-1.5">
                                  <textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    className="w-full h-20 p-2.5 text-[13px] rounded-lg bg-white border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none shadow-inner"
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(thread, msg); } }}
                                    autoFocus
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => submitEdit(thread, msg)}
                                      disabled={!editDraft.trim() || editSubmitting}
                                      className="px-4 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    >{editSubmitting ? '저장 중...' : '저장'}</button>
                                    <button
                                      onClick={() => { setEditingId(null); setEditDraft(''); }}
                                      className="px-3 py-1 bg-white hover:bg-slate-100 text-slate-500 text-[11px] font-black rounded-lg border border-slate-200 transition-all"
                                    >취소</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">{msg.content}</div>
                              )}
                              {!editing && showReaction && (
                                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                  <span className="text-[11px] font-black text-slate-500 shrink-0">조치구분</span>
                                  {REACTIONS.map((r) => {
                                    const on = msg.reaction === r.key;
                                    const disabled = thread.status === 'RESOLVED' || isOwnSide(msg.writer_role);
                                    return (
                                      <button
                                        key={r.key}
                                        onClick={() => handleReaction(thread, msg, r.key)}
                                        disabled={disabled}
                                        aria-pressed={on}
                                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all ${on ? r.activeClass : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200`}
                                      >{r.label}</button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {thread.status === 'RESOLVED' ? (
                        <div className="text-[12px] text-slate-400 font-bold italic">처리완료된 스레드입니다.</div>
                      ) : (
                        <div className="flex flex-col gap-2 pt-1">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="답글을 입력하세요..."
                            className="w-full h-20 p-3 text-[13px] rounded-lg bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 resize-none shadow-inner"
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitReply(thread); } }}
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => submitReply(thread)}
                              disabled={!draft.trim() || submitting}
                              className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] font-black rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >{submitting ? '전송 중...' : '답글'}</button>
                            <button
                              onClick={() => closeThread(thread)}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[12px] font-black rounded-lg border border-emerald-200 transition-all"
                            >처리완료</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allMode && !isLoading && !error && totalCount > 0 && (
        <div className="flex items-center justify-center gap-1.5 flex-shrink-0 py-1 flex-wrap">
          <span className="text-[11px] font-black text-slate-500 mr-2">총 {totalCount}건 · {page}/{getTotalPages(totalCount, PAGE_SIZE)}페이지</span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => loadAllThreads(page - 1)}
            className="px-2.5 py-1 rounded-lg text-[12px] font-black border bg-white text-slate-500 border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >이전</button>
          {getPageNumbers(page, getTotalPages(totalCount, PAGE_SIZE)).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === page}
              onClick={() => loadAllThreads(n)}
              className={`px-3 py-1 rounded-lg text-[12px] font-black border transition-all ${n === page ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
            >{n}</button>
          ))}
          <button
            type="button"
            disabled={page >= getTotalPages(totalCount, PAGE_SIZE)}
            onClick={() => loadAllThreads(page + 1)}
            className="px-2.5 py-1 rounded-lg text-[12px] font-black border bg-white text-slate-500 border-slate-200 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >다음</button>
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[140] px-5 py-3 rounded-xl shadow-2xl text-sm font-bold text-white bg-slate-800">
          {toast}
        </div>
      )}
    </div>
  );
};

export default CommentBoard;
