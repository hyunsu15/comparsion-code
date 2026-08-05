import { type FC } from 'react';

// 유형/업무 필터 칩 — 통일된 단일 스타일(밝은 배경). 활성=indigo-600, 비활성=흰 배경+테두리.
const chip = (on: boolean) =>
  `px-2.5 py-1 rounded-lg text-[12px] font-black border transition-all whitespace-nowrap ${
    on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
  }`;

export interface CategoryChipsProps {
  typeOptions: string[]; // 유형(big_category) 목록
  workOptions: string[]; // 업무(middle_category) 목록 (보통 선택 유형 기준으로 좁혀 전달)
  selectedType: string; // '' = 전체
  selectedWork: string; // '' = 전체
  onSelectType: (t: string) => void;
  onSelectWork: (w: string) => void;
  labelWidthClass?: string; // 라벨 너비(세로 정렬 맞춤용). 기본 w-9.
}

/**
 * 유형/업무 칩 필터 — 캐스케이드 없이 동등 선택, '전체' 내장.
 * 체크리스트 모아보기·의견 모아보기가 공유해 두 탭의 선택 UI를 동일하게 보장한다.
 */
const CategoryChips: FC<CategoryChipsProps> = ({
  typeOptions,
  workOptions,
  selectedType,
  selectedWork,
  onSelectType,
  onSelectWork,
  labelWidthClass = 'w-9',
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[11px] font-black text-slate-500 ${labelWidthClass} shrink-0`}>유형</span>
      <button type="button" onClick={() => onSelectType('')} aria-pressed={!selectedType} className={chip(!selectedType)}>전체</button>
      {typeOptions.map((t) => (
        <button key={t} type="button" onClick={() => onSelectType(t)} aria-pressed={selectedType === t} className={chip(selectedType === t)}>{t}</button>
      ))}
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[11px] font-black text-slate-500 ${labelWidthClass} shrink-0`}>업무</span>
      <button type="button" onClick={() => onSelectWork('')} aria-pressed={!selectedWork} className={chip(!selectedWork)}>전체</button>
      {workOptions.map((w) => (
        <button key={w} type="button" onClick={() => onSelectWork(w)} aria-pressed={selectedWork === w} className={chip(selectedWork === w)}>{w}</button>
      ))}
    </div>
  </div>
);

export default CategoryChips;
