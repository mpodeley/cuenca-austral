// Busca en qué línea está cada función citada por la capa didáctica y escribe
// src/didactica/datos/anclas.json. También genera ARCHITECTURE.md desde el mismo grafo.
// Corre antes de dev, build y test: los links al repo siempre caen en la función.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const read = name => JSON.parse(readFileSync(`${root}src/didactica/datos/${name}.json`, 'utf8'))
const grafo = read('grafo'), modulos = read('modulos')

const refs = [...grafo.nodos, ...modulos.flatMap(modulo => modulo.codigo)].filter(ref => ref.archivo)
const anclas = {}, errores = []
for (const { archivo, simbolo } of refs) {
  if (!existsSync(root + archivo)) { errores.push(`no existe ${archivo}`); continue }
  if (!simbolo) continue
  const pattern = new RegExp(`^\\s*(export\\s+)?(async\\s+)?(def|class|function|const|interface|type)\\s+${simbolo}\\b`)
  const line = readFileSync(root + archivo, 'utf8').split('\n').findIndex(text => pattern.test(text))
  if (line < 0) errores.push(`no se encuentra ${simbolo} en ${archivo}`)
  else anclas[`${archivo}#${simbolo}`] = line + 1
}
if (errores.length) { console.error('Anclas rotas:\n  ' + errores.join('\n  ')); process.exit(1) }
const sorted = Object.fromEntries(Object.entries(anclas).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(`${root}src/didactica/datos/anclas.json`, JSON.stringify(sorted, null, 1) + '\n')

const link = ref => `[\`${ref.archivo}\`](${ref.archivo}${ref.simbolo ? `#L${anclas[`${ref.archivo}#${ref.simbolo}`]}` : ''})`
const titulo = Object.fromEntries(grafo.nodos.map(nodo => [nodo.id, nodo.titulo]))
const md = [
  '# Arquitectura', '',
  '> Generado por `scripts/anclas.mjs` desde `src/didactica/datos/`. No editar a mano.', '',
  'La versión interactiva está en la app: https://mpodeley.github.io/cuenca-austral/#/como-se-hizo/arquitectura', '',
  '```mermaid', 'flowchart LR',
  ...grafo.columnas.map(columna => [`  subgraph ${columna.id}["${columna.titulo}"]`, ...grafo.nodos.filter(nodo => nodo.col === columna.id).map(nodo => `    ${nodo.id}["${nodo.titulo}"]`), '  end']).flat(),
  ...grafo.aristas.map(([desde, hasta]) => `  ${desde} --> ${hasta}`),
  '```', '',
  ...grafo.columnas.map(columna => [`## ${columna.titulo}`, '', columna.nota + '.', '', ...grafo.nodos.filter(nodo => nodo.col === columna.id).map(nodo => `- **${nodo.titulo}** — ${nodo.que}${nodo.archivo ? ` ${link(nodo)}` : nodo.url ? ` [fuente](${nodo.url})` : ''}`), '']).flat(),
  '## Módulos de la app', '',
  'Cada módulo de la app tiene un botón «cómo se hizo» que abre esta misma información.', '',
  '| Módulo | Qué hace | Recorrido del dato | Código |', '| --- | --- | --- | --- |',
  ...modulos.map(modulo => `| ${modulo.titulo} | ${modulo.queHace} | ${modulo.linaje.map(id => titulo[id]).join(' → ')} | ${modulo.codigo.map(ref => `${link(ref)}${ref.simbolo ? ` \`${ref.simbolo}\`` : ''}`).join('<br>')} |`),
  '',
].join('\n')
writeFileSync(`${root}ARCHITECTURE.md`, md)
console.log(`anclas: ${Object.keys(sorted).length} símbolos en ${new Set(refs.map(ref => ref.archivo)).size} archivos`)
