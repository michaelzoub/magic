import { useEffect, useRef } from 'react'
import { motion } from '@/motion'

export function LoadingBar({ loading }: { loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    loading ? motion.loadingStart(ref.current) : motion.loadingEnd(ref.current)
  }, [loading])

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] origin-left bg-[#5e6ad2] opacity-0"
    />
  )
}
