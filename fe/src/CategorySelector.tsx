import { useMemo, type FC } from 'react';
import type { ServiceInfo } from './discussionService';
import { sortBigCategories } from './config/categoryOrder';
import { resolveProgramFileName } from './methodJump';

export interface CategorySelectorProps {
  services: ServiceInfo[];
  selectedBig: string;
  selectedMiddle: string;
  selectedProgram: string; // 선택된 service_id
  onSelectBig: (big: string) => void;
  onSelectMiddle: (middle: string) => void;
  onSelectProgram: (serviceId: string) => void;
  favorites?: string[]; // 즐겨찾기된 service_id 목록
  onToggleFavorite?: (serviceId: string) => void; // 주어지면 선택된 프로그램 옆에 ☆ 토글 표시
}

/**
 * 대분류 → 중분류 → 프로그램명 3단 선택 UI (controlled).
 * 소스 비교 탭과 코멘트 모아보기 탭이 공유한다. 옵션 파생만 담당하고,
 * 선택 상태/선택 후 동작(소스 로드·스레드 로드)은 부모가 콜백으로 처리한다.
 */
const CategorySelector: FC<CategorySelectorProps> = ({
  services,
  selectedBig,
  selectedMiddle,
  selectedProgram,
  onSelectBig,
  onSelectMiddle,
  onSelectProgram,
  favorites = [],
  onToggleFavorite,
}) => {
  // 대분류 목록 (중복 제거 + 정의된 순서)
  const bigCategories = useMemo(
    () => sortBigCategories(Array.from(new Set(services.map((s) => s.big_category).filter((b): b is string => !!b)))),
    [services],
  );

  // 선택된 대분류의 중분류 목록 (중복 제거)
  const middleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of services) {
      if (selectedBig && s.big_category !== selectedBig) continue;
      if (s.middle_category) set.add(s.middle_category);
    }
    return Array.from(set);
  }, [services, selectedBig]);

  // 선택된 대/중분류의 프로그램 목록(프로그램명 오름차순).
  // 비교 말단 키인 service_id 마다 옵션 1개(묶지 않음). 표기는 그 프로그램의 pb 행에서 도출한
  // "PB소스파일명 / service_id" — 같은 PB5(대상) 파일로 이관된 서로 다른 프로그램도 각각 노출한다.
  const programOptions = useMemo(() => {
    const groups = new Map<string, { pbRow?: ServiceInfo; pb5Row?: ServiceInfo }>();
    for (const s of services) {
      if (selectedBig && s.big_category !== selectedBig) continue;
      if (selectedMiddle && s.middle_category !== selectedMiddle) continue;
      let g = groups.get(s.service_id);
      if (!g) {
        g = {};
        groups.set(s.service_id, g);
      }
      if (s.code_kind === 'pb') g.pbRow ??= s;
      else if (s.code_kind === 'pb5') g.pb5Row ??= s;
    }

    // 표기 라벨을 만들고 그 라벨 기준 오름차순 정렬. 라벨이 "PB소스파일명 / serviceId" 라
    // 사실상 PB 소스파일명 우선 정렬이 된다. 숫자는 자연순(numeric)으로 비교(ACCT2 < ACCT10).
    return Array.from(groups, ([serviceId, { pbRow, pb5Row }]) => {
      const bigCategory = (pbRow ?? pb5Row)?.big_category;
      const pbSourceName = resolveProgramFileName('pb', bigCategory, pbRow?.file_name);
      const label = pbSourceName ? `${pbSourceName} / ${serviceId}` : serviceId;
      return { serviceId, label };
    }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }, [services, selectedBig, selectedMiddle]);

  return (
    <>
      <label className="text-xs font-black whitespace-nowrap m-0 opacity-80 uppercase">유형</label>
      <select
        aria-label="유형 선택"
        className="flex-[0.7] min-w-[4.5rem] p-2 border-0 rounded bg-white text-gray-900 text-sm font-semibold focus:ring-4 focus:ring-indigo-300 outline-none"
        onChange={(e) => onSelectBig(e.target.value)}
        value={selectedBig}
      >
        <option value="" disabled>유형을 선택하세요</option>
        {bigCategories.map((big) => (
          <option key={big} value={big}>{big}</option>
        ))}
      </select>
      <label className="text-xs font-black whitespace-nowrap m-0 opacity-80 uppercase">업무</label>
      <select
        aria-label="업무 선택"
        className="flex-[0.7] min-w-[4.5rem] p-2 border-0 rounded bg-white text-gray-900 text-sm font-semibold focus:ring-4 focus:ring-indigo-300 outline-none disabled:bg-gray-300 disabled:text-gray-500"
        onChange={(e) => onSelectMiddle(e.target.value)}
        value={selectedMiddle}
        disabled={!selectedBig}
      >
        <option value="" disabled>업무를 선택하세요</option>
        {middleOptions.map((middle) => (
          <option key={middle} value={middle}>{middle}</option>
        ))}
      </select>
      <label className="text-xs font-black whitespace-nowrap m-0 opacity-80 uppercase">프로그램명</label>
      <select
        aria-label="프로그램명 선택"
        className="flex-[2.6] p-2 border-0 rounded bg-white text-gray-900 text-sm font-semibold focus:ring-4 focus:ring-indigo-300 outline-none disabled:bg-gray-300 disabled:text-gray-500"
        onChange={(e) => onSelectProgram(e.target.value)}
        value={selectedProgram}
        disabled={!selectedMiddle}
      >
        <option value="" disabled>프로그램명을 선택하세요</option>
        {programOptions.map(({ serviceId, label }) => (
          <option key={serviceId} value={serviceId}>{label}</option>
        ))}
      </select>
      {onToggleFavorite && selectedProgram && (
        <button
          type="button"
          onClick={() => onToggleFavorite(selectedProgram)}
          aria-pressed={favorites.includes(selectedProgram)}
          aria-label={favorites.includes(selectedProgram) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          title={favorites.includes(selectedProgram) ? '즐겨찾기 해제' : '즐겨찾기 추가'}
          className={`shrink-0 px-2 py-2 rounded-lg text-lg leading-none transition-colors ${favorites.includes(selectedProgram) ? 'text-amber-300' : 'text-white/50 hover:text-white'}`}
        >
          {favorites.includes(selectedProgram) ? '★' : '☆'}
        </button>
      )}
    </>
  );
};

export default CategorySelector;
