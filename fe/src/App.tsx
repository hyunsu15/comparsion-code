import { useEffect, useRef, useState } from 'react'
import CodeComparator from './codeview/CodeComparator'
import type { NavRequest } from './codeview/CodeComparator'
import CommentBoard from './discussion/CommentBoard'
import ChecklistBoard from './checklist/ChecklistBoard'
import { discussionService } from './discussionService'
import type { ServiceInfo, CodeKind } from './discussionService'
import { loadFavorites, saveFavorites, toggleFavorite } from './favorites'
import './App.css'

type Tab = 'compare' | 'comments' | 'checklist'

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('compare')
  const [services, setServices] = useState<ServiceInfo[]>([])
  const [navRequest, setNavRequest] = useState<NavRequest | null>(null)
  const nonceRef = useRef(0)
  const [favorites, setFavorites] = useState<string[]>(loadFavorites)

  // 즐겨찾기 토글 — localStorage 저장. App 이 쥐고 props 로 내려 모든 탭이 동기화된다.
  const handleToggleFavorite = (serviceId: string) => {
    setFavorites((prev) => {
      const next = toggleFavorite(prev, serviceId)
      saveFavorites(next)
      return next
    })
  }

  // 모아보기 탭용 서비스 카탈로그 (소스 비교 탭은 자체 로드)
  useEffect(() => {
    discussionService.getServices()
      .then(setServices)
      .catch((e) => console.error('Failed to load services:', e))
  }, [])

  // 모아보기 → 소스 비교 점프: 같은 좌표 재요청도 트리거되도록 nonce 증가
  const handleNavigate = (req: { serviceId: string; line: number; codeKind: CodeKind }) => {
    nonceRef.current += 1
    setNavRequest({ ...req, nonce: nonceRef.current })
    setActiveTab('compare')
  }

  const tabClass = (tab: Tab) =>
    `px-6 py-2 rounded-lg text-sm font-black transition-all ${
      activeTab === tab ? 'bg-white text-indigo-700 shadow-sm' : 'text-white/70 hover:text-white'
    }`

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <nav className="flex items-center gap-1 bg-indigo-700 px-3 py-2 flex-shrink-0 shadow-md">
        <button onClick={() => setActiveTab('compare')} aria-pressed={activeTab === 'compare'} className={tabClass('compare')}>소스 비교</button>
        <button onClick={() => setActiveTab('comments')} aria-pressed={activeTab === 'comments'} className={tabClass('comments')}>의견 모아보기</button>
        <button onClick={() => setActiveTab('checklist')} aria-pressed={activeTab === 'checklist'} className={tabClass('checklist')}>체크리스트 모아보기</button>
      </nav>
      {/* 모든 탭을 마운트한 채 display 토글 → 탭 전환에도 각 화면 상태가 유지된다 */}
      <div className="flex-1 min-h-0 relative">
        <div className="absolute inset-0" style={{ display: activeTab === 'compare' ? 'block' : 'none' }}>
          <CodeComparator navRequest={navRequest} favorites={favorites} onToggleFavorite={handleToggleFavorite} />
        </div>
        <div className="absolute inset-0" style={{ display: activeTab === 'comments' ? 'block' : 'none' }}>
          <CommentBoard active={activeTab === 'comments'} services={services} onNavigate={handleNavigate} favorites={favorites} onToggleFavorite={handleToggleFavorite} />
        </div>
        <div className="absolute inset-0" style={{ display: activeTab === 'checklist' ? 'block' : 'none' }}>
          <ChecklistBoard active={activeTab === 'checklist'} services={services} onNavigate={handleNavigate} />
        </div>
      </div>
    </div>
  )
}

export default App
