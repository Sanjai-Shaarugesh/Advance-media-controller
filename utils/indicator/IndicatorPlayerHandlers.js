import GLib from "gi://GLib";

export class IndicatorPlayerHandlers {
  constructor(indicator) {
    this._indicator = indicator;
  }

  onPlayerAdded(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing ||
        this._indicator._state._sessionChanging)
      return;

    try {
      const info = this._indicator._manager.getPlayerInfo(name);

      this._indicator._manager.startPositionPolling(name);

      if (info && info.status === "Playing") {
        this._indicator._state._currentPlayer = name;
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateVisibility();
      } else if (!this._indicator._state._currentPlayer) {
        this._indicator._state._currentPlayer = name;
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateVisibility();
      }

      this._indicator._uiUpdater.updateTabs();
    } catch (e) {
      logError(e, "Error in onPlayerAdded");
    }
  }

  onPlayerRemoved(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging)
      return;

    try {
      this._indicator._manager.stopPositionPolling(name);

      if (this._indicator._state._currentPlayer === name) {
        this._selectNextPlayer();
      }
      this._indicator._uiUpdater.updateTabs();
      this._indicator._uiUpdater.updateVisibility();
    } catch (e) {
      logError(e, "Error in onPlayerRemoved");
    }
  }

  onPlayerChanged(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing ||
        this._indicator._state._sessionChanging)
      return;

    const now = GLib.get_monotonic_time();

    if (now - this._indicator._state._lastUpdateTime < 50000) {
      if (this._indicator._state._updateThrottle) {
        GLib.source_remove(this._indicator._state._updateThrottle);
      }

      this._indicator._state._updateThrottle = GLib.timeout_add(GLib.PRIORITY_LOW, 50, () => {
        if (!this._indicator._state._isDestroyed && !this._indicator._state._sessionChanging) {
          this._performUpdate(name);
        }
        this._indicator._state._updateThrottle = null;
        return GLib.SOURCE_REMOVE;
      });
      return;
    }

    this._performUpdate(name);
  }

  _performUpdate(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing ||
        this._indicator._state._sessionChanging)
      return;

    try {
      this._indicator._state._lastUpdateTime = GLib.get_monotonic_time();
      const info = this._indicator._manager.getPlayerInfo(name);

      if (this._indicator._state._currentPlayer === name) {
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateVisibility();

        if (this._indicator.menu.isOpen && this._indicator._controls) {
          this._indicator._controls.update(info, name, this._indicator._manager);
        }
      } else if (info && info.status === "Playing") {
        this._indicator._state._currentPlayer = name;
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateTabs();
        this._indicator._uiUpdater.updateVisibility();
      }
    } catch (e) {
      logError(e, "Error in performUpdate");
    }
  }

  onSeeked(name, position) {
    if (this._indicator._state._isDestroyed ||
        this._indicator._state._currentPlayer !== name ||
        this._indicator._state._sessionChanging)
      return;

    try {
      this._indicator._controls.onSeeked(position);
    } catch (e) {
      logError(e, "Error in onSeeked");
    }
  }

  _selectNextPlayer() {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging)
      return;

    try {
      const players = this._indicator._manager.getPlayers();

      for (const name of players) {
        const info = this._indicator._manager.getPlayerInfo(name);
        if (info && info.status === "Playing") {
          this._indicator._state._currentPlayer = name;
          this._indicator._uiUpdater.updateUI();
          this._indicator._uiUpdater.updateTabs();
          this._indicator._uiUpdater.updateVisibility();
          return;
        }
      }

      if (players.length > 0) {
        this._indicator._state._currentPlayer = players[0];
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateTabs();
        this._indicator._uiUpdater.updateVisibility();
      } else {
        this._indicator._state._currentPlayer = null;
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        this._indicator.hide();
      }
    } catch (e) {
      logError(e, "Error in selectNextPlayer");
    }
  }
}