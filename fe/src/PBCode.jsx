'use client';

import React, { useMemo } from 'react';
import CodeBlock from './codeview/CodeBlock';

const getLangFromFileName = (fileName) => {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'c':
      return 'c';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'java':
      return 'java';
    case 'js':
      return 'javascript';
    case 'json':
      return 'json';
    case 'jsx':
      return 'jsx';
    case 'ts':
      return 'typescript';
    case 'tsx':
      return 'tsx';
    default:
      return 'text';
  }
};

const trimBlankEdges = (value) => value.replace(/^\s*\n/, '').replace(/\n\s*$/, '');

const parsePbCode = (srcListTab) => {
  if (!srcListTab) {
    return {
      code: '',
      fileName: '',
      lang: 'text',
    };
  }

  const doc = new DOMParser().parseFromString(srcListTab, 'text/html');
  const fileName = doc.querySelector('.file-name')?.textContent?.trim() ?? '';
  const code = doc.querySelector('pre code')?.textContent
    ?? doc.querySelector('code')?.textContent
    ?? doc.querySelector('pre')?.textContent
    ?? srcListTab;

  return {
    code: trimBlankEdges(code),
    fileName,
    lang: getLangFromFileName(fileName),
  };
};

function PBCode({ srcListTab }) {
  const { code, fileName, lang } = useMemo(
    () => parsePbCode(srcListTab),
    [srcListTab],
  );

  return (
    <div className="rounded border bg-white w-full">
      {fileName && (
        <div className="border-b bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
          {fileName}
        </div>
      )}
      <CodeBlock code={code} lang={lang} />
    </div>
  );
}

export default PBCode;
