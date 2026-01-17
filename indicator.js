import GObject from "gi://GObject";
import St from "gi://St";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MprisManager } from "./mpris.js";
import { MediaControls } from "./ui.js";

export const MediaIndicator = GObject.registerClass(
  class MediaIndicator extends PanelMenu.Button {
    _init(settings) {
      super._init(0.0, "Media Controls", false);

      this._settings = settings;
      this._currentPlayer = null;
      this._scrollTimeout = null;
      this._scrollPosition = 0;
      this._fullText = "";
      this._settingsChangedId = 0;
      this._sessionModeId = 0;
      this._updateThrottle = null;
      this._capturedEventId = null;
      this._windowFocusId = null;
      this._overviewShowingId = null;
      this._overviewHidingId = null;
      this._lastUpdateTime = 0;

      // Create horizontal layout
      this._box = new St.BoxLayout({
        style_class: "panel-status-menu-box panel-button-box",
        style: "spacing: 4px;",
      });
      this.add_child(this._box);

      // Panel icon
      this._icon = new St.Icon({
        icon_name: "audio-x-generic-symbolic",
        style_class: "system-status-icon colored-icon",
        icon_size: 16,
      });
      this._box.add_child(this._icon);

      // Panel control buttons
      this._panelControlsBox = new St.BoxLayout({
        style_class: "panel-controls-box",
        style: "spacing: 2px;",
      });
      this._box.add_child(this._panelControlsBox);

      this._panelPrevBtn = this._createPanelButton("media-skip-backward-symbolic");
      this._panelPrevBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPrevious();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
      this._panelControlsBox.add_child(this._panelPrevBtn);

      this._panelPlayBtn = this._createPanelButton("media-playback-start-symbolic");
      this._panelPlayBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPlayPause();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
      this._panelControlsBox.add_child(this._panelPlayBtn);

      this._panelNextBtn = this._createPanelButton("media-skip-forward-symbolic");
      this._panelNextBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onNext();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
      this._panelControlsBox.add_child(this._panelNextBtn);

      // Scrolling label
      this._label = new St.Label({
        text: "",
        y_align: Clutter.ActorAlign.CENTER,
        style: "margin-left: 4px;",
      });
      this._label.clutter_text.ellipsize = 0;
      this._box.add_child(this._label);
      this._label.hide();

      // Media controls UI
      this._controls = new MediaControls();
      const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      item.add_child(this._controls);
      this.menu.addMenuItem(item);

      // Connect control signals
      this._controls.connect("play-pause", () => this._onPlayPause());
      this._controls.connect("next", () => this._onNext());
      this._controls.connect("previous", () => this._onPrevious());
      this._controls.connect("shuffle", () => this._onShuffle());
      this._controls.connect("repeat", () => this._onRepeat());
      this._controls.connect("seek", (_, position) => this._onSeek(position));
      this._controls.connect("player-changed", (_, name) => {
        this._currentPlayer = name;
        this._updateUI();
      });

      // Menu open/close handling
      this.menu.connect("open-state-changed", (menu, open) => {
        if (open) {
          this._controls.startPositionUpdate();
          this._setupWindowMonitoring();
        } else {
          this._controls.stopPositionUpdate();
          this._removeWindowMonitoring();
        }
      });

      // Settings bindings
      this._settingsChangedId = this._settings.connect("changed", (_, key) => {
        if (key === "panel-position" || key === "panel-index") {
          GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._repositionIndicator();
            return GLib.SOURCE_REMOVE;
          });
        } else {
          this._updateLabel();
          this._updateVisibility();
        }
      });

      // Session mode monitoring
      this._sessionModeId = Main.sessionMode.connect("updated", () => {
        this._updateVisibility();
      });

      // Initialize MPRIS
      this._manager = new MprisManager();
      this._initManager();

      this.hide();
    }

    _setupWindowMonitoring() {
      this._removeWindowMonitoring();

      // Monitor mouse clicks outside popup
      this._capturedEventId = global.stage.connect("button-press-event", (actor, event) => {
        if (!this.menu.isOpen) return Clutter.EVENT_PROPAGATE;

        const [x, y] = event.get_coords();
        const clickedActor = global.stage.get_actor_at_pos(Clutter.PickMode.ALL, x, y);

        if (this.menu.actor.contains(clickedActor) || this.contains(clickedActor)) {
          return Clutter.EVENT_PROPAGATE;
        }

        this.menu.close();
        return Clutter.EVENT_STOP;
      });

      // Monitor window focus changes
      const windowTracker = global.display;
      this._windowFocusId = windowTracker.connect("notify::focus-window", () => {
        if (!this.menu.isOpen) return;

        const focusedWindow = global.display.focus_window;
        
        // Close popup when any window gains focus
        if (focusedWindow) {
          this.menu.close();
        }
      });

      // Monitor overview (Activities) showing
      this._overviewShowingId = Main.overview.connect("showing", () => {
        if (this.menu.isOpen) {
          this.menu.close();
        }
      });

      // Monitor other popups/modals
      const layoutManager = Main.layoutManager;
      if (layoutManager._isPopupWindowVisible) {
        this._modalId = layoutManager.connect("modals-changed", () => {
          if (this.menu.isOpen && layoutManager.modalCount > 0) {
            this.menu.close();
          }
        });
      }
    }

    _removeWindowMonitoring() {
      if (this._capturedEventId) {
        global.stage.disconnect(this._capturedEventId);
        this._capturedEventId = null;
      }

      if (this._windowFocusId) {
        global.display.disconnect(this._windowFocusId);
        this._windowFocusId = null;
      }

      if (this._overviewShowingId) {
        Main.overview.disconnect(this._overviewShowingId);
        this._overviewShowingId = null;
      }

      if (this._modalId) {
        Main.layoutManager.disconnect(this._modalId);
        this._modalId = null;
      }
    }

    _createPanelButton(iconName) {
      const button = new St.Button({
        style_class: "panel-media-button",
        can_focus: true,
        track_hover: true,
        reactive: true,
      });

      const icon = new St.Icon({
        icon_name: iconName,
        icon_size: 14,
      });

      button.set_child(icon);
      return button;
    }

    _repositionIndicator() {
      const position = this._settings.get_string("panel-position");
      const index = this._settings.get_int("panel-index");
      
      const wasVisible = this.visible;
      const manager = this._manager;
      const player = this._currentPlayer;
      
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
        
        const actualIndex = index === -1 ? 0 : Math.min(index, targetBox.get_n_children());
        targetBox.insert_child_at_index(this.container, actualIndex);
        
        this._manager = manager;
        this._currentPlayer = player;
        
        if (wasVisible) {
          this.show();
        }
      } catch (e) {
        logError(e, "Failed to reposition");
      }
    }

    async _initManager() {
      try {
        await this._manager.init({
          added: (name) => this._onPlayerAdded(name),
          removed: (name) => this._onPlayerRemoved(name),
          changed: (name) => this._onPlayerChanged(name),
          seeked: (name, position) => this._onSeeked(name, position),
        });

        const players = this._manager.getPlayers();
        if (players.length > 0) {
          for (const name of players) {
            const info = this._manager.getPlayerInfo(name);
            if (info && info.status === "Playing") {
              this._currentPlayer = name;
              break;
            }
          }
          
          if (!this._currentPlayer) {
            this._currentPlayer = players[0];
          }
          
          this._updateUI();
          this._updateVisibility();
        }
      } catch (e) {
        logError(e, "Failed to initialize MPRIS");
      }
    }

    _updateVisibility() {
      const isLocked = Main.sessionMode.isLocked;
      const isUnlockDialog = Main.sessionMode.currentMode === 'unlock-dialog';
      const showOnLockScreen = this._settings.get_boolean("show-on-lock-screen");
      const hasPlayers = this._manager && this._manager.getPlayers().length > 0;

      if (!hasPlayers) {
        this.hide();
        return;
      }

      const info = this._currentPlayer ? this._manager.getPlayerInfo(this._currentPlayer) : null;
      const hasMedia = info && (info.status === "Playing" || info.status === "Paused");

      if (isLocked || isUnlockDialog) {
        if (showOnLockScreen && hasMedia) {
          this.show();
        } else {
          this.hide();
        }
      } else {
        if (hasMedia) {
          this.show();
        } else {
          this.hide();
        }
      }
    }

    _onPlayerAdded(name) {
      const info = this._manager.getPlayerInfo(name);

      if (info && info.status === "Playing") {
        this._currentPlayer = name;
        this._updateUI();
        this._updateVisibility();
      } else if (!this._currentPlayer) {
        this._currentPlayer = name;
        this._updateUI();
        this._updateVisibility();
      }

      this._updateTabs();
    }

    _onPlayerRemoved(name) {
      if (this._currentPlayer === name) {
        this._selectNextPlayer();
      }
      this._updateTabs();
      this._updateVisibility();
    }

    _onPlayerChanged(name) {
      const now = GLib.get_monotonic_time();
      
      if (now - this._lastUpdateTime < 50000) {
        if (this._updateThrottle) {
          GLib.source_remove(this._updateThrottle);
        }
        
        this._updateThrottle = GLib.timeout_add(GLib.PRIORITY_LOW, 50, () => {
          this._performUpdate(name);
          this._updateThrottle = null;
          return GLib.SOURCE_REMOVE;
        });
        return;
      }
      
      this._performUpdate(name);
    }

    _performUpdate(name) {
      this._lastUpdateTime = GLib.get_monotonic_time();
      const info = this._manager.getPlayerInfo(name);

      if (this._currentPlayer === name) {
        this._updateUI();
        this._updateVisibility();
        
        if (this.menu.isOpen && this._controls) {
          this._controls.update(info, name, this._manager);
        }
      } else if (info && info.status === "Playing") {
        this._currentPlayer = name;
        this._updateUI();
        this._updateTabs();
        this._updateVisibility();
      }
    }

    _onSeeked(name, position) {
      if (this._currentPlayer === name) {
        this._controls.onSeeked(position);
      }
    }

    _selectNextPlayer() {
      const players = this._manager.getPlayers();

      for (const name of players) {
        const info = this._manager.getPlayerInfo(name);
        if (info && info.status === "Playing") {
          this._currentPlayer = name;
          this._updateUI();
          this._updateTabs();
          this._updateVisibility();
          return;
        }
      }

      if (players.length > 0) {
        this._currentPlayer = players[0];
        this._updateUI();
        this._updateTabs();
        this._updateVisibility();
      } else {
        this._currentPlayer = null;
        this._stopScrolling();
        this._label.hide();
        this.hide();
      }
    }

    _updateUI() {
      if (!this._currentPlayer) {
        this._stopScrolling();
        this._label.hide();
        this.hide();
        return;
      }

      const info = this._manager.getPlayerInfo(this._currentPlayer);
      if (!info) {
        this._stopScrolling();
        this._label.hide();
        this.hide();
        return;
      }

      this._controls.update(info, this._currentPlayer, this._manager);
      this._updateAppIcon();

      const playIcon = info.status === "Playing" 
        ? "media-playback-pause-symbolic" 
        : "media-playback-start-symbolic";
      this._panelPlayBtn.child.icon_name = playIcon;

      this._updateLabel();
      this._updateTabs();
    }

    _updateAppIcon() {
      if (!this._currentPlayer) {
        this._icon.icon_name = "audio-x-generic-symbolic";
        return;
      }

      const appIcon = this._manager.getAppIcon(this._currentPlayer);
      this._icon.icon_name = appIcon;
    }

    _updateLabel() {
      const showTrackName = this._settings.get_boolean("show-track-name");
      
      if (!this._currentPlayer) {
        this._stopScrolling();
        this._label.hide();
        return;
      }

      const info = this._manager.getPlayerInfo(this._currentPlayer);
      if (!showTrackName || !info || (info.status !== "Playing" && info.status !== "Paused")) {
        this._stopScrolling();
        this._label.hide();
        return;
      }

      const showArtist = this._settings.get_boolean("show-artist");
      const separator = this._settings.get_string("separator-text");

      let text = info.title || "Unknown";

      if (showArtist && info.artists && info.artists.length > 0) {
        text += separator + info.artists.join(", ");
      }

      const maxLength = this._settings.get_int("max-title-length");

      if (text.length > maxLength) {
        this._fullText = text;
        this._startScrolling();
      } else {
        this._stopScrolling();
        this._label.text = text;
      }

      this._label.show();
    }

    _startScrolling() {
      this._stopScrolling();

      const maxLength = this._settings.get_int("max-title-length");
      const scrollSpeed = this._settings.get_int("scroll-speed");
      
      const paddedText = this._fullText + "   •   ";
      const interval = Math.max(50, 300 - scrollSpeed * 25);

      this._scrollTimeout = GLib.timeout_add(GLib.PRIORITY_LOW, interval, () => {
        this._scrollPosition++;

        if (this._scrollPosition >= paddedText.length) {
          this._scrollPosition = 0;
        }

        const displayText =
          paddedText.substring(this._scrollPosition) +
          paddedText.substring(0, this._scrollPosition);

        this._label.text = displayText.substring(0, maxLength);

        return GLib.SOURCE_CONTINUE;
      });
    }

    _stopScrolling() {
      if (this._scrollTimeout) {
        GLib.source_remove(this._scrollTimeout);
        this._scrollTimeout = null;
      }
      this._scrollPosition = 0;
    }

    _updateTabs() {
      const players = this._manager.getPlayers();
      this._controls.updateTabs(players, this._currentPlayer, this._manager);
    }

    _onPlayPause() {
      if (this._currentPlayer) {
        this._manager.playPause(this._currentPlayer).catch((e) => {
          logError(e, "Failed to toggle play/pause");
        });
      }
    }

    _onNext() {
      if (this._currentPlayer) {
        this._manager.next(this._currentPlayer).catch((e) => {
          logError(e, "Failed to skip next");
        });
      }
    }

    _onPrevious() {
      if (this._currentPlayer) {
        this._manager.previous(this._currentPlayer).catch((e) => {
          logError(e, "Failed to skip previous");
        });
      }
    }

    _onShuffle() {
      if (this._currentPlayer) {
        this._manager.toggleShuffle(this._currentPlayer).catch((e) => {
          logError(e, "Failed to toggle shuffle");
        });
      }
    }

    _onRepeat() {
      if (this._currentPlayer) {
        this._manager.cycleLoopStatus(this._currentPlayer).catch((e) => {
          logError(e, "Failed to cycle repeat");
        });
      }
    }

    _onSeek(position) {
      if (!this._currentPlayer) return;

      try {
        const proxy = this._manager._proxies.get(this._currentPlayer);
        if (!proxy) return;

        const metadata = proxy.get_cached_property("Metadata");
        if (!metadata) return;

        const meta = metadata.deep_unpack();
        const trackId = meta["mpris:trackid"]?.unpack() || "/";

        this._manager.setPosition(this._currentPlayer, trackId, position).catch((e) => {
          logError(e, "Failed to seek");
        });
      } catch (e) {
        logError(e, "Error during seek");
      }
    }

    destroy() {
      this._stopScrolling();
      this._removeWindowMonitoring();
      
      if (this._updateThrottle) {
        GLib.source_remove(this._updateThrottle);
        this._updateThrottle = null;
      }
      
      if (this._settingsChangedId) {
        this._settings.disconnect(this._settingsChangedId);
        this._settingsChangedId = 0;
      }

      if (this._sessionModeId) {
        Main.sessionMode.disconnect(this._sessionModeId);
        this._sessionModeId = 0;
      }

      if (this._controls) {
        this._controls.destroy();
        this._controls = null;
      }

      if (this._manager) {
        this._manager.destroy();
        this._manager = null;
      }

      super.destroy();
    }
  }
);