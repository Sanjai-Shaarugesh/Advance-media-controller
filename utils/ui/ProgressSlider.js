import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";

export const ProgressSlider = GObject.registerClass(
  {
    Signals: {
      "seek": { param_types: [GObject.TYPE_DOUBLE] },
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
      this._lastUpdateTime = 0;
      this._ignoreNextUpdate = false;

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
        this._ignoreNextUpdate = true;
        this.emit("drag-begin");
      });

      this._positionSlider.connect("drag-end", () => {
        this._sliderDragging = false;
        
        const newPosition = this._positionSlider.value * this._trackLength;
        this._currentPosition = newPosition;
        this._lastUpdateTime = GLib.get_monotonic_time();
        
        this.emit("seek", newPosition / 1000000);
        this.emit("drag-end");
        
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this._ignoreNextUpdate = false;
          if (this._isPlaying) {
            this.startPositionUpdate();
          }
          return GLib.SOURCE_REMOVE;
        });
      });

      sliderContainer.add_child(this._positionSlider);
      this.add_child(sliderContainer);

      // Time labels
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

    updateFromExternalSource(position, length, isPlaying, forceUpdate = false) {
      if (this._sliderDragging || this._ignoreNextUpdate) return;

      const now = GLib.get_monotonic_time();
      
      // Check if this is a significant position change (seek from external source)
      const positionDrift = Math.abs((position - this._currentPosition) / 1000000);
      const isExternalSeek = positionDrift > 2.0;
      
      if (forceUpdate || isExternalSeek) {
        // External change detected - reset everything
        this._currentPosition = position;
        this._trackLength = length;
        this._isPlaying = isPlaying;
        this._lastUpdateTime = now;
        this._updateSliderPosition();
        
        if (isPlaying) {
          this.startPositionUpdate();
        } else {
          this.stopPositionUpdate();
        }
      } else {
        // Normal update - just sync play state and length
        const wasPlaying = this._isPlaying;
        this._isPlaying = isPlaying;
        this._trackLength = length;
        
        // Handle play/pause transitions
        if (wasPlaying && !isPlaying) {
          // Just paused
          const elapsed = now - this._lastUpdateTime;
          this._currentPosition = this._currentPosition + elapsed;
          this._lastUpdateTime = now;
          this.stopPositionUpdate();
          this._updateSliderPosition();
        } else if (!wasPlaying && isPlaying) {
          // Just resumed
          this._lastUpdateTime = now;
          this.startPositionUpdate();
        }
      }
    }

    restoreState(position, length, sliderValue, isPlaying, lastUpdateTime) {
      this.stopPositionUpdate();
      
      this._currentPosition = position;
      this._trackLength = length;
      this._isPlaying = isPlaying;
      this._lastUpdateTime = lastUpdateTime || GLib.get_monotonic_time();
      
      this._updateSliderPosition();
      
      if (isPlaying) {
        this.startPositionUpdate();
      }
    }

    _updateSliderPosition() {
      if (this._sliderDragging || this._trackLength === 0) {
        return;
      }

      let displayPosition = this._currentPosition;

      if (this._isPlaying) {
        const now = GLib.get_monotonic_time();
        const elapsed = now - this._lastUpdateTime;
        displayPosition = this._currentPosition + elapsed;
      }

      displayPosition = Math.max(0, Math.min(displayPosition, this._trackLength));

      this._positionSlider.block_signal_handler(this._sliderChangedId);
      this._positionSlider.value = this._trackLength > 0 ? displayPosition / this._trackLength : 0;
      this._positionSlider.unblock_signal_handler(this._sliderChangedId);

      this._currentTimeLabel.text = this._formatTime(displayPosition / 1000000);
      this._totalTimeLabel.text = this._formatTime(this._trackLength / 1000000);
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
      
      this._updateInterval = GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
        if (!this._sliderDragging && !this._ignoreNextUpdate && this._isPlaying) {
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
      if (this._ignoreNextUpdate || this._sliderDragging) return;
      
      this._currentPosition = position;
      this._lastUpdateTime = GLib.get_monotonic_time();
      this._updateSliderPosition();
    }

    get currentPosition() { return this._currentPosition; }
    get trackLength() { return this._trackLength; }
    get sliderValue() { return this._positionSlider.value; }
    get isDragging() { return this._sliderDragging; }
    get isPlaying() { return this._isPlaying; }
    get lastUpdateTime() { return this._lastUpdateTime; }

    destroy() {
      this.stopPositionUpdate();
      
      if (this._sliderChangedId) {
        this._positionSlider.disconnect(this._sliderChangedId);
        this._sliderChangedId = 0;
      }
      
      super.destroy();
    }
  }
);