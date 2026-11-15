// DEV-ONLY review page for the hero concepts (hero-concepts.html). Not part of
// any build: vite builds index.html only. Open /hero-concepts.html?concept=a
// (or b, or current) on the dev server.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import '../index.css'
import { PublicLayout } from '../public/PublicLayout'
import { MemberLinksContext } from '../public/member-links'
import { Hero } from '../public/landing/sections/Hero'
import { Why } from '../public/landing/sections/Why'
import { SplitThePost } from '../public/landing/ui/concepts/SplitThePost'
import { SplitTheValue } from '../public/landing/ui/concepts/SplitTheValue'

const concept = new URLSearchParams(window.location.search).get('concept') ?? 'a'
const scene = concept === 'a' ? <SplitThePost /> : concept === 'b' ? <SplitTheValue /> : undefined

function Page() {
  return (
    <>
      <Hero scene={scene} sceneUnderHeadline={concept !== 'current'} />
      <Why />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MemberLinksContext.Provider value>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="*" element={<Page />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </MemberLinksContext.Provider>
  </StrictMode>,
)
