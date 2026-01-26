import * as Main from "resource:///org/gnome/shell/ui/main.js";

export class IndicatorUIUpdater {
  constructor(indicator) {
    this._indicator = indicator;
  }

  updateVisibility() {
    if (this._indicator._state._isDestroyed || this._indicator._state._isInitializing ||
        this._indicator._state._sessionChanging || !this._indicator._state._managerInitialized)
      return;

    try {
      const isLocked = Main.sessionMode.isLocked || false;
      const isUnlockDialog = Main.sessionMode.currentMode === "unlock-dialog";

      const hasPlayers = this._indicator._manager && 
                        this._indicator._manager.getPlayers().length > 0;

      if (!hasPlayers) {
        this._indicator.hide();
        return;
      }

      const info = this._indicator._state._currentPlayer
        ? this._indicator._manager.getPlayerInfo(this._indicator._state._currentPlayer)
        : null;
      const hasMedia = info && (info.status === "Playing" || info.status === "Paused");

      if (isLocked || isUnlockDialog) {
        this._indicator.hide();
      } else {
        if (hasMedia) {
          this._indicator.show();
        } else {
          this._indicator.hide();
        }
      }
    } catch (e) {}
  }

  updateUI() {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging)
      return;

    try {
      if (!this._indicator._state._currentPlayer) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        this._indicator.hide();
        return;
      }

      const info = this._indicator._manager.getPlayerInfo(this._indicator._state._currentPlayer);
      if (!info) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        this._indicator.hide();
        return;
      }

      this._indicator._controls.update(
        info,
        this._indicator._state._currentPlayer,
        this._indicator._manager,
      );
      this._indicator._panelUI.updateAppIcon(
        this._indicator._manager,
        this._indicator._state._currentPlayer,
      );

      const playIcon = info.status === "Playing"
        ? "media-playback-pause-symbolic"
        : "media-playback-start-symbolic";
      this._indicator._panelUI.panelPlayBtn.child.icon_name = playIcon;

      this.updateLabel();
      this.updateTabs();
    } catch (e) {
      logError(e, "Error in updateUI");
    }
  }

  updateLabel() {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging)
      return;

    try {
      const showTrackName = this._indicator._settings.get_boolean("show-track-name");

      if (!this._indicator._state._currentPlayer) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        return;
      }

      const info = this._indicator._manager.getPlayerInfo(this._indicator._state._currentPlayer);
      if (!showTrackName || !info || (info.status !== "Playing" && info.status !== "Paused")) {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.hide();
        return;
      }

      const showArtist = this._indicator._settings.get_boolean("show-artist");
      const separator = this._indicator._settings.get_string("separator-text");

      let text = info.title || "Unknown";

      if (showArtist && info.artists && info.artists.length > 0) {
        text += separator + info.artists.join(", ");
      }

      const maxLength = this._indicator._settings.get_int("max-title-length");

      if (text.length > maxLength) {
        this._indicator._state._fullText = text;
        this._indicator._panelUI.startScrolling(text, this._indicator._settings);
      } else {
        this._indicator._panelUI.stopScrolling();
        this._indicator._panelUI.label.text = text;
      }

      this._indicator._panelUI.label.show();
    } catch (e) {
      logError(e, "Error in updateLabel");
    }
  }

  updateTabs() {
    if (this._indicator._state._isDestroyed || !this._indicator._controls ||
        this._indicator._state._sessionChanging)
      return;

    try {
      const players = this._indicator._manager.getPlayers();
      this._indicator._controls.updateTabs(
        players,
        this._indicator._state._currentPlayer,
        this._indicator._manager,
      );
    } catch (e) {
      logError(e, "Error in updateTabs");
    }
  }
}