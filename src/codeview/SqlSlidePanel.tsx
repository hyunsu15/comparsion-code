import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import CodeBlock, { type CodeBlockHandle } from './CodeBlock';
import type { CodeLang } from '../Link';

interface SqlSlidePanelProps {
  open: boolean;
  side: 'left' | 'right';
  fileName: string;
  content: string | null;
  lang: CodeLang;
  line: number; // 열릴 때 스크롤할 줄(1-base)
  fontSize: number;
  headerClass: string; // 헤더 배경(리터럴): 'bg-indigo-600' / 'bg-emerald-600'
  onClose: () => void;
}

/**
 * SQL 보기 전체보기 슬라이드 패널(PB .pc 좌 / PB5 XML 우 공용).
 * 폭(드래그 리사이즈)·줄 스크롤·슬라이드 위치를 자체 관리한다.
 */
const SqlSlidePanel: FC<SqlSlidePanelProps> = ({ open, side, fileName, content, lang, line, fontSize, headerClass, onClose }) => {
  const ref = useRef<CodeBlockHandle>(null);
  const [highlight, setHighlight] = useState(0);
  const [width, setWidth] = useState(720); // 패널 폭(px). 안쪽 가장자리 드래그로 조절.
  const resizing = useRef(false);
  // onHighlight 는 안정적 참조여야 한다. 인라인으로 넘기면 CodeBlock 의 useEffect 가 매 렌더 재실행→무한 루프.
  const handleHighlight = useCallback(() => setHighlight((n) => n + 1), []);

  useEffect(() => {
    if (!open) return;
    ref.current?.scrollToLine(line);
  }, [open, line, highlight]);
  // 참고: ESC 닫기는 상위 CodeComparator 의 중앙 ESC 핸들러가 우선순위 순서로 처리한다
  //       (sqlPanel/sqlPanelPb). 여기서 별도 window 리스너를 두면 '한 번에 하나' 규칙이 깨진다.

  // 가로 리사이즈: 안쪽 가장자리 드래그. left 패널은 마우스X가 곧 폭, right 패널은 (창너비-마우스X)가 폭.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const raw = side === 'left' ? e.clientX : window.innerWidth - e.clientX;
      setWidth(Math.max(320, Math.min(raw, window.innerWidth * 0.85)));
    };
    const onUp = () => { resizing.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [side]);

  // Tailwind JIT 는 완성 리터럴만 인식 → side 를 클래스명에 보간하지 말고 리터럴로 분기.
  const posClass = side === 'left' ? 'left-0 border-r' : 'right-0 border-l';
  const hiddenClass = side === 'left' ? '-translate-x-full' : 'translate-x-full';
  const handlePos = side === 'left' ? 'right-0' : 'left-0';

  return (
    <div
      className={`fixed top-0 ${posClass} h-full bg-white shadow-2xl z-[125] border-slate-200 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : hiddenClass}`}
      style={{ width: `${width}px` }}
      aria-hidden={!open}
    >
      {/* 가로 리사이즈 핸들(안쪽 가장자리) */}
      <div
        onMouseDown={(e) => { e.preventDefault(); resizing.current = true; }}
        className={`absolute top-0 ${handlePos} h-full w-1.5 cursor-col-resize hover:bg-indigo-300/50 z-10`}
        role="separator"
        aria-orientation="vertical"
        aria-label="패널 너비 조절"
      />
      <div className={`flex items-center justify-between px-4 py-3 ${headerClass} text-white flex-shrink-0`}>
        <span className="font-black text-sm truncate">📄 {fileName}</span>
        <button onClick={onClose} aria-label="패널 닫기" className="w-8 h-8 rounded-full hover:bg-black/20 flex items-center justify-center text-xl leading-none">&times;</button>
      </div>
      <div className="flex-1 min-h-0 relative font-mono">
        {open && content && (
          <div className="absolute inset-0">
            <CodeBlock ref={ref} code={content} lang={lang} fontSize={fontSize} onHighlight={handleHighlight} />
          </div>
        )}
      </div>
    </div>
  );
};

export default SqlSlidePanel;
