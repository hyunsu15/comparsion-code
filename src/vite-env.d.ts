/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 백엔드 API base URL (예: http://localhost:50004) */
  readonly VITE_API_BASE_URL: string;
  /** 운영 대분류명(민감, 여러 개는 콤마로 나열) — categoryMap 에서 parser 클래스이름별 Set 으로 사용. 미설정 시 개발 폴백. */
  readonly VITE_Pb5ClassImplMethodParser: string;
  readonly VITE_Pb5ClassImplParser: string;
  readonly VITE_Pb5XmlParser: string;
  readonly VITE_PbSqlParser: string;
  readonly VITE_Pb5ServiceParser: string;
  readonly VITE_PbServiceParser: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
