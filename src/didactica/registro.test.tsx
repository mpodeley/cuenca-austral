import { existsSync, readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import anclas from './datos/anclas.json'
import hitos from './datos/proceso.json'
import tokens from './datos/tokens.json'
import { DidacticaProvider, comoDe } from './Contexto'
import { Drawer } from './Drawer'
import { ARISTAS, COLUMNAS, MODULOS, NODOS, linajeDe, repoUrl } from './registro'
import { Panel } from '../components/ui'
import { parseRoute } from '../App'

const ids = new Set(NODOS.map(nodo => nodo.id))
const refs = [...NODOS, ...MODULOS.flatMap(modulo => modulo.codigo)].filter(ref => ref.archivo)

describe('registro didáctico', () => {
  it('cada archivo citado existe en el repositorio', () => {
    expect(refs.filter(ref => !existsSync(ref.archivo!)).map(ref => ref.archivo)).toEqual([])
  })
  it('cada función citada tiene su línea, y la línea la contiene', () => {
    for (const ref of refs.filter(item => item.simbolo)) {
      const line = (anclas as Record<string, number>)[`${ref.archivo}#${ref.simbolo}`]
      expect(line, `${ref.archivo}#${ref.simbolo}`).toBeGreaterThan(0)
      expect(readFileSync(ref.archivo!, 'utf8').split('\n')[line - 1]).toContain(ref.simbolo)
    }
  })
  it('los linajes y las aristas apuntan a nodos reales, y cada nodo a una columna', () => {
    expect(MODULOS.flatMap(modulo => modulo.linaje).filter(id => !ids.has(id))).toEqual([])
    expect(ARISTAS.flat().filter(id => !ids.has(id))).toEqual([])
    expect(NODOS.filter(nodo => !COLUMNAS.some(col => col.id === nodo.col))).toEqual([])
  })
  it('las decisiones citadas están en DECISIONS.md y los pedidos en el proceso', () => {
    const decisions = readFileSync('DECISIONS.md', 'utf8')
    for (const modulo of MODULOS) {
      for (const id of modulo.decisiones) expect(decisions, id).toContain(`## ${id} `)
      expect(hitos.some(hito => hito.id === modulo.pedido), modulo.pedido).toBe(true)
    }
  })
  it('cada módulo con botón en la app está en el registro, y al revés', () => {
    const used = new Set<string>()
    for (const file of ['App.tsx', 'components/Mapa.tsx', 'components/Campos.tsx', 'components/Pozos.tsx', 'components/Pronostico.tsx']) {
      for (const match of readFileSync(`src/${file}`, 'utf8').matchAll(/(?:como|ComoBoton id)="([a-z-]+)"/g)) used.add(match[1])
    }
    expect([...used].sort()).toEqual(MODULOS.map(modulo => modulo.id).sort())
  })
  it('cada etapa del proceso con tokens existe en el resumen', () => {
    for (const hito of hitos) if (hito.etapa) expect(tokens.etapas, hito.etapa).toHaveProperty(hito.etapa)
  })
  it('el linaje de un nodo incluye lo que lo alimenta y lo que alimenta', () => {
    const linaje = linajeDe(['n_tipo'])
    expect(linaje.has('f_capiv')).toBe(true)
    expect(linaje.has('v_campo')).toBe(true)
    expect(linaje.has('v_pron')).toBe(false)
    expect(linajeDe(['f_conc']).has('f_capiv')).toBe(false)
  })
  it('los links van al archivo y a la línea', () => {
    expect(repoUrl({ archivo: 'pipeline/arps.py', simbolo: 'fit' })).toMatch(/blob\/main\/pipeline\/arps\.py#L\d+$/)
    expect(repoUrl({ archivo: 'data/store/geo' })).toMatch(/tree\/main\/data\/store\/geo$/)
  })
})

describe('panel «cómo se hizo»', () => {
  const ui = () => render(<DidacticaProvider><Panel title="Historia" como="campo-historia">contenido</Panel><Drawer go={() => {}} /></DidacticaProvider>)

  it('se abre desde el botón del módulo, deja el id en la dirección y cierra con Escape', () => {
    window.location.hash = '#/campo'
    ui()
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /cómo se hizo/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Historia de producción')
    expect(comoDe(window.location.hash)).toBe('campo-historia')
    expect(dialog.querySelector('a[href*="pipeline/build_data.py#L"]')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe('#/campo')
  })
  it('un link con ?como= lo abre directamente y no rompe la ruta', () => {
    window.location.hash = '#/pozos/123?como=pozo-ficha'
    ui()
    expect(screen.getByRole('dialog')).toHaveTextContent('Ficha del pozo')
    expect(parseRoute(window.location.hash)).toEqual({ tab: 'pozos', id: '123' })
  })
})
