"""Constantes de l'intégration Solar Powerflow."""

from __future__ import annotations

DOMAIN = "solar_powerflow"
VERSION = "2.0.0"

# Carte Lovelace livrée avec l'intégration
URL_BASE = "/solar_powerflow_static"
CARD_FILE = "solar-powerflow-card.js"

SIGNAL_UPDATE = "solar_powerflow_update_{}"

# ---- Étape 1 : équipements ----
CONF_NAME = "name"
CONF_HAS_BATTERY = "has_battery"
CONF_SHOW_BATTERY = "show_battery"
CONF_HAS_ROUTER = "has_router"
CONF_SHOW_ROUTER = "show_router"
CONF_HAS_CUMULUS = "has_cumulus"
CONF_SHOW_CUMULUS = "show_cumulus"

DEFAULT_NAME = "Solar Powerflow"

# ---- Étape 2 : un onglet (section repliable) par matériel ----
SEC_PV = "pv"
SEC_BATTERY = "battery"
SEC_ROUTER = "router"
SEC_CUMULUS = "cumulus"

# Onglet photovoltaïque
CONF_PV_POWER = "pv_power"
CONF_LOAD_POWER = "load_power"
CONF_PV_PEAK = "pv_peak"
CONF_LOAD_INCLUDES_CUMULUS = "load_includes_cumulus"
CONF_IMPORT_THRESHOLD = "grid_import_threshold"

# Onglet batterie
CONF_SOC = "soc"
CONF_CHARGE_POWER = "charge_power"
CONF_DISCHARGE_POWER = "discharge_power"
CONF_CAPACITY = "capacity"

# Onglet routeur
CONF_ROUTER_SURPLUS = "surplus_flow"
CONF_ROUTER_CUMULUS = "cumulus_flow"
CONF_ROUTER_GRID = "grid_flow"
CONF_ROUTER_POWER = "router_power"

# Onglet cumulus
CONF_CUMULUS_POWER = "heating_power"
CONF_CUMULUS_TEMP = "temperature"
CONF_CUMULUS_SETPOINT = "max_setpoint"

DEFAULT_PV_PEAK = 6000
DEFAULT_IMPORT_THRESHOLD = 50
DEFAULT_CAPACITY = 0.0
DEFAULT_SETPOINT = 60

STATUSES = [
    "veille",
    "autoconsommation",
    "charge_batterie",
    "routage_cumulus",
    "surplus_injecte",
    "sur_batterie",
    "soutirage_reseau",
]
