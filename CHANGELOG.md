# Changelog

## 2.0.0
- La carte devient une **intégration Home Assistant** (`custom_components/solar_powerflow`) qui livre et charge la carte automatiquement.
- Réglages dans l'interface : choix des équipements (batterie, routeur solaire, cumulus) et de leur affichage sur la carte, puis **un onglet repliable par matériel** (Photovoltaïque, Batterie, Routeur, Cumulus).
- Plus de cercle central : les flux relient **directement** les appareils.
- Nouveaux nœuds **Routeur** et **Cumulus** (température, jauge jusqu'à la consigne max).
- Surplus envoyé au routeur **calculé** à partir de la production et de la consommation de la maison ; réseau (soutirage / injection) déduit du bilan.
- Part du cumulus **détaillée** dans la consommation de la maison (anneau bicolore + détail par origine : surplus solaire, batterie, réseau).
- Capteurs calculés : surplus solaire, surplus vers le routeur, consommation hors cumulus, cumulus solaire / réseau / batterie, part du cumulus, soutirage, injection, autonomie, autoconsommation, état.
- Retirés : dispositions horizontale et mini, détail par appareil (`devices`), capteurs réseau.
