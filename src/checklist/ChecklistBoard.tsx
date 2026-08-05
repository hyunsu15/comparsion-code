import { useState, useEffect, useCallback, useMemo, useRef, type FC, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { checklistService } from './checklistService';
import type { ChecklistMatrix, ChecklistMatrixRow, ChecklistMatrixColumn } from './checklistService';
import { CHECKLIST_STATUSES, STATUS_LABEL, STATUS_SOFT, isDecided, type ChecklistStatus } from './checklistStatus';
import type { CodeKind, ServiceInfo } from '../discussionService';
import { deriveTypeOptions, deriveWorkOptions, matchesCategory, averageProgress } from './checklistCategoryFilter';
import CategoryChips from '../component/CategoryChips';
import { formatProgramLabel } from '../programLabel';
import { getErrorMessage } from '../errorMessage';
import {
  loadColumnWidths,
  saveColumnWidths,
  defaultColumnWidths,
  widthOf,
  withWidth,
  gridTemplate,
  totalWidth as getTotalWidth,
  type ColumnWidths,
  type ColumnKey,
} from './checklistColumnWidths';

export interface ChecklistBoardProps {
  active: boolean; // 탭 활성 여부 — 활성화될 때마다 최신화
  services: ServiceInfo[]; // 프로그램명 표기(소스 비교와 동일: "PB소스 / ID")용 카탈로그
  onNavigate: (req: { serviceId: string; line: number; codeKind: CodeKind }) => void;
}

type StatusFilter = 'ALL' | 'NO' | 'HOLD' | 'NONE' | 'DONE';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'NO', label: '아니오 있음' },
  { key: 'HOLD', label: '판단 보류 있음' },
  { key: 'NONE', label: '선택안함 있음' },
  { key: 'DONE', label: '모두 판단완료' },
];

const ROW_H = 64;

interface CardData {
  serviceId: string;
  checkPoint: string;
  detail: string | null;
  status: ChecklistStatus;
  comment: string;
}

/**
 * 체크리스트 모아보기 — 전 프로그램 × 점검 항목 상태 매트릭스 대시보드.
 * 행=프로그램, 열=점검 항목, 셀=상태(읽기 전용 표시) + 의견 있으면 💬(클릭 시 읽기 전용 카드).
 * 2만 건 대비: 행 가상 스크롤 + 필터(검색/상태/의견만).
 */
