import { useEffect, useState } from 'react'

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches)
  useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return matches
}

export const useNarrow = () => useMedia('(max-width: 640px)')
export const useCoarsePointer = () => useMedia('(pointer: coarse)')
