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

      // Create horizontal layout for icon and controls
      this._box = new St.BoxLayout({
        style_class: "panel-status-menu-box",
        style: "spacing: 6px;",
      });
      this.add_child(this._box);

      // Panel icon - shows app logo
      this._icon = new St.Icon({
        icon_name: "audio-x-generic-symbolic",
        style_class: "system-status-icon",
        icon_size: 16,
      });
      this._box.add_child(this._icon);

      // Panel control buttons container
      this._panelControlsBox = new St.BoxLayout({
        style: "spacing: 3px;",
      });
      this._box.add_child(this._panelControlsBox);

      // Previous button
      this._panelPrevBtn = this._createPanelButton("media-skip-backward-symbolic");
      this._panelPrevBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPrevious();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
      this._panelControlsBox.add_child(this._panelPrevBtn);

      // Play/Pause button
      this._panelPlayBtn = this._createPanelButton("media-playback-start-symbolic");
      this._panelPlayBtn.connect("button-press-event", (actor, event) => {
        if (event.get_button() === 1) {
          this._onPlayPause();
          return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
      });
      this._panelControlsBox.add_child(this._panelPlayBtn);

      // Next button
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

      // Media controls UI (popup)
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

      // Start/stop position updates when menu opens/closes
      this.menu.connect("open-state-changed", (menu, open) => {
        if (open) {
          this._controls.startPositionUpdate();
        } else {
          this._controls.stopPositionUpdate();
        }
      });

      // Settings bindings
      this._settingsChangedId = this._settings.connect("changed", (_, key) => {
        if (key === "panel-position" || key === "panel-index") {
          this._repositionIndicator();
        } else {
          this._updateLabel();
          this._updateVisibility();
        }
      });

      // Monitor session mode for lock screen
      this._sessionModeId = Main.sessionMode.connect("updated", () => {
        this._updateVisibility();
      });

      // Initialize MPRIS manager
      this._manager = new MprisManager();
      this._initManager();

      // Initially hide until we have players
      this.hide();
    }

    _createPanelButton(iconName) {
      const button = new St.Button({
        style_class: "panel-button",
        style: "padding: 3px 5px; border-radius: 3px;",
        can_focus: true,
        track_hover: true,
        reactive: true,
      });

      const icon = new St.Icon({
        icon_name: iconName,
        icon_size: 14,
      });

      button.set_child(icon);

      button.connect("enter-event", () => {
        button.style = "padding: 3px 5px; border-radius: 3px; background-color: rgba(255,255,255,0.1);";
      });

      button.connect("leave-event", () => {
        button.style = "padding: 3px 5px; border-radius: 3px;";
      });

      return button;
    }

    _repositionIndicator() {
      log("MediaControls: Starting reposition...");
      
      const position = this._settings.get_string("panel-position");
      const index = this._settings.get_int("panel-index");
      
      // Store current state
      const wasVisible = this.visible;
      const currentManager = this._manager;
      const currentPlayer = this._currentPlayer;
      
      // Remove from panel
      this.container.remove_child(this);
      
      // Add back to new position
      const actualIndex = index === -1 ? 0 : index;
      Main.panel.addToStatusArea("media-controls", this, actualIndex, position);
      
      // Restore state
      this._manager = currentManager;
      this._currentPlayer = currentPlayer;
      
      if (wasVisible) {
        this.show();
      }
      
      log(`MediaControls: Repositioned to ${position}[${actualIndex}]`);
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
        logError(e, "Failed to initialize MPRIS manager");
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
      const info = this._manager.getPlayerInfo(name);

      if (this._currentPlayer === name) {
        this._updateUI();
        this._updateVisibility();
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

      // Update media controls
      this._controls.update(info, this._currentPlayer, this._manager);

      // Update panel icon to show app logo
      this._updateAppIcon();

      // Update panel play button icon
      const playIcon = info.status === "Playing" 
        ? "media-playback-pause-symbolic" 
        : "media-playback-start-symbolic";
      this._panelPlayBtn.child.icon_name = playIcon;

      // Update scrolling text in panel
      this._updateLabel();

      // Update tabs
      this._updateTabs();
    }

    _updateAppIcon() {
      if (!this._currentPlayer) {
        this._icon.icon_name = "audio-x-generic-symbolic";
        return;
      }

      const appIcon = this._manager.getAppIcon(this._currentPlayer);
      this._icon.icon_name = appIcon;
      
      log(`MediaControls: Panel icon set to ${appIcon}`);
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

      this._scrollTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => {
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
          logError(e, "Failed to skip to next track");
        });
      }
    }

    _onPrevious() {
      if (this._currentPlayer) {
        this._manager.previous(this._currentPlayer).catch((e) => {
          logError(e, "Failed to skip to previous track");
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
          logError(e, "Failed to cycle repeat mode");
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
        logError(e, "Error during seek operation");
      }
    }

    destroy() {
      this._stopScrolling();
      
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