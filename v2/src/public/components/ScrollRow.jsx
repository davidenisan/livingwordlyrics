import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Horizontally scrolling row with arrow buttons on pointer devices and native
// swipe on touch screens.
export default function ScrollRow({ label, children }) {
  const track = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const update = useCallback(() => {
    const el = track.current
    if (!el) return
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }, [])

  useEffect(() => {
    update()
    const el = track.current
    if (!el) return undefined
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [update, children])

  const scrollBy = (direction) => {
    const el = track.current
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <div className="scroll-row">
      <button className="scroll-arrow scroll-arrow-left" type="button" aria-label={`Scroll ${label} left`} disabled={edges.start} onClick={() => scrollBy(-1)}>
        <ChevronLeft size={18} />
      </button>
      <div className="scroll-track" ref={track} role="list" aria-label={label}>
        {children}
      </div>
      <button className="scroll-arrow scroll-arrow-right" type="button" aria-label={`Scroll ${label} right`} disabled={edges.end} onClick={() => scrollBy(1)}>
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
