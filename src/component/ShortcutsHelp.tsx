import type { FC } from 'react';

interface ShortcutsHelpProps {
  open: boolean;
  onToggle: () => void;
  includeSql?: boolean; // PB5 패널: 매퍼 호출 줄 안내 한 줄 추가
}

const BASE_SHORTCUTS: [string, string][] = [
  ['클릭', '메서드 접기/펴기'],
  ['Alt+클릭', '정의로 점프'],
  ['Shift+클릭', '댓글 달기'],
];
const SQL_SHORTCUT: [string, string] = ['매퍼 호출 줄 클릭', '대응 SQL 보기'];

/**
 * 코드 패널 헤더의 조작 단축키 도움말. "?" 를 눌러 펼침/접힘을 토글한다.
 * 열림 상태와 저장은 부모(CodeComparator)가 관리한다(두 패널 공유 + localStorage).
 */
const ShortcutsHelp: FC<ShortcutsHelpProps> = ({ open, onToggle, includeSql }) => {
  const items = includeSql ? [...BASE_SHORTCUTS, SQL_SHORTCUT] : BASE_SHORTCUTS;
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="조작 단축키 도움말 펼치기/접기"
        title="조작 단축키 도움말"
        className="w-4 h-4 grid place-items-center rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-bold cursor-pointer select-none transition-colors"
      >?</button>
      {open && (
        <div
          role="region"
          aria-label="조작 단축키"
          className="absolute right-0 top-full mt-1 z-30 w-max bg-white text-slate-700 rounded-lg shadow-xl border border-slate-200 p-2 font-sans normal-case tracking-normal"
        >
          {items.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-2 whitespace-nowrap py-0.5">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] text-slate-600">{key}</kbd>
              <span className="text-[11px] font-bold text-slate-500">{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ShortcutsHelp;
