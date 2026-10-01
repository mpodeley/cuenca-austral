"""Declinación de Arps por pozo: ajuste, proyección y EUR con banda.

Todas las tasas son promedios mensuales por día calendario; el tiempo se mide
en meses desde el pico. Los supuestos están arriba, a la vista, y se repiten en
la pestaña Metodología de la app.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.optimize import curve_fit

MIN_POINTS = 12          # meses con producción desde el pico para intentar un ajuste
PEAK_WINDOW = 24         # el pico se busca en los primeros meses de la serie
B_MAX = 1.0              # pozos convencionales: entre exponencial (b→0) y armónica (b=1)
DI_BOUNDS = (0.001, 0.6)  # declinación inicial nominal, 1/mes
R2_MIN = 0.30            # por debajo, el ajuste se descarta
DMIN_ANNUAL = 0.08       # declinación terminal efectiva
DEFAULT_ANNUAL = 0.12    # declinación exponencial si no hay ajuste aceptable
HORIZON = 360            # meses máximos de cola para el EUR
Q_ECON = {"gas": 1.0, "oil": 0.3}  # límite económico: Mm³/d de gas, m³/d de petróleo
DAYS = 30.4375
MC_DRAWS = 200

DMIN = -math.log(1 - DMIN_ANNUAL) / 12
DDEFAULT = -math.log(1 - DEFAULT_ANNUAL) / 12


def hyperbolic(t: np.ndarray, qi: float, di: float, b: float) -> np.ndarray:
    return qi / np.power(1 + b * di * t, 1 / b)


def fit(rates: np.ndarray) -> dict[str, Any] | None:
    """Ajusta una hiperbólica desde el pico. Devuelve ``None`` si no hay datos suficientes."""
    if len(rates) == 0 or rates.max() <= 0:
        return None
    t0 = int(np.argmax(rates[:PEAK_WINDOW]))
    tail = rates[t0:]
    mask = tail > 0
    if mask.sum() < MIN_POINTS:
        return None
    t = np.arange(len(tail), dtype=float)[mask]
    q = tail[mask]
    peak = float(tail[0])
    try:
        params, covariance = curve_fit(
            hyperbolic, t, q, p0=(peak, 0.05, 0.5),
            bounds=([0.3 * peak, DI_BOUNDS[0], 0.01], [3 * peak, DI_BOUNDS[1], B_MAX]), maxfev=4000,
        )
    except (RuntimeError, ValueError):
        return None
    residual = q - hyperbolic(t, *params)
    total = float(((q - q.mean()) ** 2).sum())
    r2 = 1 - float((residual ** 2).sum()) / total if total > 0 else 0.0
    qi, di, b = (float(value) for value in params)
    return {
        "qi": qi, "di": di, "b": b, "r2": r2, "t0": t0, "n": int(mask.sum()),
        "ok": r2 >= R2_MIN, "cov": covariance[1:, 1:] if np.all(np.isfinite(covariance)) else None,
    }


def project(q_last: float, t_last: float, months: int, di: float | None = None, b: float | None = None) -> np.ndarray:
    """Tasas de los ``months`` meses siguientes al último dato.

    Con ``di`` y ``b`` sigue la hiperbólica ajustada, anclada en la última tasa
    real, hasta que la declinación cae a la terminal; desde ahí es exponencial.
    Sin ajuste usa la exponencial por defecto.
    """
    out = np.zeros(months)
    q = q_last
    for k in range(months):
        if di is None or b is None:
            decline = DDEFAULT
        else:
            decline = max(di / (1 + b * di * (t_last + k)), DMIN)
        q *= math.exp(-decline)
        out[k] = q
    return out


def tail_volume(q_last: float, t_last: float, fluid: str, di: float | None, b: float | None) -> float:
    rates = project(q_last, t_last, HORIZON, di, b)
    below = np.nonzero(rates < Q_ECON[fluid])[0]
    if len(below):
        rates = rates[: below[0]]
    return float(rates.sum() * DAYS)


def eur(rates: np.ndarray, cumulative: float, active: bool, fluid: str, fitted: dict[str, Any] | None, seed: int) -> dict[str, Any]:
    """EUR = acumulada + cola. ``cumulative`` y el resultado van en las unidades de volumen de ``rates`` × día."""
    positive = rates[rates > 0]
    if not active or len(positive) == 0:
        return {"eur": cumulative, "lo": cumulative, "hi": cumulative, "metodo": "sin cola (pozo inactivo)", "conf": "alta"}
    q_last = float(np.median(positive[-3:]))
    good = bool(fitted and fitted["ok"])
    if not good:
        tail = tail_volume(q_last, 0, fluid, None, None)
        return {"eur": cumulative + tail, "lo": cumulative + 0.6 * tail, "hi": cumulative + 1.5 * tail,
                "metodo": "exponencial por defecto", "conf": "baja"}
    t_last = len(rates) - 1 - fitted["t0"]
    tail = tail_volume(q_last, t_last, fluid, fitted["di"], fitted["b"])
    low, high = 0.75 * tail, 1.25 * tail
    metodo = "±25 % (ajuste sin covarianza)"
    if fitted["cov"] is not None:
        rng = np.random.default_rng(seed)
        draws = rng.multivariate_normal([fitted["di"], fitted["b"]], fitted["cov"], size=MC_DRAWS)
        tails = [
            tail_volume(q_last, t_last, fluid, float(np.clip(di, *DI_BOUNDS)), float(np.clip(b, 0.01, B_MAX)))
            for di, b in draws
        ]
        low, high = float(np.percentile(tails, 10)), float(np.percentile(tails, 90))
        metodo = "Monte Carlo del ajuste"
    conf = "alta" if fitted["r2"] >= 0.8 and fitted["n"] >= 36 else "media" if fitted["r2"] >= 0.5 and fitted["n"] >= 18 else "baja"
    return {"eur": cumulative + tail, "lo": cumulative + min(low, tail), "hi": cumulative + max(high, tail), "metodo": metodo, "conf": conf}
