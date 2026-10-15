"""Solar Powerflow : flux d'énergie solaire (production, batterie, routeur, cumulus)."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CARD_FILE, DOMAIN, URL_BASE, VERSION
from .engine import PowerFlowEngine

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Sert la carte Lovelace et la charge automatiquement dans le frontend."""
    if hass.data.get(f"{DOMAIN}_card"):
        return True
    www = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(URL_BASE, str(www), False)]
    )
    add_extra_js_url(hass, f"{URL_BASE}/{CARD_FILE}?v={VERSION}")
    hass.data[f"{DOMAIN}_card"] = True
    _LOGGER.debug("Carte Solar Powerflow servie sur %s/%s", URL_BASE, CARD_FILE)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    engine = PowerFlowEngine(hass, entry)
    entry.runtime_data = engine
    engine.async_start()
    entry.async_on_unload(engine.async_stop)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_reload(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Les réglages ont changé : on recharge l'intégration."""
    await hass.config_entries.async_reload(entry.entry_id)
