"""Capteurs calculés par Solar Powerflow."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import MATCH_ALL, PERCENTAGE, UnitOfPower
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, STATUSES, VERSION
from .engine import PowerFlowEngine


@dataclass(frozen=True, kw_only=True)
class FlowSensorDescription(SensorEntityDescription):
    """Description d'un capteur calculé."""

    value_fn: Callable[[dict], Any]
    available_fn: Callable[[PowerFlowEngine], bool] = lambda e: True


def _v(key: str) -> Callable[[dict], Any]:
    return lambda d: d["values"].get(key)


def _power(key: str, value: str, avail: Callable[[PowerFlowEngine], bool] | None = None) -> FlowSensorDescription:
    return FlowSensorDescription(
        key=key,
        translation_key=key,
        native_unit_of_measurement=UnitOfPower.WATT,
        device_class=SensorDeviceClass.POWER,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        value_fn=_v(value),
        available_fn=avail or (lambda e: True),
    )


def _pct(key: str, value: str, avail: Callable[[PowerFlowEngine], bool] | None = None) -> FlowSensorDescription:
    return FlowSensorDescription(
        key=key,
        translation_key=key,
        native_unit_of_measurement=PERCENTAGE,
        state_class=SensorStateClass.MEASUREMENT,
        suggested_display_precision=0,
        value_fn=_v(value),
        available_fn=avail or (lambda e: True),
    )


CUM = lambda e: e.cumulus_capable  # noqa: E731
CUM_BAT = lambda e: e.cumulus_capable and e.has["battery"]  # noqa: E731
ROUTER = lambda e: e.has["router"]  # noqa: E731

STATUS = FlowSensorDescription(
    key="etat",
    translation_key="etat",
    device_class=SensorDeviceClass.ENUM,
    options=STATUSES,
    value_fn=lambda d: d["status"],
)

DESCRIPTIONS: tuple[FlowSensorDescription, ...] = (
    _power("surplus_solaire", "surplus"),
    _power("surplus_routeur", "routed", ROUTER),
    _power("consommation_hors_cumulus", "house", CUM),
    _power("cumulus_solaire", "cum_solar", CUM),
    _power("cumulus_reseau", "cum_grid", CUM),
    _power("cumulus_batterie", "cum_battery", CUM_BAT),
    _pct("part_cumulus", "cum_share", CUM),
    _power("reseau_soutirage", "imp"),
    _power("reseau_injection", "exp"),
    _pct("autonomie", "autonomie"),
    _pct("autoconsommation", "autoconsommation"),
)

# capteurs de l'intégration que la carte ouvre au clic
CARD_LINKS = ("reseau_soutirage", "reseau_injection", "surplus_routeur", "part_cumulus", "consommation_hors_cumulus")


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    engine: PowerFlowEngine = entry.runtime_data
    wanted = [STATUS] + [d for d in DESCRIPTIONS if d.available_fn(engine)]

    # supprime les capteurs d'un équipement retiré dans les réglages
    reg = er.async_get(hass)
    keep = {f"{entry.entry_id}_{d.key}" for d in wanted}
    for ent in er.async_entries_for_config_entry(reg, entry.entry_id):
        if ent.unique_id not in keep:
            reg.async_remove(ent.entity_id)

    entities: list[SensorEntity] = [FlowStatusSensor(engine, STATUS)]
    entities += [FlowSensor(engine, d) for d in wanted if d is not STATUS]
    async_add_entities(entities)


class FlowSensor(SensorEntity):
    """Capteur alimenté par le moteur de calcul."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    entity_description: FlowSensorDescription

    def __init__(self, engine: PowerFlowEngine, description: FlowSensorDescription) -> None:
        self.engine = engine
        self.entity_description = description
        entry = engine.entry
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Solar Powerflow",
            model="Flux d'énergie solaire",
            sw_version=VERSION,
            entry_type=DeviceEntryType.SERVICE,
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, self.engine.signal, self._handle_update)
        )

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def available(self) -> bool:
        return self.engine.data is not None

    @property
    def native_value(self) -> Any:
        if self.engine.data is None:
            return None
        return self.entity_description.value_fn(self.engine.data)


class FlowStatusSensor(FlowSensor):
    """État général ; ses attributs alimentent la carte."""

    _unrecorded_attributes = frozenset({MATCH_ALL})

    def __init__(self, engine: PowerFlowEngine, description: FlowSensorDescription) -> None:
        super().__init__(engine, description)
        self._links: dict[str, str | None] = {}

    def _own_entities(self) -> dict[str, str | None]:
        if len(self._links) < len(CARD_LINKS) or None in self._links.values():
            reg = er.async_get(self.hass)
            self._links = {
                k: reg.async_get_entity_id("sensor", DOMAIN, f"{self.engine.entry.entry_id}_{k}")
                for k in CARD_LINKS
            }
        return self._links

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self.engine.card_attributes(self._own_entities())
