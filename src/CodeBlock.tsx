import { useEffect, useState } from 'react';

type CodeBlockProps = {
  code: string;
  lang: string;
  onHighlight?: () => void;
  fontSize?: number;
};

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
      ],
      engine: engine.createJavaScriptRegexEngine(),
    }));

    return highlighterPromise;
  };
})();

export default function CodeBlock({ code, lang, onHighlight, fontSize = 15 }: CodeBlockProps) {
  const [html, setHtml] = useState<string>('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const highlight = async () => {
      setHtml('');
      setHasError(false);

      try {
        const highlighter = await getHighlighter();
        const generatedHtml = highlighter.codeToHtml(code, {
          lang: normalizeLang(lang),
          theme: 'github-light',
          transformers: [
            {
              line(node, line) {
                node.properties['data-line'] = line;
              },
            },
          ],
        });

        if (isMounted) setHtml(generatedHtml);
      } catch (error) {
        console.error('Shiki error:', error);
        if (isMounted) setHasError(true);
      }
    };

    highlight();

    return () => {
      isMounted = false;
    };
  }, [code, lang]);

  useEffect(() => {
    if (html) onHighlight?.();
  }, [html, onHighlight]);

  return (
    <div
      style={{ 
        '--code-font-size': `${fontSize}px`,
        fontSize: `${fontSize}px` // 자식 요소들이 상속받을 수 있도록 기본 폰트 크기 설정
      } as React.CSSProperties}
      className="
      w-max min-w-full
[&_pre]:!bg-transparent
[&_pre]:m-0
[&_pre]:p-4
[&_pre]:overflow-visible
[&_pre]:!text-[length:var(--code-font-size)] // Shiki 생성 pre 태그 폰트 강제 적용

[&_code]:flex
[&_code]:flex-col
[&_code]:!text-[length:var(--code-font-size)] // Shiki 생성 code 태그 폰트 강제 적용

[&_.line]:flex
[&_.line]:min-h-[1.4em] // 폰트 크기에 따라 유동적으로 높이 조절
[&_.line]:w-full
[&_.line]:text-[length:var(--code-font-size)]

[&_.line::before]:content-[attr(data-line)]
[&_.line::before]:inline-block
[&_.line::before]:w-10
[&_.line::before]:mr-4
[&_.line::before]:text-right
[&_.line::before]:text-gray-400
[&_.line::before]:select-none
[&_.line::before]:border-r
[&_.line::before]:border-gray-200
[&_.line::before]:pr-2
      "
    >
      {html && !hasError ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="p-4 opacity-50 whitespace-pre w-max">{code}</pre>
      )}
    </div>
  );
}
