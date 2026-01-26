import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Gio from "gi://Gio";
import Clutter from "gi://Clutter";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";

export const ProgressSlider = GObject.registerClass(
  {
    Signals: {
      seek: { param_types: [GObject.TYPE_DOUBLE] },
      "drag-begin": {},
      "drag-end": {},
    },
  },
  class ProgressSlider extends St.BoxLayout {
    _init() {
      super._init({
        vertical: true,
        style: "spacing: 10px; margin-bottom: 20px;",
      });

      this._updateInterval = null;
      this._sliderDragging = false;
      this._currentPosition = 0;
      this._trackLength = 0;
      this._isPlaying = false;
      this._playerName = null;
      this._trackId = null;
      this._canSeek = true;

      this._buildUI();
    }

    _buildUI() {
      const sliderContainer = new St.BoxLayout({
        style: "margin: 0 8px;",
      });

      this._positionSlider = new Slider.Slider(0);
      this._positionSlider.accessible_name = "Position";

      this._sliderChangedId = this._positionSlider.connect("notify::value", () => {
        if (this._sliderDragging) {
          this._updateTimeLabel();
        }
      });

      this._positionSlider.connect("drag-begin", () => {
        this._sliderDragging = true;
        this.stopPositionUpdate();
        this.emit("drag-begin");
      });

      this._positionSlider.connect("drag-end", () => {
        if (!this._sliderDragging) return;

        this._sliderDragging = false;
        const newPosition = this._positionSlider.value * this._trackLength;

        this.emit("seek", newPosition / 1000000);
        this.emit("drag-end");

        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
          if (this._isPlaying) {
            this.startPositionUpdate();
          }
          return GLib.SOURCE_REMOVE;
        });
      });

      sliderContainer.add_child(this._positionSlider);
      this.add_child(sliderContainer);

      const timeBox = new St.BoxLayout({
        style: "margin: 0 8px;",
      });

      this._currentTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7);",
      });

      this._totalTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.5);",
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
      });

      timeBox.add_child(this._currentTimeLabel);
      timeBox.add_child(this._totalTimeLabel);
      this.add_child(timeBox);
    }

    setPlayerName(name) {
      this._playerName = name;
    }

    updatePlaybackState(isPlaying, metadata, status) {
      this._isPlaying = isPlaying;

      if (metadata) {
        this._trackLength = metadata["mpris:length"] || 0;
        this._trackId = metadata["mpris:trackid"] || null;

        this._totalTimeLabel.text = this._formatTime(this._trackLength / 1000000);

        if (!this._trackId || !this._trackLength) {
          this._canSeek = false;
          this._positionSlider.reactive = false;
          this.visible = false;
          return;
        } else {
          this._canSeek = true;
          this._positionSlider.reactive = true;
          this.visible = true;
        }
      }

      if (isPlaying) {
        this.startPositionUpdate();
      } else {
        this.stopPositionUpdate();
      }
    }

    _syncGetProperty(busName, property) {
      if (!busName) return null;

      try {
        const result = Gio.DBus.session.call_sync(
          busName,
          "/org/mpris/MediaPlayer2",
          "org.freedesktop.DBus.Properties",
          "Get",
          new GLib.Variant("(ss)", ["org.mpris.MediaPlayer2.Player", property]),
          null,
          Gio.DBusCallFlags.NONE,
          50,
          null,
        );
        return result.recursiveUnpack()[0];
      } catch (e) {
        return null;
      }
    }

    _updateSliderPosition() {
      if (this._sliderDragging || !this._playerName || !this._trackLength) {
        return;
      }

      try {
        let position = this._syncGetProperty(this._playerName, "Position");

        if (position === null || position === 0) {
          position = this._currentPosition;
        } else {
          this._currentPosition = position;
        }

        position = Math.max(0, Math.min(position, this._trackLength));

        this._positionSlider.block_signal_handler(this._sliderChangedId);
        this._positionSlider.value = this._trackLength > 0 ? position / this._trackLength : 0;
        this._positionSlider.unblock_signal_handler(this._sliderChangedId);

        this._currentTimeLabel.text = this._formatTime(position / 1000000);
      } catch (e) {}
    }

    _updateTimeLabel() {
      if (this._trackLength > 0) {
        const position = this._positionSlider.value * this._trackLength;
        this._currentTimeLabel.text = this._formatTime(position / 1000000);
      }
    }

    _formatTime(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";

      seconds = Math.floor(seconds);
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    startPositionUpdate() {
      this.stopPositionUpdate();
      this._updateSliderPosition();

      this._updateInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (!this._sliderDragging && this._isPlaying) {
          this._updateSliderPosition();
        }
        return GLib.SOURCE_CONTINUE;
      });
    }

    stopPositionUpdate() {
      if (this._updateInterval) {
        GLib.source_remove(this._updateInterval);
        this._updateInterval = null;
      }
    }

    onSeeked(position) {
      this._currentPosition = position;

      if (!this._sliderDragging) {
        this._updateSliderPosition();
      }
    }

    get currentPosition() {
      return this._currentPosition;
    }

    get trackLength() {
      return this._trackLength;
    }

    set trackLength(value) {
      this._trackLength = value;
    }

    get sliderValue() {
      return this._positionSlider.value;
    }

    destroy() {
      this.stopPositionUpdate();

      if (this._sliderChangedId) {
        this._positionSlider.disconnect(this._sliderChangedId);
        this._sliderChangedId = 0;
      }

      super.destroy();
    }
  },
);