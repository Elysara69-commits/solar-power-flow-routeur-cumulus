"""Calcul des flux d'énergie (pur Python, sans dépendance à Home Assistant).

Principe : les capteurs mesurent la puissance de chaque appareil, pas l'origine
de chaque watt. La répartition est donc estimée avec des priorités fixes :

  Production solaire → 1. maison (hors cumulus)  2. charge batterie
                       3. surplus restant → routeur → cumulus, puis réseau
  Décharge batterie  → 1. maison  2. cumulus  3. réseau
  Réseau             → ce qui manque encore (maison, cumulus, charge batterie)

Le soutirage et l'injection sont déduits du bilan
(production + décharge + soutirage = consommation + charge + injection) :
aucun capteur réseau n'est nécessaire.
"""

from __future__ import annotations

from dataclasses import dataclass

W = 10.0  # en dessous de 10 W, un flux est considéré comme nul


@dataclass(frozen=True)
class FlowConfig:
    """Équipements présents et réglages utiles au calcul."""

    has_battery: bool = False
    has_router: bool = False
    has_cumulus: bool = False
    load_includes_cumulus: bool = True
    import_threshold: float = 50.0
    pv_peak: float = 6000.0
    capacity: float = 0.0
    setpoint: float = 60.0


def _pos(v: float | None) -> float:
    return max(0.0, v) if v is not None else 0.0


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def cumulus_source(cfg: FlowConfig, r: dict[str, float | None]) -> float | None:
    """Puissance absorbée par le cumulus : capteur du cumulus, sinon mesures du routeur."""
    if cfg.has_cumulus and r.get("cum_power") is not None:
        return _pos(r["cum_power"])
    if cfg.has_router and r.get("r_cum") is not None:
        return _pos(r["r_cum"])
    if cfg.has_router and r.get("r_power") is not None:
        return _pos(r["r_power"])
    return None


def compute(cfg: FlowConfig, r: dict[str, float | None]) -> dict:
    """Calcule toutes les valeurs affichées par la carte et les capteurs."""
    pv = _pos(r.get("pv"))
    load = _pos(r.get("load"))

    ch = _pos(r.get("ch")) if cfg.has_battery else 0.0
    dis = _pos(r.get("dis")) if cfg.has_battery else 0.0
    if ch > 0 and dis > 0:  # mesures simultanées : on garde le sens net
        net = ch - dis
        ch, dis = max(net, 0.0), max(-net, 0.0)

    cum_raw = cumulus_source(cfg, r)
    cum = cum_raw or 0.0

    # consommation totale et maison hors cumulus
    if cfg.load_includes_cumulus:
        total = max(load, cum)
        house = total - cum
    else:
        house = load
        total = load + cum

    # 1) la production solaire
    pv_house = min(pv, house)
    rest = pv - pv_house
    pv_bat = min(ch, rest)
    rest -= pv_bat
    pv_cum = min(cum, rest)
    rest -= pv_cum
    pv_grid = rest

    # 2) ce qui manque encore
    need_house = house - pv_house
    need_cum = cum - pv_cum
    need_bat = ch - pv_bat

    d = dis
    bat_house = min(d, need_house)
    d -= bat_house
    need_house -= bat_house
    bat_cum = min(d, need_cum)
    d -= bat_cum
    need_cum -= bat_cum
    bat_grid = d

    # 3) le réseau complète
    grid_house, grid_cum, grid_bat = need_house, need_cum, need_bat
    imp = grid_house + grid_cum + grid_bat
    exp = pv_grid + bat_grid
    grid_active = imp > max(W, cfg.import_threshold)

    surplus = max(0.0, pv - house)      # production − consommation hors cumulus
    routed = pv_cum + pv_grid           # surplus restant après la batterie → routeur

    # état général
    if pv > W:
        if exp > W:
            status = "surplus_injecte"
        elif pv_cum > W:
            status = "routage_cumulus"
        elif ch > W:
            status = "charge_batterie"
        else:
            status = "autoconsommation"
    elif dis > W:
        status = "sur_batterie"
    elif grid_active:
        status = "soutirage_reseau"
    else:
        status = "veille"

    imp_counted = imp if grid_active else 0.0
    autonomie = round(100 * _clamp01((total - imp_counted) / total)) if total > W else None
    autoconso = round(100 * _clamp01((pv - exp) / pv)) if pv > W else None
    cum_share = round(100 * cum / total) if total > W else 0

    soc = r.get("soc")
    stored = None
    if cfg.has_battery and soc is not None and cfg.capacity > 0:
        stored = round(_clamp01(soc / 100) * cfg.capacity, 2)

    flows = {
        "pv_house": pv_house, "pv_bat": pv_bat, "pv_cum": pv_cum, "pv_grid": pv_grid,
        "bat_house": bat_house, "bat_cum": bat_cum, "bat_grid": bat_grid,
        "grid_house": grid_house, "grid_cum": grid_cum, "grid_bat": grid_bat,
    }
    # flux affichés : un soutirage sous le seuil n'est pas animé
    shown = dict(flows)
    if not grid_active:
        shown.update(grid_house=0.0, grid_cum=0.0, grid_bat=0.0)

    def rnd(v: float | None) -> int | float | None:
        return None if v is None else round(v)

    return {
        "status": status,
        "values": {
            "pv": rnd(pv), "load": rnd(load), "total": rnd(total), "house": rnd(house),
            "cum": rnd(cum), "cum_known": cum_raw is not None,
            "soc": None if soc is None else round(soc, 1), "stored": stored,
            "ch": rnd(ch), "dis": rnd(dis), "imp": rnd(imp), "exp": rnd(exp),
            "grid_active": grid_active,
            "surplus": rnd(surplus), "routed": rnd(routed),
            "cum_solar": rnd(pv_cum), "cum_grid": rnd(grid_cum), "cum_battery": rnd(bat_cum),
            "cum_share": cum_share,
            "r_surplus": rnd(r.get("r_surplus")), "r_cum": rnd(r.get("r_cum")),
            "r_grid": rnd(r.get("r_grid")), "r_power": rnd(r.get("r_power")),
            "cum_temp": None if r.get("cum_temp") is None else round(r["cum_temp"], 1),
            "cum_setpoint": cfg.setpoint, "pv_peak": cfg.pv_peak, "capacity": cfg.capacity,
            "autonomie": autonomie, "autoconsommation": autoconso,
        },
        "flows": {k: round(v) for k, v in shown.items()},
        "flows_raw": {k: round(v) for k, v in flows.items()},
    }
