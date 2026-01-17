import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MediaIndicator } from "./indicator.js";
import { SessionMode } from "resource:///org/gnome/shell/ui/sessionMode.js";

export default class MediaExtension extends Extension {
  enable() {
    log("Media Controls Extension Enabled");

    this._settings = this.getSettings();
    
    // Get panel position settings
    const position = this._settings.get_string("panel-position");
    const index = this._settings.get_int("panel-index");

    this._indicator = new MediaIndicator(this._settings);
    
    // Add to panel with configured position
    Main.panel.addToStatusArea(
      "media-controls",
      this._indicator,
      index === -1 ? 0 : index,
      position
    );

    // Watch for position changes
    this._positionChangedId = this._settings.connect(
      "changed::panel-position",
      () => this._onPositionChanged()
    );
    
    this._indexChangedId = this._settings.connect(
      "changed::panel-index",
      () => this._onPositionChanged()
    );

    // Watch for lock screen setting
    this._lockScreenChangedId = this._settings.connect(
      "changed::show-on-lock-screen",
      () => this._updateLockScreenVisibility()
    );

    // Monitor session mode changes
    this._sessionModeChangedId = Main.sessionMode.connect(
      "updated",
      () => this._updateLockScreenVisibility()
    );

    this._updateLockScreenVisibility();
  }

  _updateLockScreenVisibility() {
    if (!this._indicator) return;

    const showOnLockScreen = this._settings.get_boolean("show-on-lock-screen");
    const isLocked = Main.sessionMode.isLocked;

    if (isLocked && !showOnLockScreen) {
      this._indicator.hide();
    } else if (!isLocked) {
      // Show only if there are active players
      const hasPlayers = this._indicator._manager.getPlayers().length > 0;
      if (hasPlayers) {
        this._indicator.show();
      }
    } else if (isLocked && showOnLockScreen) {
      // Show on lock screen if there are active players
      const hasPlayers = this._indicator._manager.getPlayers().length > 0;
      if (hasPlayers) {
        this._indicator.show();
      }
    }
  }

  _onPositionChanged() {
    // Position change requires extension reload
    log("Panel position changed. Please restart GNOME Shell for changes to take effect.");
    
    // Show notification
    Main.notify(
      "Media Controls",
      "Panel position changed. Please restart GNOME Shell:\n" +
      "• X11: Press Alt+F2, type 'r', press Enter\n" +
      "• Wayland: Log out and back in"
    );
  }

  disable() {
    log("Media Controls Extension Disabled");

    if (this._positionChangedId) {
      this._settings.disconnect(this._positionChangedId);
      this._positionChangedId = 0;
    }

    if (this._indexChangedId) {
      this._settings.disconnect(this._indexChangedId);
      this._indexChangedId = 0;
    }

    if (this._lockScreenChangedId) {
      this._settings.disconnect(this._lockScreenChangedId);
      this._lockScreenChangedId = 0;
    }

    if (this._sessionModeChangedId) {
      Main.sessionMode.disconnect(this._sessionModeChangedId);
      this._sessionModeChangedId = 0;
    }

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
  }
}