export type Fluid = 'gas' | 'oil'
export type Confidence = 'alta' | 'media' | 'baja'

export interface Envelope<T> { generated_at: string; source: string; source_date: string; data: T }

export interface WellFluid {
  pico: number; q: number; eur: number; eur_lo: number; eur_hi: number; metodo: string; conf: Confidence
  qi: number | null; di: number | null; b: number | null; r2: number | null; t0: number | null; ajuste_ok: boolean
}

export interface Well {
  id: string; sigla: string; empresa: string; area: string; cod_area: string; yacimiento: string; provincia: string
  formacion: string; estado: string; tipo: string; extraccion: string; recurso: string; profundidad: number | null
  lon: number | null; lat: number | null; offshore: boolean | null; ult_declaracion: string
  m0: string | null; campana: number | null; pre2006: boolean; ult_produccion: string | null; activo: boolean; fluido: Fluid | null
  cum_gas?: number; cum_oil?: number; cum_agua?: number; gas?: WellFluid; oil?: WellFluid
}

export interface BlockFluid { q: number; cum: number; eur: number; eur_lo: number; eur_hi: number; agotado: number | null; pico: number; pico_mes: string | null }

export interface Block {
  nombre: string; codigo: string; operador: string; provincia: string; offshore: boolean; n_offshore: number
  area_km2: number | null; geometria: 'oficial' | 'derivada' | null
  n_pozos: number; n_productores: number; n_activos: number; campana_min: number | null; campana_max: number | null
  pozos_5a: number; ritmo: number; fluido: Fluid | null; formacion: string; datos_hasta: string; etapa: string
  gas: BlockFluid; oil: BlockFluid
}

export interface Concession { nombre: string; operador: string; geometria: 'oficial' | 'derivada'; con_datos: boolean; area_km2?: number; p: number[][][][] }
export interface MapContext { bbox: number[]; tierra: number[][][]; limites: number[][][]; cuenca: number[][][][] }

export interface WellSeries { m0: number; gas: number[]; oil: number[]; agua: number[] }
export interface SeriesFile { t0: string; n: number; wells: Record<string, WellSeries> }

export interface TypeProfile { p50: number[]; k_bajo: number; k_alto: number; n: number; origen: string; eur: number }
export interface FieldForecast {
  hist_gas: number[]; hist_oil: number[]; hist_agua: number[]; activos: number[]; base_gas: number[]; base_oil: number[]
  tipo: Record<Fluid, TypeProfile | null>; pozos_anio: Record<string, number>; ritmo: number; fluido: Fluid | null; offshore: boolean; operador: string
}
export interface ForecastFile {
  t0: string; n: number; meses: number
  cuenca: { hist_gas: number[]; hist_oil: number[]; hist_agua: number[]; activos: number[]; pozos_anio: Record<string, number> }
  campos: Record<string, FieldForecast>
}
