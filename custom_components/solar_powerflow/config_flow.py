"""Réglages de Solar Powerflow : équipements, puis un onglet repliable par matériel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers import selector

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
    CONF_NAME,
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
    DEFAULT_NAME,
    DEFAULT_PV_PEAK,
    DEFAULT_SETPOINT,
    DOMAIN,
    SEC_BATTERY,
    SEC_CUMULUS,
    SEC_PV,
    SEC_ROUTER,
)

SENSOR = selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor"))
BOOL = selector.BooleanSelector()


def _number(min_: float, max_: float, step: float, unit: str) -> selector.NumberSelector:
    return selector.NumberSelector(
        selector.NumberSelectorConfig(
            min=min_, max=max_, step=step, unit_of_measurement=unit,
            mode=selector.NumberSelectorMode.BOX,
        )
    )


def _entity(key: str, cur: dict, required: bool = False, sel: selector.Selector = SENSOR) -> dict:
    """Champ entité, prérempli avec la valeur actuelle (et effaçable s'il est facultatif)."""
    marker = vol.Required if required else vol.Optional
    return {marker(key, description={"suggested_value": cur.get(key)}): sel}


def equipment_schema(cur: dict[str, Any]) -> vol.Schema:
    """Étape 1 : quels équipements sont installés et lesquels apparaissent sur la carte."""
    return vol.Schema(
        {
            vol.Required(CONF_NAME, default=cur.get(CONF_NAME, DEFAULT_NAME)): str,
            vol.Required(CONF_HAS_BATTERY, default=cur.get(CONF_HAS_BATTERY, False)): BOOL,
            vol.Required(CONF_SHOW_BATTERY, default=cur.get(CONF_SHOW_BATTERY, True)): BOOL,
            vol.Required(CONF_HAS_ROUTER, default=cur.get(CONF_HAS_ROUTER, False)): BOOL,
            vol.Required(CONF_SHOW_ROUTER, default=cur.get(CONF_SHOW_ROUTER, True)): BOOL,
            vol.Required(CONF_HAS_CUMULUS, default=cur.get(CONF_HAS_CUMULUS, False)): BOOL,
            vol.Required(CONF_SHOW_CUMULUS, default=cur.get(CONF_SHOW_CUMULUS, True)): BOOL,
        }
    )


def entities_schema(opts: dict[str, Any], collapsed: bool) -> vol.Schema:
    """Étape 2 : un onglet repliable par matériel déclaré."""
    pv = opts.get(SEC_PV, {})
    pv_fields: dict = {}
    pv_fields.update(_entity(CONF_PV_POWER, pv, required=True))
    pv_fields.update(_entity(CONF_LOAD_POWER, pv, required=True))
    pv_fields[vol.Required(CONF_PV_PEAK, default=pv.get(CONF_PV_PEAK, DEFAULT_PV_PEAK))] = _number(100, 100000, 100, "W")
    if opts.get(CONF_HAS_CUMULUS) or opts.get(CONF_HAS_ROUTER):
        pv_fields[vol.Required(CONF_LOAD_INCLUDES_CUMULUS, default=pv.get(CONF_LOAD_INCLUDES_CUMULUS, True))] = BOOL
    pv_fields[vol.Required(CONF_IMPORT_THRESHOLD, default=pv.get(CONF_IMPORT_THRESHOLD, DEFAULT_IMPORT_THRESHOLD))] = _number(10, 5000, 10, "W")

    schema: dict = {vol.Required(SEC_PV): section(vol.Schema(pv_fields), {"collapsed": collapsed})}

    if opts.get(CONF_HAS_BATTERY):
        bat = opts.get(SEC_BATTERY, {})
        f: dict = {}
        f.update(_entity(CONF_SOC, bat, required=True))
        f.update(_entity(CONF_CHARGE_POWER, bat))
        f.update(_entity(CONF_DISCHARGE_POWER, bat))
        f[vol.Required(CONF_CAPACITY, default=bat.get(CONF_CAPACITY, DEFAULT_CAPACITY))] = _number(0, 200, 0.01, "kWh")
        schema[vol.Required(SEC_BATTERY)] = section(vol.Schema(f), {"collapsed": collapsed})

    if opts.get(CONF_HAS_ROUTER):
        rt = opts.get(SEC_ROUTER, {})
        f = {}
        for key in (CONF_ROUTER_SURPLUS, CONF_ROUTER_CUMULUS, CONF_ROUTER_GRID, CONF_ROUTER_POWER):
            f.update(_entity(key, rt))
        schema[vol.Required(SEC_ROUTER)] = section(vol.Schema(f), {"collapsed": collapsed})

    if opts.get(CONF_HAS_CUMULUS):
        cu = opts.get(SEC_CUMULUS, {})
        f = {}
        f.update(_entity(CONF_CUMULUS_POWER, cu))
        f.update(_entity(CONF_CUMULUS_TEMP, cu))
        f[vol.Required(CONF_CUMULUS_SETPOINT, default=cu.get(CONF_CUMULUS_SETPOINT, DEFAULT_SETPOINT))] = _number(20, 95, 1, "°C")
        schema[vol.Required(SEC_CUMULUS)] = section(vol.Schema(f), {"collapsed": collapsed})

    return vol.Schema(schema)


def _check(user_input: dict[str, Any]) -> dict[str, str]:
    errors: dict[str, str] = {}
    pv = user_input.get(SEC_PV, {})
    if pv.get(CONF_PV_POWER) and pv.get(CONF_PV_POWER) == pv.get(CONF_LOAD_POWER):
        errors["base"] = "same_entity"
    bat = user_input.get(SEC_BATTERY)
    if bat is not None and not (bat.get(CONF_CHARGE_POWER) or bat.get(CONF_DISCHARGE_POWER)):
        errors["base"] = "battery_power"
    return errors


class SolarPowerflowConfigFlow(ConfigFlow, domain=DOMAIN):
    """Première configuration."""

    VERSION = 1

    def __init__(self) -> None:
        self._opts: dict[str, Any] = {}

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SolarPowerflowOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            self._opts.update(user_input)
            return await self.async_step_entities()
        return self.async_show_form(step_id="user", data_schema=equipment_schema({}))

    async def async_step_entities(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _check(user_input)
            self._opts.update(user_input)
            if not errors:
                return self.async_create_entry(
                    title=self._opts.get(CONF_NAME) or DEFAULT_NAME, data={}, options=self._opts
                )
        return self.async_show_form(
            step_id="entities", data_schema=entities_schema(self._opts, collapsed=False), errors=errors
        )


class SolarPowerflowOptionsFlow(OptionsFlow):
    """Modification des réglages (Configurer)."""

    def __init__(self) -> None:
        self._opts: dict[str, Any] = {}

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        cur = dict(self.config_entry.options)
        if user_input is not None:
            self._opts = {**cur, **user_input}
            return await self.async_step_entities()
        return self.async_show_form(step_id="init", data_schema=equipment_schema(cur))

    async def async_step_entities(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _check(user_input)
            self._opts.update(user_input)
            if not errors:
                title = self._opts.get(CONF_NAME) or DEFAULT_NAME
                if title != self.config_entry.title:
                    self.hass.config_entries.async_update_entry(self.config_entry, title=title)
                return self.async_create_entry(data=self._opts)
        return self.async_show_form(
            step_id="entities", data_schema=entities_schema(self._opts, collapsed=True), errors=errors
        )
