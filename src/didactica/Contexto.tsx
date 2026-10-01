import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

interface Didactica { abierto: string | null; abrir: (id: string) => void; cerrar: () => void; clase: boolean; setClase: (on: boolean) => void }

const Ctx = createContext<Didactica>({ abierto: null, abrir: () => {}, cerrar: () => {}, clase: false, setClase: () => {} })
export const useDidactica = () => useContext(Ctx)

const KEY = 'cuenca-austral:modo-clase'
/** El panel abierto viaja en el hash como ?como=<id>: un link puede abrirlo directamente en clase. */
export const comoDe = (hash: string) => new URLSearchParams(hash.split('?')[1] ?? '').get('como')

export function DidacticaProvider({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState<string | null>(() => comoDe(window.location.hash))
  const [clase, setClaseState] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })

  useEffect(() => {
    const sync = () => setAbierto(comoDe(window.location.hash))
    window.addEventListener('hashchange', sync); window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])

  const write = useCallback((id: string | null) => {
    const base = window.location.hash.split('?')[0] || '#/mapa'
    window.history.replaceState(null, '', id ? `${base}?como=${id}` : base)
    setAbierto(id)
  }, [])
  const setClase = useCallback((on: boolean) => { setClaseState(on); try { localStorage.setItem(KEY, on ? '1' : '0') } catch { /* modo privado */ } }, [])

  const value = useMemo(() => ({ abierto, abrir: (id: string) => write(id), cerrar: () => write(null), clase, setClase }), [abierto, clase, write, setClase])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
