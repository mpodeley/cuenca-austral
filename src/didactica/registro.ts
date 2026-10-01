import anclas from './datos/anclas.json'
import grafo from './datos/grafo.json'
import modulos from './datos/modulos.json'

/** Una sola fuente de verdad para el panel «cómo se hizo», el esquema de arquitectura y ARCHITECTURE.md. */
export const REPO = 'https://github.com/mpodeley/cuenca-austral'

export interface Ref { archivo: string; simbolo?: string; nota?: string }
export interface Nodo extends Partial<Ref> { id: string; col: string; titulo: string; que: string; url?: string; ruta?: string }
export interface Columna { id: string; titulo: string; nota: string }
export interface Modulo {
  id: string; pantalla: string; titulo: string; queHace: string; comoSeCalcula: string[]
  linaje: string[]; codigo: Ref[]; decisiones: string[]; metodologia: number; pedido: string
}

export const COLUMNAS = grafo.columnas as Columna[]
export const NODOS = grafo.nodos as Nodo[]
export const ARISTAS = grafo.aristas as Array<[string, string]>
export const MODULOS = modulos as Modulo[]
export const nodo = (id: string) => NODOS.find(item => item.id === id)
export const modulo = (id: string | null | undefined) => MODULOS.find(item => item.id === id)

/** Link al archivo en GitHub; con símbolo, a la línea donde está definido (la calcula scripts/anclas.mjs). */
export function repoUrl(ref: { archivo?: string; simbolo?: string }): string {
  if (!ref.archivo) return REPO
  const line = ref.simbolo ? (anclas as Record<string, number>)[`${ref.archivo}#${ref.simbolo}`] : undefined
  const kind = /\.[a-z]+$/i.test(ref.archivo) ? 'blob' : 'tree'
  return `${REPO}/${kind}/main/${ref.archivo}${line ? `#L${line}` : ''}`
}

export const decisionUrl = (id: string) => `${REPO}/blob/main/DECISIONS.md#${id.toLowerCase()}`

/** Todos los nodos conectados con ``ids``, aguas arriba y aguas abajo. */
export function linajeDe(ids: string[]): Set<string> {
  const found = new Set(ids)
  const walk = (from: 0 | 1, to: 0 | 1) => {
    const queue = [...ids]
    while (queue.length) {
      const current = queue.pop()!
      for (const edge of ARISTAS) if (edge[from] === current && !found.has(edge[to])) { found.add(edge[to]); queue.push(edge[to]) }
    }
  }
  walk(1, 0); walk(0, 1)
  return found
}
