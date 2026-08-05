import React, { useState, useEffect, useMemo, useRef } from 'react';
import { checklistService } from './checklistService';
import type { ChecklistItem } from './checklistService';
import {
  CHECKLIST_STATUSES,
  STATUS_LABEL,
  STATUS_SOLID,
  isDecided,
  type ChecklistStatus,
} from './checklistStatus';
import { collapsedTitles, openTitles, loadExpandedTitles, saveExpandedTitles } from './checklistCollapse';

const IconX = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
// 펼침(아래)/접힘(오른쪽) — open 이면 90도 회전.
const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

interface ChecklistProps {
  serviceId: string; // 선택된 프로그램(=activePresetKey). 빈 값이면 미선택.
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type?: 'info' | 'error' | 'success') => void;
}

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center justify-center h-32 px-4 text-sm text-slate-400 text-center">{text}</div>
);

// 소스비교탭 좌측 슬라이드 패널 — 점검 항목(제목+세부문장) + 프로그램별 상태(예/아니오/해당없음/보류·메모) 관리.
const Checklist: React.FC<ChecklistProps> = ({ serviceId, isOpen, onClose, showToast }) => {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // 카테고리 접힘 — 기본은 '전부 접힘'. 펼친(연) 제목만 프로그램별로 localStorage 에 기억한다(checklistCollapse).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [commentDrafts, setCommentDrafts] = useState<Record<number, string>>({});
  // 프로그램별 마지막 스크롤 위치(세션 내) — 같은 프로그램 재방문 시 복원.
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollByProgram = useRef<Record<string, number>>({});
  const restoredFor = useRef<string>('');

  // 패널이 열려 있고 프로그램이 선택돼 있을 때만 로드한다.
  //  - 빈 serviceId 에서는 items 를 건드리지 않는다(미선택 안내는 렌더에서 serviceId 로 분기).
  //  - cancelled 플래그로, 늦게 도착한 이전 요청이 최신 상태를 덮어쓰지 않게 한다.
  useEffect(() => {
    if (!isOpen || !serviceId) return;
    let cancelled = false;
    setIsLoading(true);
    setCommentDrafts({});      // 프로그램 전환 시 이전 프로그램의 메모 초안 잔존 방지(다른 프로그램에 보이던 버그)
    restoredFor.current = '';  // 새 프로그램 로드 후 스크롤 복원 1회 허용
    checklistService.getChecklist(serviceId)
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        // 프로그램별 저장된 '펼친 목록'으로 복원 — 없으면 전부 접힘(기본). 새로 추가된 카테고리도 접힌 채로 시작.
        setCollapsed(new Set(collapsedTitles(data.map((i) => i.check_point), loadExpandedTitles(serviceId))));
      })
      .catch(() => { if (!cancelled) showToast('체크리스트를 불러오지 못했습니다.', 'error'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, serviceId, showToast]);
  // 참고: ESC 닫기는 상위 CodeComparator 의 중앙 ESC 핸들러가 우선순위 순서로 처리한다(isChecklistOpen).

  // 같은 프로그램 재방문 시 마지막 스크롤 위치 복원(세션 내, 프로그램별 1회). 편집 재렌더엔 재복원하지 않는다.
  useEffect(() => {
    if (!isOpen || !serviceId || isLoading) return;
    if (restoredFor.current === serviceId) return;
    if (bodyRef.current) bodyRef.current.scrollTop = scrollByProgram.current[serviceId] ?? 0;
    restoredFor.current = serviceId;
  }, [isOpen, serviceId, isLoading, items]);

  // 상태 변경 — 낙관적 반영 + 실패 시 롤백.
  const handleSetStatus = async (item: ChecklistItem, status: ChecklistStatus) => {
    if (status === item.status) return;
    const previous = item.status;
    setItems((prev) => prev.map((i) => (i.check_point_id === item.check_point_id ? { ...i, status } : i)));
    try {
      await checklistService.updateChecklistItem(serviceId, item.check_point_id, { status });
    } catch {
      setItems((prev) => prev.map((i) => (i.check_point_id === item.check_point_id ? { ...i, status: previous } : i)));
      showToast('상태 변경에 실패했습니다.', 'error');
    }
  };

  // 메모 저장 — 포커스 해제 시, 바뀐 경우에만 PATCH.
  const saveComment = async (item: ChecklistItem) => {
    const text = commentDrafts[item.check_point_id] ?? item.comment ?? '';
    if (text === (item.comment ?? '')) return;
    const previous = item.comment;
    setItems((prev) => prev.map((i) => (i.check_point_id === item.check_point_id ? { ...i, comment: text } : i)));
    try {
      await checklistService.updateChecklistItem(serviceId, item.check_point_id, { comment: text });
    } catch {
      setItems((prev) => prev.map((i) => (i.check_point_id === item.check_point_id ? { ...i, comment: previous } : i)));
      showToast('메모 저장에 실패했습니다.', 'error');
    }
  };

  // 접힘 상태를 바꾸고, 그 결과의 '펼친 목록'을 프로그램별로 저장(복원용).
  const persistCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    saveExpandedTitles(serviceId, openTitles(items.map((i) => i.check_point), [...next]));
  };

  const toggleCollapse = (title: string) => {
    const next = new Set(collapsed);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    persistCollapsed(next);
  };

  // 같은 카테고리(제목) 문항끼리 묶는다. items 는 sort_order 정렬돼 오므로 제목 등장 순서가 유지된다.
  const groups = useMemo(() => {
    const m = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      const list = m.get(it.check_point) ?? [];
      list.push(it);
      m.set(it.check_point, list);
    }
    return Array.from(m, ([title, list]) => ({ title, items: list }));
  }, [items]);

  const decidedCount = items.filter((i) => isDecided(i.status)).length;
  const hasItems = serviceId && !isLoading && items.length > 0;
  const allCollapsed = groups.length > 0 && collapsed.size >= groups.length;
  const toggleAll = () => {
    const collapseAll = !allCollapsed; // true = 전체 접기
    persistCollapsed(collapseAll ? new Set(groups.map((g) => g.title)) : new Set());
  };

  return (
    <aside
      role="complementary"
      aria-label="체크리스트"
      aria-hidden={!isOpen}
      className={`fixed top-0 left-0 z-[9000] h-full w-[400px] max-w-[90vw] bg-white border-r border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">📋</span>
          <h2 className="text-base font-black text-slate-800 m-0">체크리스트</h2>
          {items.length > 0 && (
            <span className="text-[11px] font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full tabular-nums" title="판단 완료(보류 아님) / 전체">
              {decidedCount}/{items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasItems && (
            <button
              onClick={toggleAll}
              className="px-2.5 py-1 rounded-lg text-[11px] font-black text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors"
            >
              {allCollapsed ? '전체 펼치기' : '전체 접기'}
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="체크리스트 닫기"
            className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <IconX />
          </button>
        </div>
      </div>

      {/* 본문 */}
      <div
        ref={bodyRef}
        onScroll={(e) => { if (serviceId) scrollByProgram.current[serviceId] = e.currentTarget.scrollTop; }}
        className="flex-1 overflow-y-auto px-4 py-3"
      >
        {!serviceId && <EmptyHint text="프로그램을 먼저 선택해주세요." />}
        {serviceId && isLoading && <EmptyHint text="불러오는 중…" />}
        {serviceId && !isLoading && items.length === 0 && (
          <EmptyHint text="점검 항목이 없습니다." />
        )}
        {hasItems && (
          <ul className="flex flex-col gap-3 list-none p-0 m-0">
            {groups.map((group) => {
              const isExpanded = !collapsed.has(group.title);
              const decided = group.items.filter((i) => isDecided(i.status)).length;
              return (
                <li
                  key={group.title}
                  className="rounded-xl border border-slate-200 border-l-4 border-l-indigo-400 shadow-sm overflow-hidden"
                >
                  {/* 카테고리 제목 (클릭 시 그룹 접기/펼치기) */}
                  <button
                    onClick={() => toggleCollapse(group.title)}
                    aria-expanded={isExpanded}
                    className={`w-full flex items-center gap-1.5 px-3 py-2.5 text-left bg-slate-100 hover:bg-slate-200 transition-colors ${isExpanded ? 'border-b border-slate-200' : ''}`}
                  >
                    <span className="shrink-0 text-slate-400">
                      <IconChevron open={isExpanded} />
                    </span>
                    <span className="flex-1 text-[15px] font-black text-slate-900 break-words">{group.title}</span>
                    <span className="shrink-0 text-[11px] font-bold text-slate-400 tabular-nums" title="판단 완료 / 문항 수">
                      {decided}/{group.items.length}
                    </span>
                  </button>

                  {/* 문항들 (펼침 시) — 문항마다 상태 + 코멘트 */}
                  {isExpanded && (
                    <ul className="list-none p-0 m-0 divide-y divide-slate-100">
                      {group.items.map((item) => (
                        <li key={item.check_point_id} className="px-3 py-2.5 flex flex-col gap-2">
                          <p className="m-0 text-[13px] leading-relaxed text-slate-700 break-words">{item.detail}</p>
                          <div className="inline-flex self-start rounded-lg border border-slate-200 overflow-hidden">
                            {CHECKLIST_STATUSES.map((s) => (
                              <button
                                key={s}
                                onClick={() => handleSetStatus(item, s)}
                                aria-pressed={item.status === s}
                                className={`px-2.5 py-1 text-[12px] font-bold border-r border-slate-200 last:border-r-0 transition-colors ${
                                  item.status === s ? STATUS_SOLID[s] : 'bg-white text-slate-500 hover:bg-slate-50'
                                }`}
                              >
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={commentDrafts[item.check_point_id] ?? item.comment ?? ''}
                            onChange={(e) =>
                              setCommentDrafts((prev) => ({ ...prev, [item.check_point_id]: e.target.value }))
                            }
                            onBlur={() => saveComment(item)}
                            rows={2}
                            maxLength={4000}
                            placeholder="이 문항 관련 메모… (포커스 해제 시 저장)"
                            aria-label={`${item.detail ?? ''} 메모`}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};

export default Checklist;
