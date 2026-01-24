import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

export class IndicatorEventHandlers {
  constructor(indicator) {
    this._indicator = indicator;
  }

  connectControlSignals() {
    try {
      this._indicator._controls.connect("play-pause", () => this._indicator._state.safeExecute(() => this._onPlayPause()));
      this._indicator._controls.connect("next", () => this._indicator._state.safeExecute(() => this._onNext()));
      this._indicator._controls.connect("previous", () => this._indicator._state.safeExecute(() => this._onPrevious()));
      this._indicator._controls.connect("shuffle", () => this._indicator._state.safeExecute(() => this._onShuffle()));
      this._indicator._controls.connect("repeat", () => this._indicator._state.safeExecute(() => this._onRepeat()));
      this._indicator._controls.connect("seek", (_, position) => this._indicator._state.safeExecute(() => this._onSeek(position)));
      this._indicator._controls.connect("player-changed", (_, name) => {
        this._indicator._state.safeExecute(() => {
          this._indicator._state._currentPlayer = name;
          this._indicator._uiUpdater.updateUI();
        });
      });

      // Panel button handlers
      this._indicator._panelUI.panelPrevBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPrevious();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._indicator._panelUI.panelPlayBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPlayPause();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });

      this._indicator._panelUI.panelNextBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onNext();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
    } catch (e) {
      logError(e, "Error connecting control signals");
    }
  }

  setupSessionMonitoring() {
    this._indicator._state._sessionModeId = Main.sessionMode.connect("updated", () => {
      if (this._indicator._state._isDestroyed) return;
      
      this._indicator._state._preventLogout = true;
      this._indicator._state._sessionChanging = true;
      
      if (this._indicator.menu && this._indicator.menu.isOpen) {
        try {
          this._indicator.menu.close(false);
        } catch (e) {}
      }
      
      this._indicator._panelUI.stopScrolling();
      
      this._indicator._state.scheduleOperation(() => {
        if (!this._indicator._state._isDestroyed) {
          try {
            if (this._indicator._manager) {
              this._indicator._manager.pauseOperations();
            }
          } catch (e) {}
        }
      }, 100);
      
      this._indicator._state.scheduleOperation(() => {
        if (!this._indicator._state._isDestroyed && this._indicator._state._managerInitialized && !this._indicator._state._isInitializing) {
          try {
            if (this._indicator._manager) {
              this._indicator._manager.resumeOperations();
            }
            this._indicator._uiUpdater.updateVisibility();
          } catch (e) {}
        }
        this._indicator._state._sessionChanging = false;
        this._indicator._state._preventLogout = false;
      }, 1000);
    });
  }

  setupWindowMonitoring() {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging) return;
    
    this.removeWindowMonitoring();

    try {
      this._indicator._state._capturedEventId = global.stage.connect("button-press-event", (actor, event) => {
        if (this._indicator._state._isDestroyed || !this._indicator.menu.isOpen || this._indicator._state._sessionChanging) return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const clickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (this._indicator.menu.actor.contains(clickedActor) || this._indicator.contains(clickedActor)) {
          return Clutter.EVENT_PROPAGATE;
        }

        this._indicator.menu.close();
        return Clutter.EVENT_STOP;
      });

      this._indicator._state._windowFocusId = global.display.connect("notify::focus-window", () => {
        if (this._indicator._state._isDestroyed || !this._indicator.menu.isOpen || this._indicator._state._sessionChanging) return;

        const focusedWindow = global.display.focus_window;
        if (focusedWindow) {
          this._indicator.menu.close();
        }
      });

      this._indicator._state._overviewShowingId = Main.overview.connect("showing", () => {
        if (this._indicator._state._isDestroyed || !this._indicator.menu.isOpen || this._indicator._state._sessionChanging) return;
        this._indicator.menu.close();
      });

      const layoutManager = Main.layoutManager;
      if (layoutManager && layoutManager.modalCount !== undefined) {
        this._indicator._state._modalId = layoutManager.connect("modals-changed", () => {
          if (this._indicator._state._isDestroyed || !this._indicator.menu.isOpen || this._indicator._state._sessionChanging) return;
          if (layoutManager.modalCount > 0) {
            this._indicator.menu.close();
          }
        });
      }
    } catch (e) {
      logError(e, "Error setting up window monitoring");
    }
  }

  removeWindowMonitoring() {
    const signals = [
      { obj: global.stage, id: '_capturedEventId' },
      { obj: global.display, id: '_windowFocusId' },
      { obj: Main.overview, id: '_overviewShowingId' },
      { obj: Main.layoutManager, id: '_modalId' }
    ];

    for (const signal of signals) {
      if (this._indicator._state[signal.id]) {
        try {
          signal.obj.disconnect(this._indicator._state[signal.id]);
        } catch (e) {}
        this._indicator._state[signal.id] = null;
      }
    }
  }

  _onPlayPause() {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
    
    this._indicator._manager.playPause(this._indicator._state._currentPlayer).catch((e) => {
      if (!this._indicator._state._isDestroyed) {
        logError(e, "Failed to toggle play/pause");
      }
    });
  }

  _onNext() {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
    
    this._indicator._manager.next(this._indicator._state._currentPlayer).catch((e) => {
      if (!this._indicator._state._isDestroyed) {
        logError(e, "Failed to skip next");
      }
    });
  }

  _onPrevious() {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
    
    this._indicator._manager.previous(this._indicator._state._currentPlayer).catch((e) => {
      if (!this._indicator._state._isDestroyed) {
        logError(e, "Failed to skip previous");
      }
    });
  }

  _onShuffle() {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
    
    this._indicator._manager.toggleShuffle(this._indicator._state._currentPlayer).catch((e) => {
      if (!this._indicator._state._isDestroyed) {
        logError(e, "Failed to toggle shuffle");
      }
    });
  }

  _onRepeat() {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
    
    this._indicator._manager.cycleLoopStatus(this._indicator._state._currentPlayer).catch((e) => {
      if (!this._indicator._state._isDestroyed) {
        logError(e, "Failed to cycle repeat");
      }
    });
  }

  _onSeek(position) {
    if (this._indicator._state._isDestroyed || !this._indicator._state._currentPlayer || this._indicator._state._sessionChanging) return;
  
    try {
      const proxy = this._indicator._manager._proxies.get(this._indicator._state._currentPlayer);
      if (!proxy) return;
  
      const metadata = proxy.get_cached_property("Metadata");
      if (!metadata) return;
  
      const meta = {};
      const len = metadata.n_children();
      
      for (let i = 0; i < len; i++) {
        try {
          const item = metadata.get_child_value(i);
          const key = item.get_child_value(0).get_string()[0];
          const valueVariant = item.get_child_value(1).get_variant();
          
          if (key === "mpris:trackid") {
            meta[key] = valueVariant.recursiveUnpack();
            break;
          }
        } catch (e) {
          continue;
        }
      }
  
      const trackId = meta["mpris:trackid"] || "/";
  
      this._indicator._manager.setPosition(
        this._indicator._state._currentPlayer, 
        trackId, 
        position
      ).catch((e) => {
        if (!this._indicator._state._isDestroyed) {
          logError(e, "Failed to seek");
        }
      });
    } catch (e) {
      logError(e, "Error during seek");
    }
  }
}