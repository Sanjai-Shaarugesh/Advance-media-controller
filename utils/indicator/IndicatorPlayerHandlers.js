import GLib from "gi://GLib";

export class IndicatorPlayerHandlers {
  constructor(indicator) {
    this._indicator = indicator;
  }

  onPlayerAdded(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing || this._indicator._state._sessionChanging) return;
    
    try {
      const info = this._indicator._manager.getPlayerInfo(name);

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
      logError(e, "Error in _onPlayerAdded");
    }
  }

  onPlayerRemoved(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging) return;
    
    try {
      if (this._indicator._state._currentPlayer === name) {
        this._selectNextPlayer();
      }
      this._indicator._uiUpdater.updateTabs();
      this._indicator._uiUpdater.updateVisibility();
    } catch (e) {
      logError(e, "Error in _onPlayerRemoved");
    }
  }

  onPlayerChanged(name) {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing || this._indicator._state._sessionChanging) return;
    
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
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing || this._indicator._state._sessionChanging) return;
    
    try {
      this._indicator._state._lastUpdateTime = GLib.get_monotonic_time();
      const info = this._indicator._manager.getPlayerInfo(name);

      // CRITICAL: Only update UI for the specific player that changed
      if (this._indicator._state._currentPlayer === name) {
        // This is the currently active player - update everything
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateVisibility();
        
        if (this._indicator.menu.isOpen && this._indicator._controls) {
          // Update controls with the specific player's info
          this._indicator._controls.update(info, name, this._indicator._manager);
        }
      } else if (info && info.status === "Playing") {
        // Another player started playing - might want to switch to it
        this._indicator._state._currentPlayer = name;
        this._indicator._uiUpdater.updateUI();
        this._indicator._uiUpdater.updateTabs();
        this._indicator._uiUpdater.updateVisibility();
        
        if (this._indicator.menu.isOpen && this._indicator._controls) {
          // Force update controls to new player
          this._indicator._controls.update(info, name, this._indicator._manager);
        }
      }
      // If it's a different player and not playing, don't update anything
    } catch (e) {
      logError(e, "Error in _performUpdate");
    }
  }

  onSeeked(name, position) {
    // CRITICAL: Only update if this seek is for the currently active player
    if (this._indicator._state._isDestroyed || 
        this._indicator._state._currentPlayer !== name || 
        this._indicator._state._sessionChanging) return;
    
    try {
      // Only pass seek event to controls if it's for the current player
      if (this._indicator._controls && this._indicator._state._currentPlayer === name) {
        this._indicator._controls.onSeeked(position);
      }
    } catch (e) {
      logError(e, "Error in _onSeeked");
    }
  }

  _selectNextPlayer() {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging) return;
    
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
      logError(e, "Error in _selectNextPlayer");
    }
  }
}