const ChecklistBoard: FC<ChecklistBoardProps> = ({ active, services, onNavigate }) => {
  const [matrix, setMatrix] = useState<ChecklistMatrix>({ columns: [], rows: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [commentOnly, setCommentOnly] = useState(false);
  const [card, setCard] = useState<CardData | null>(null);
  const [selectedType, setSelectedType] = useState(''); // 유형(big_category), '' = 전체
  const [selectedWork, setSelectedWork] = useState(''); // 업무(middle_category), '' = 전체

  const parentRef = useRef<HTMLDivElement>(null);

  // 컬럼 너비(드래그 조절) — localStorage 영속. dragRef 는 진행 중 리사이즈 정보.
  const [colWidths, setColWidths] = useState<ColumnWidths>(loadColumnWidths);
  const [isResizing, setIsResizing] = useState(false);
  const dragRef = useRef<{ key: ColumnKey; startX: number; startW: number } | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMatrix(await checklistService.getMatrix());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 탭 활성화 시 최신화 (소스 비교 패널/다른 곳에서 바뀐 상태 반영)
  useEffect(() => {
    if (!active) return;
    load();
  }, [active, load]);

  const { columns, rows } = matrix;

  const typeOptions = useMemo(() => deriveTypeOptions(rows), [rows]);
  const workOptions = useMemo(() => deriveWorkOptions(rows, selectedType), [rows, selectedType]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesCategory(row, selectedType, selectedWork)) return false;
      if (q) {
        const hay = `${row.service_id} ${row.big_category ?? ''} ${row.middle_category ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (commentOnly && Object.keys(row.comments).length === 0) return false;
      if (statusFilter === 'NO' && !columns.some((c) => row.statuses[c.check_point_id] === 'NO')) return false;
      if (statusFilter === 'HOLD' && !columns.some((c) => row.statuses[c.check_point_id] === 'HOLD')) return false;
      if (statusFilter === 'NONE' && !columns.some((c) => (row.statuses[c.check_point_id] ?? 'NONE') === 'NONE')) return false;
      if (statusFilter === 'DONE' && !columns.every((c) => isDecided(row.statuses[c.check_point_id] ?? 'NONE'))) return false;
      return true;
    });
  }, [rows, columns, search, commentOnly, statusFilter, selectedType, selectedWork]);

  // 유형 변경 시, 새 유형에 현재 업무가 없으면 업무를 전체로 되돌린다.
  const onTypeChange = (v: string) => {
    setSelectedType(v);
    if (selectedWork && !deriveWorkOptions(rows, v).includes(selectedWork)) setSelectedWork('');
  };

  const rowVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 12,
  });

  // 탭이 display 토글로 숨겨졌다 다시 보이거나(=뷰포트 높이 0→실측) 필터 결과가 바뀌면
  // 가상 스크롤 높이를 다시 측정한다. (안 하면 숨김 상태에서 0으로 측정돼 행이 안 그려짐)
  useEffect(() => {
    if (active) rowVirtualizer.measure();
  }, [active, filteredRows.length, rowVirtualizer]);

  // 컬럼 너비 변경 시 localStorage 저장.
  useEffect(() => { saveColumnWidths(colWidths); }, [colWidths]);

  // 카드 모달 ESC 닫기 — 앱 전역 모달 닫기 방식(ESC) 일관성. (바깥 클릭/닫기 버튼과 동일 동작)
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCard(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  // 헤더 경계 드래그 → 해당 컬럼 너비 조절(드래그 시작값 + 이동량, withWidth 가 최소값 보정).
  useEffect(() => {
    if (!isResizing) return;
    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      setColWidths((prev) => withWidth(prev, d.key, d.startW + (e.clientX - d.startX)));
    };
    const onUp = () => { dragRef.current = null; setIsResizing(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  // 핸들 onMouseDown — 드래그 시작값 기록 후 전역 리스너가 이동/종료를 처리.
  const startResize = (key: ColumnKey) => (e: ReactMouseEvent) => {
    e.preventDefault();
    dragRef.current = { key, startX: e.clientX, startW: widthOf(colWidths, key) };
    setIsResizing(true);
  };
  const resetWidths = () => setColWidths(defaultColumnWidths());

  const openCard = (row: ChecklistMatrixRow, col: ChecklistMatrixColumn) => {
    setCard({
      serviceId: row.service_id,
      checkPoint: col.check_point,
      detail: col.detail,
      status: (row.statuses[col.check_point_id] ?? 'NONE') as ChecklistStatus,
      comment: row.comments[col.check_point_id] ?? '',
    });
  };

  const decidedOf = (row: ChecklistMatrixRow) =>
    columns.filter((c) => isDecided(row.statuses[c.check_point_id] ?? 'NONE')).length;

  const checkIds = columns.map((c) => c.check_point_id);
  const programW = widthOf(colWidths, 'program'); // 진행률 컬럼을 프로그램 바로 오른쪽에 가로 고정할 때의 left
  const totalWidth = getTotalWidth(colWidths, checkIds);
  const gridStyle = { display: 'grid', gridTemplateColumns: gridTemplate(colWidths, checkIds), width: totalWidth } as const;
  const total = columns.length;
  // 같은 check_point(카테고리)가 연속된 컬럼을 묶어 헤더 상단에 셀 병합 표시한다.
  const headerGroups = useMemo(() => {
    const gs: { check_point: string; startIndex: number; span: number }[] = [];
    columns.forEach((c, i) => {
      const prev = gs[gs.length - 1];
      if (prev && prev.check_point === c.check_point) prev.span += 1;
      else gs.push({ check_point: c.check_point, startIndex: i, span: 1 });
    });
    return gs;
  }, [columns]);
  const hasData = !isLoading && !error && rows.length > 0;

  return (
    <div className="p-3 w-full h-full bg-slate-100 flex flex-col gap-3 overflow-hidden font-sans">
      <header className="border-b bg-white -mx-3 -mt-3 px-4 py-0.5 shadow-sm flex-shrink-0 flex justify-between items-center gap-4 flex-wrap">
        <h1 className="text-sm font-black text-slate-800 m-0 tracking-tighter">체크리스트 모아보기</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {CHECKLIST_STATUSES.map((s) => (
              <span key={s} className={`px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_SOFT[s]}`}>{STATUS_LABEL[s]}</span>
            ))}
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-600">💬 의견</span>
          </div>
          <button onClick={resetWidths} title="컬럼 너비를 기본값으로 되돌리기" className="px-3 py-0.5 bg-slate-50 hover:bg-slate-100 text-slate-500 text-[12px] font-black rounded-lg border border-slate-200 transition-all">↔ 너비 초기화</button>
          <button onClick={load} className="px-3 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[12px] font-black rounded-lg border border-indigo-200 transition-all">새로고침</button>
        </div>
      </header>

      {/* 필터바 — 유형/업무는 공유 칩(CategoryChips), 아래 줄에 검색·상태·의견 */}
      <div className="flex flex-col gap-2 flex-shrink-0">
        <CategoryChips
          typeOptions={typeOptions}
          workOptions={workOptions}
          selectedType={selectedType}
          selectedWork={selectedWork}
          onSelectType={onTypeChange}
          onSelectWork={setSelectedWork}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="프로그램·업무 검색…"
            aria-label="프로그램 검색"
            className="px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 w-64"
          />
          <div className="flex items-center rounded-xl border border-slate-200 overflow-hidden">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                aria-pressed={statusFilter === f.key}
                className={`px-3 py-2 text-[12px] font-bold border-r border-slate-200 last:border-r-0 transition-colors ${statusFilter === f.key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >{f.label}</button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-[12px] font-bold text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={commentOnly} onChange={(e) => setCommentOnly(e.target.checked)} className="accent-indigo-600" />
            💬 의견 있는 것만
          </label>
          <span className="text-[12px] font-bold text-slate-400 tabular-nums">{filteredRows.length} / {rows.length} 프로그램 · 평균 진행률 {averageProgress(filteredRows, columns)}%</span>
        </div>
      </div>

      {/* 매트릭스 */}
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-200 bg-white">
        {isLoading && <div className="text-slate-400 text-sm p-8 text-center animate-pulse">불러오는 중...</div>}
        {!isLoading && error && <div className="bg-red-50 text-red-600 text-sm p-4 m-3 rounded-xl border border-red-100 font-bold">⚠️ {error}</div>}
        {!isLoading && !error && rows.length === 0 && <div className="text-slate-400 text-sm font-bold p-8 text-center">프로그램이 없습니다.</div>}
        {hasData && filteredRows.length === 0 && <div className="text-slate-400 text-sm font-bold p-8 text-center">조건에 맞는 프로그램이 없습니다.</div>}

        {hasData && filteredRows.length > 0 && (
          <div style={{ width: totalWidth }}>
            {/* 헤더 (sticky) — 같은 카테고리(check_point) 컬럼은 상단 셀로 병합, 아래 줄에 세부 문장 */}
            <div style={{ ...gridStyle, gridTemplateRows: 'auto auto', position: 'sticky', top: 0, zIndex: 20 }} className="bg-slate-100 border-b border-slate-200">
              <div style={{ gridColumn: 1, gridRow: '1 / span 2' }} className="relative px-3 py-2 font-black text-slate-500 text-[12px] flex items-center sticky left-0 z-10 bg-slate-100 border-r border-slate-200">
                프로그램
                <div onMouseDown={startResize('program')} role="separator" aria-orientation="vertical" aria-label="프로그램 컬럼 너비 조절" className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500/70 transition-colors z-30" />
              </div>
              {/* 진행률 (프로그램 바로 오른쪽 = 2열, 2행 병합 + 가로 스크롤 고정) */}
              <div style={{ gridColumn: 2, gridRow: '1 / span 2', left: programW }} className="relative px-2 py-2 font-black text-slate-500 text-[12px] flex items-center justify-center sticky z-10 bg-slate-100 border-r border-slate-200">
                진행률
                <div onMouseDown={startResize('progress')} role="separator" aria-orientation="vertical" aria-label="진행률 컬럼 너비 조절" className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500/70 transition-colors z-30" />
              </div>
              {/* 카테고리 병합 셀 (상단 행) — 점검 항목은 3열부터(1=프로그램, 2=진행률) */}
              {headerGroups.map((g) => (
                <div
                  key={`grp-${g.startIndex}`}
                  style={{ gridColumn: `${3 + g.startIndex} / span ${g.span}`, gridRow: 1 }}
                  title={g.check_point}
                  className="px-2 py-1.5 font-black text-slate-700 text-[12px] flex items-center justify-center text-center border-l border-b border-slate-200"
                >
                  <span className="break-words max-w-full">{g.check_point}</span>
                </div>
              ))}
              {/* 세부 문장 (하단 행, 컬럼별) — 줄바꿈 허용해 전체 문장이 다 보이게 + 너비 조절 핸들 */}
              {columns.map((c, i) => (
                <div
                  key={c.check_point_id}
                  style={{ gridColumn: 3 + i, gridRow: 2 }}
                  title={`[${c.check_point}] ${c.detail ?? ''}`}
                  className="relative px-2 py-1.5 leading-tight flex items-center justify-center text-center border-l border-slate-200"
                >
                  <span className="font-bold text-slate-500 text-[10px] whitespace-pre-wrap break-words">{c.detail ?? ''}</span>
                  <div onMouseDown={startResize(c.check_point_id)} role="separator" aria-orientation="vertical" aria-label={`${c.check_point} 컬럼 너비 조절`} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400/50 active:bg-indigo-500/70 transition-colors z-30" />
                </div>
              ))}
            </div>

            {/* 가상 스크롤 행 */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: totalWidth }}>
              {rowVirtualizer.getVirtualItems().map((vi) => {
                const row = filteredRows[vi.index];
                const decided = decidedOf(row);
                return (
                  <div
                    key={row.service_id}
                    style={{ ...gridStyle, position: 'absolute', top: 0, left: 0, transform: `translateY(${vi.start}px)`, height: vi.size }}
                    className="group border-b border-slate-100 hover:bg-slate-50/60"
                  >
                    <button
                      onClick={() => onNavigate({ serviceId: row.service_id, line: 0, codeKind: 'pb' })}
                      title="소스 비교 탭에서 열기"
                      className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 px-3 py-1.5 text-left flex flex-col justify-center min-w-0 hover:text-indigo-600 transition-colors"
                    >
                      <span className="font-black text-slate-800 text-[13px] break-words" title={formatProgramLabel(row.service_id, services)}>{formatProgramLabel(row.service_id, services)}</span>
                      {(row.big_category || row.middle_category) && (
                        <span className="text-[11px] text-slate-400 font-bold break-words">{[row.big_category, row.middle_category].filter(Boolean).join(' · ')}</span>
                      )}
                    </button>
                    {/* 진행률 — 프로그램 바로 오른쪽, 가로 스크롤에도 고정 */}
                    <div style={{ left: programW }} className="sticky z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200 flex items-center gap-1.5 px-2">
                      <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: total > 0 ? `${(decided / total) * 100}%` : '0%' }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 tabular-nums">{decided}/{total}</span>
                    </div>
                    {columns.map((c) => {
                      const st = (row.statuses[c.check_point_id] ?? 'NONE') as ChecklistStatus;
                      const comment = row.comments[c.check_point_id];
                      return (
                        <div key={c.check_point_id} className="relative flex items-center px-1.5 border-l border-slate-100">
                          <span
                            aria-label={`${row.service_id} - ${c.detail ?? c.check_point}`}
                            className={`block w-full px-1 py-1 rounded-md text-[11px] font-bold text-center ${STATUS_SOFT[st]}`}
                          >
                            {STATUS_LABEL[st]}
                          </span>
                          {comment && (
                            <button
                              onClick={() => openCard(row, c)}
                              title="의견 보기"
                              aria-label={`${c.detail ?? c.check_point} 의견 보기`}
                              className="absolute top-0 right-0 text-[10px] leading-none px-0.5 text-indigo-500 hover:text-indigo-700"
                            >💬</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 읽기 전용 의견 카드 */}
      {card && (
        <div className="fixed inset-0 z-[150] bg-black/30 flex items-center justify-center p-4" onClick={() => setCard(null)}>
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl w-[460px] max-w-[92vw] shadow-2xl p-5 font-sans" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3 mb-2">
              <div className="min-w-0">
                <div className="text-[12px] text-slate-400 font-bold truncate" title={formatProgramLabel(card.serviceId, services)}>{formatProgramLabel(card.serviceId, services)}</div>
                <h4 className="text-base font-black text-slate-800 m-0 break-words">{card.checkPoint}</h4>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded text-[11px] font-bold ${STATUS_SOFT[card.status]}`}>{STATUS_LABEL[card.status]}</span>
            </div>
            {card.detail && <p className="text-[13px] text-slate-500 whitespace-pre-wrap break-words m-0 mb-3">{card.detail}</p>}
            <div className="text-[11px] font-black text-slate-400 mb-1">의견</div>
            <div className="text-sm text-slate-700 whitespace-pre-wrap break-words bg-slate-50 rounded-lg p-3 border border-slate-100">{card.comment}</div>
            <div className="flex items-center justify-between mt-4">
              <span className="text-[11px] text-slate-400">편집은 소스 비교 탭의 체크리스트 패널에서</span>
              <button onClick={() => setCard(null)} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[13px] font-black rounded-xl transition-all">닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistBoard;
