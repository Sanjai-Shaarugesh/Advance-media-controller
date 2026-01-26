import GObject from "gi://GObject";
import GLib from "gi://GLib";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MprisManager } from "./mpris/MprisManager.js";
import { MediaControls } from "./ui/MediaControls.js";
import { PanelUI } from "./indicator/PanelUI.js";
import { IndicatorState } from "./indicator/IndicatorState.js";
import { IndicatorEventHandlers } from "./indicator/IndicatorEventHandlers.js";
import { IndicatorPlayerHandlers } from "./indicator/IndicatorPlayerHandlers.js";
import { IndicatorUIUpdater } from "./indicator/IndicatorUIUpdater.js";

export const MediaIndicator = GObject.registerClass(
  class MediaIndicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, "Media Controls", false);

      this._settings = settings;
      this._state = new IndicatorState();

      this._panelUI = new PanelUI(this);
      this._controls = new MediaControls();

      this._eventHandlers = new IndicatorEventHandlers(this);
      this._playerHandlers = new IndicatorPlayerHandlers(this);
      this._uiUpdater = new IndicatorUIUpdater(this);

      const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      item.add_child(this._controls);
      this.menu.addMenuItem(item);

      this._eventHandlers.connectControlSignals();

      this.menu.connect("open-state-changed", (menu, open) => {
        this._state.safeExecute(() => {
          if (open) {
            this._controls.startPositionUpdate();
            this._eventHandlers.setupWindowMonitoring();
          } else {
            this._controls.stopPositionUpdate();
            this._eventHandlers.removeWindowMonitoring();
          }
        });
      });

      this._state._settingsChangedId = this._settings.connect(
        "changed",
        (_, key) => {
          this._state.safeExecute(() => {
            if (key === "panel-position" || key === "panel-index") {
              this._state.scheduleOperation(() => this._repositionIndicator());
            } else {
              this._uiUpdater.updateLabel();
              this._uiUpdater.updateVisibility();
            }
          });
        },
      );

      this._eventHandlers.setupSessionMonitoring();

      this.hide();

      this._state.scheduleOperation(() => this._initManager(), 200);
    }

    _repositionIndicator() {
      if (this._state._isDestroyed || this._state._sessionChanging) return;

      const position = this._settings.get_string("panel-position");
      const index = this._settings.get_int("panel-index");

      const wasVisible = this.visible;
      const manager = this._manager;
      const player = this._state._currentPlayer;

      try {
        if (this.container && this.container.get_parent()) {
          this.container.get_parent().remove_child(this.container);
        }

        let targetBox;
        switch (position) {
          case "left":
            targetBox = Main.panel._leftBox;
            break;
          case "center":
            targetBox = Main.panel._centerBox;
            break;
          case "right":
          default:
            targetBox = Main.panel._rightBox;
            break;
        }

        const actualIndex =
          index === -1 ? 0 : Math.min(index, targetBox.get_n_children());
        targetBox.insert_child_at_index(this.container, actualIndex);

        this._manager = manager;
        this._state._currentPlayer = player;

        if (
          wasVisible &&
          !this._state._isDestroyed &&
          !this._state._sessionChanging
        ) {
          this.show();
        }
      } catch (e) {
        logError(e, "Failed to reposition");
      }
    }

    async _initManager() {
      if (this._state._isDestroyed) return;

      try {
        this._manager = new MprisManager();

        await this._manager.init({
          added: (name) =>
            this._state.safeExecute(() =>
              this._playerHandlers.onPlayerAdded(name),
            ),
          removed: (name) =>
            this._state.safeExecute(() =>
              this._playerHandlers.onPlayerRemoved(name),
            ),
          changed: (name) =>
            this._state.safeExecute(() =>
              this._playerHandlers.onPlayerChanged(name),
            ),
          seeked: (name, position) =>
            this._state.safeExecute(() =>
              this._playerHandlers.onSeeked(name, position),
            ),
        });

        if (this._state._isDestroyed) return;

        this._state._managerInitialized = true;

        const players = this._manager.getPlayers();
        if (players.length > 0) {
          for (const name of players) {
            const info = this._manager.getPlayerInfo(name);
            if (info && info.status === "Playing") {
              this._state._currentPlayer = name;
              break;
            }
          }

          if (!this._state._currentPlayer) {
            this._state._currentPlayer = players[0];
          }

          this._uiUpdater.updateUI();
          this._uiUpdater.updateVisibility();
        }

        this._state._isInitializing = false;
      } catch (e) {
        logError(e, "Failed to initialize MPRIS");
        this._state._isInitializing = false;
        this._state._managerInitialized = false;
      }
    }

    destroy() {
      if (this._state._isDestroyed) return;
      this._state._isDestroyed = true;
      this._state._sessionChanging = true;
      this._state._safetyLock = true;
      this._state._preventLogout = true;

      for (const id of this._state._pendingOperations) {
        try {
          GLib.source_remove(id);
        } catch (e) {}
      }
      this._state._pendingOperations.clear();

      this._panelUI.stopScrolling();
      this._eventHandlers.removeWindowMonitoring();

      if (this._state._updateThrottle) {
        try {
          GLib.source_remove(this._state._updateThrottle);
        } catch (e) {}
        this._state._updateThrottle = null;
      }

      if (this._state._settingsChangedId) {
        try {
          this._settings.disconnect(this._state._settingsChangedId);
        } catch (e) {}
        this._state._settingsChangedId = 0;
      }

      if (this._state._sessionModeId) {
        try {
          Main.sessionMode.disconnect(this._state._sessionModeId);
        } catch (e) {}
        this._state._sessionModeId = 0;
      }

      if (this._controls) {
        try {
          this._controls.destroy();
        } catch (e) {}
        this._controls = null;
      }

      if (this._manager) {
        GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
          try {
            if (this._manager) {
              this._manager.destroy();
              this._manager = null;
            }
          } catch (e) {}
          return GLib.SOURCE_REMOVE;
        });
      }

      try {
        super.destroy();
      } catch (e) {}
    }
  },
);
