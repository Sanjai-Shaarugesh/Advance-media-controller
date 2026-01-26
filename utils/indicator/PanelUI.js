import St from "gi://St";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";

export class PanelUI {
  constructor(indicator) {
    this._indicator = indicator;
    this._buildUI();
  }

  _buildUI() {
    this._box = new St.BoxLayout({
      style_class: "panel-status-menu-box panel-button-box",
      style: "spacing: 6px;",
    });
    this._indicator.add_child(this._box);

    this._icon = new St.Icon({
      icon_size: 18,
      y_align: Clutter.ActorAlign.CENTER,
    });
    this._icon.set_fallback_gicon(null);
    this._box.add_child(this._icon);

    this._panelControlsBox = new St.BoxLayout({
      style_class: "panel-controls-box",
      style: "spacing: 2px;",
    });
    this._box.add_child(this._panelControlsBox);

    this._panelPrevBtn = this._createPanelButton("media-skip-backward-symbolic");
    this._panelControlsBox.add_child(this._panelPrevBtn);

    this._panelPlayBtn = this._createPanelButton("media-playback-start-symbolic");
    this._panelControlsBox.add_child(this._panelPlayBtn);

    this._panelNextBtn = this._createPanelButton("media-skip-forward-symbolic");
    this._panelControlsBox.add_child(this._panelNextBtn);

    this._label = new St.Label({
      text: "",
      y_align: Clutter.ActorAlign.CENTER,
      style: "margin-left: 4px;",
    });
    this._label.clutter_text.ellipsize = 0;
    this._box.add_child(this._label);
    this._label.hide();
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

  get box() { return this._box; }
  get icon() { return this._icon; }
  get panelPrevBtn() { return this._panelPrevBtn; }
  get panelPlayBtn() { return this._panelPlayBtn; }
  get panelNextBtn() { return this._panelNextBtn; }
  get label() { return this._label; }

  startScrolling(fullText, settings) {
    this.stopScrolling();

    try {
      const maxLength = settings.get_int("max-title-length");
      const scrollSpeed = settings.get_int("scroll-speed");
      const paddedText = fullText + "   •   ";
      const interval = Math.max(50, 300 - scrollSpeed * 25);

      this._indicator._state._scrollTimeout = GLib.timeout_add(GLib.PRIORITY_LOW, interval, () => {
        if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging) {
          return GLib.SOURCE_REMOVE;
        }

        this._indicator._state._scrollPosition++;

        if (this._indicator._state._scrollPosition >= paddedText.length) {
          this._indicator._state._scrollPosition = 0;
        }

        const displayText = paddedText.substring(this._indicator._state._scrollPosition) +
                          paddedText.substring(0, this._indicator._state._scrollPosition);

        this._label.text = displayText.substring(0, maxLength);

        return GLib.SOURCE_CONTINUE;
      });
    } catch (e) {
      logError(e, "Error in scrolling");
    }
  }

  stopScrolling() {
    if (this._indicator._state._scrollTimeout) {
      try {
        GLib.source_remove(this._indicator._state._scrollTimeout);
      } catch (e) {}
      this._indicator._state._scrollTimeout = null;
    }
    this._indicator._state._scrollPosition = 0;
  }

  updateAppIcon(manager, currentPlayer) {
    if (this._indicator._state._isDestroyed || this._indicator._state._sessionChanging)
      return;

    try {
      if (!currentPlayer) {
        this._icon.set_gicon(Gio.icon_new_for_string("audio-x-generic-symbolic"));
        return;
      }

      const appInfo = manager.getAppInfo(currentPlayer);
      if (appInfo && appInfo.get_icon()) {
        this._icon.set_gicon(appInfo.get_icon());
      } else {
        this._icon.set_gicon(Gio.icon_new_for_string("audio-x-generic-symbolic"));
      }
    } catch (e) {
      this._icon.set_gicon(Gio.icon_new_for_string("audio-x-generic-symbolic"));
    }
  }
}