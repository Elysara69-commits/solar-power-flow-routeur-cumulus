"""Lecture des capteurs sources et recalcul à chaque changement d'état."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_UNAVAILABLE, STATE_UNKNOWN
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event

from .calc import FlowConfig, compute
from .const import (
    CONF_CAPACITY,
    CONF_CHARGE_POWER,
    CONF_CUMULUS_POWER,
    CONF_CUMULUS_SETPOINT,
    CONF_CUMULUS_TEMP,
    CONF_DISCHARGE_POWER,
    CONF_HAS_BATTERY,
    CONF_HAS_CUMULUS,
    CONF_HAS_ROUTER,
    CONF_IMPORT_THRESHOLD,
    CONF_LOAD_INCLUDES_CUMULUS,
    CONF_LOAD_POWER,
    CONF_PV_PEAK,
    CONF_PV_POWER,
    CONF_ROUTER_CUMULUS,
    CONF_ROUTER_GRID,
    CONF_ROUTER_POWER,
    CONF_ROUTER_SURPLUS,
    CONF_SHOW_BATTERY,
    CONF_SHOW_CUMULUS,
    CONF_SHOW_ROUTER,
    CONF_SOC,
    DEFAULT_CAPACITY,
    DEFAULT_IMPORT_THRESHOLD,
    DEFAULT_PV_PEAK,
    DEFAULT_SETPOINT,
    SEC_BATTERY,
    SEC_CUMULUS,
    SEC_PV,
    SEC_ROUTER,
    SIGNAL_UPDATE,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

# clé de lecture → (section, option, type de valeur)
SOURCES: dict[str, tuple[str, str, str]] = {
    "pv": (SEC_PV, CONF_PV_POWER, "power"),
    "load": (SEC_PV, CONF_LOAD_POWER, "power"),
    "soc": (SEC_BATTERY, CONF_SOC, "plain"),
    "ch": (SEC_BATTERY, CONF_CHARGE_POWER, "power"),
    "dis": (SEC_BATTERY, CONF_DISCHARGE_POWER, "power"),
    "r_surplus": (SEC_ROUTER, CONF_ROUTER_SURPLUS, "power"),
    "r_cum": (SEC_ROUTER, CONF_ROUTER_CUMULUS, "power"),
    "r_grid": (SEC_ROUTER, CONF_ROUTER_GRID, "power"),
    "r_power": (SEC_ROUTER, CONF_ROUTER_POWER, "power"),
    "cum_power": (SEC_CUMULUS, CONF_CUMULUS_POWER, "power"),
    "cum_temp": (SEC_CUMULUS, CONF_CUMULUS_TEMP, "plain"),
}
SECTION_FLAG = {SEC_PV: None, SEC_BATTERY: CONF_HAS_BATTERY, SEC_ROUTER: CONF_HAS_ROUTER, SEC_CUMULUS: CONF_HAS_CUMULUS}

POWER_FACTORS = {"w": 1.0, "kw": 1000.0, "mw": 1_000_000.0}


def _num(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class PowerFlowEngine:
    """Calcule les flux et prévient les capteurs à chaque changement."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        opts = dict(entry.options)
        self.opts = opts
        pv = opts.get(SEC_PV, {})
        bat = opts.get(SEC_BATTERY, {})
        cumu = opts.get(SEC_CUMULUS, {})

        self.has = {
            "battery": bool(opts.get(CONF_HAS_BATTERY)),
            "router": bool(opts.get(CONF_HAS_ROUTER)),
            "cumulus": bool(opts.get(CONF_HAS_CUMULUS)),
        }
        self.show = {
            "battery": self.has["battery"] and bool(opts.get(CONF_SHOW_BATTERY, True)),
            "router": self.has["router"] and bool(opts.get(CONF_SHOW_ROUTER, True)),
            "cumulus": self.has["cumulus"] and bool(opts.get(CONF_SHOW_CUMULUS, True)),
        }
        self.cfg = FlowConfig(
            has_battery=self.has["battery"],
            has_router=self.has["router"],
            has_cumulus=self.has["cumulus"],
            load_includes_cumulus=bool(pv.get(CONF_LOAD_INCLUDES_CUMULUS, True)),
            import_threshold=_num(pv.get(CONF_IMPORT_THRESHOLD), DEFAULT_IMPORT_THRESHOLD),
            pv_peak=_num(pv.get(CONF_PV_PEAK), DEFAULT_PV_PEAK),
            capacity=_num(bat.get(CONF_CAPACITY), DEFAULT_CAPACITY),
            setpoint=_num(cumu.get(CONF_CUMULUS_SETPOINT), DEFAULT_SETPOINT),
        )

        # entités sources réellement utilisées (équipement présent + champ renseigné)
        self.sources: dict[str, str] = {}
        for key, (sec, opt, _kind) in SOURCES.items():
            flag = SECTION_FLAG[sec]
            if flag and not opts.get(flag):
                continue
            eid = opts.get(sec, {}).get(opt)
            if eid:
                self.sources[key] = eid

        self.data: dict | None = None
        self.missing: list[str] = []
        self._unsub = None
        self._debouncer = Debouncer(
            hass, _LOGGER, cooldown=1.0, immediate=True, function=self._recompute
        )

    @property
    def signal(self) -> str:
        return SIGNAL_UPDATE.format(self.entry.entry_id)

    @property
    def cumulus_capable(self) -> bool:
        """Le cumulus peut être évalué (cumulus déclaré, ou routeur qui le mesure)."""
        return self.has["cumulus"] or self.has["router"]

    @callback
    def async_start(self) -> None:
        self._recompute()
        if self.sources:
            self._unsub = async_track_state_change_event(
                self.hass, list(set(self.sources.values())), self._on_change
            )

    @callback
    def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        self._debouncer.async_shutdown()

    @callback
    def _on_change(self, _event: Event) -> None:
        self._debouncer.async_schedule_call()

    def _read(self, key: str) -> float | None:
        eid = self.sources.get(key)
        if not eid:
            return None
        st = self.hass.states.get(eid)
        if st is None or st.state in (STATE_UNAVAILABLE, STATE_UNKNOWN, ""):
            self.missing.append(eid)
            return None
        try:
            val = float(st.state)
        except ValueError:
            self.missing.append(eid)
            return None
        if SOURCES[key][2] == "power":
            unit = str(st.attributes.get("unit_of_measurement") or "").strip().lower()
            val *= POWER_FACTORS.get(unit, 1.0)
        return val

    @callback
    def _recompute(self) -> None:
        self.missing = []
        readings = {key: self._read(key) for key in SOURCES}
        try:
            self.data = compute(self.cfg, readings)
        except Exception:  # noqa: BLE001 - un capteur farfelu ne doit pas tout bloquer
            _LOGGER.exception("Calcul des flux impossible")
            return
        async_dispatcher_send(self.hass, self.signal)

    def card_attributes(self, own_entities: dict[str, str | None]) -> dict[str, Any]:
        """Attributs lus par la carte (non enregistrés dans l'historique)."""
        d = self.data or {}
        return {
            "solar_powerflow": True,
            "version": VERSION,
            "title": self.entry.title,
            "has": self.has,
            "show": self.show,
            "load_includes_cumulus": self.cfg.load_includes_cumulus,
            "values": d.get("values", {}),
            "flows": d.get("flows", {}),
            "entities": dict(self.sources),
            "sensors": own_entities,
            "missing": sorted(set(self.missing)),
        }
