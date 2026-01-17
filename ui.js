import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";

export const MediaControls = GObject.registerClass(
  {
    Signals: {
      "play-pause": {},
      "next": {},
      "previous": {},
      "shuffle": {},
      "repeat": {},
      "seek": { param_types: [GObject.TYPE_DOUBLE] },
      "player-changed": { param_types: [GObject.TYPE_STRING] },
    },
  },
  class MediaControls extends St.BoxLayout {
    _init() {
      super._init({
        vertical: true,
        style_class: "media-controls-modern",
      });

      this._coverCache = new Map();
      this._updateInterval = null;
      this._sliderDragging = false;
      
      // NEW: Improved position tracking
      this._currentPosition = 0;  // Current position in microseconds
      this._trackLength = 0;      // Track length in microseconds
      this._isPlaying = false;    // Playback state
      this._lastUpdateTime = 0;   // Last time we updated position
      this._ignoreNextUpdate = false;
      this._justResumed = false;  // Flag to prevent position reset on resume

      this._buildUI();
    }

    _buildUI() {
      // Player tabs
      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 20px; spacing: 8px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._tabsBox = new St.BoxLayout({
        style: "spacing: 8px;",
      });
      headerBox.add_child(this._tabsBox);
      this.add_child(headerBox);

      // Album art
      const coverContainer = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin-bottom: 24px;",
      });

      this._coverArt = new St.Bin({
        style: `
          width: 300px; 
          height: 300px; 
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
        `,
      });

      this._coverImage = new St.Icon({
        icon_size: 300,
        style: "border-radius: 16px;",
      });
      this._coverArt.set_child(this._coverImage);
      coverContainer.add_child(this._coverArt);
      this.add_child(coverContainer);

      // Track info
      const infoBox = new St.BoxLayout({
        vertical: true,
        style: "spacing: 6px; margin-bottom: 24px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._titleLabel = new St.Label({
        text: "No media playing",
        style: "font-weight: 700; font-size: 16px; color: rgba(255,255,255,0.95);",
      });
      this._titleLabel.clutter_text.ellipsize = 3;
      infoBox.add_child(this._titleLabel);

      this._artistLabel = new St.Label({
        text: "",
        style: "font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6);",
      });
      this._artistLabel.clutter_text.ellipsize = 3;
      infoBox.add_child(this._artistLabel);
      this.add_child(infoBox);

      // Progress section
      const progressBox = new St.BoxLayout({
        vertical: true,
        style: "spacing: 10px; margin-bottom: 20px;",
      });

      // Slider
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
        log("MediaControls: Drag BEGIN");
        this._sliderDragging = true;
        this._ignoreNextUpdate = true;
        this.stopPositionUpdate();
      });

      this._positionSlider.connect("drag-end", () => {
        log("MediaControls: Drag END");
        this._sliderDragging = false;
        
        const newPosition = this._positionSlider.value * this._trackLength;
        
        // Update our internal position
        this._currentPosition = newPosition;
        this._lastUpdateTime = GLib.get_monotonic_time();
        
        log(`MediaControls: Seeking to ${this._formatTime(newPosition / 1000000)}`);
        
        // Tell player to seek
        this.emit("seek", newPosition / 1000000);
        
        // Keep ignoring updates briefly after seek
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
          this._ignoreNextUpdate = false;
          
          // Restart updates if playing
          if (this._isPlaying) {
            this.startPositionUpdate();
          }
          return GLib.SOURCE_REMOVE;
        });
      });

      sliderContainer.add_child(this._positionSlider);
      progressBox.add_child(sliderContainer);

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
      progressBox.add_child(timeBox);
      this.add_child(progressBox);

      // Control buttons
      const controlsBox = new St.BoxLayout({
        style: "spacing: 16px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._shuffleBtn = this._createModernButton("media-playlist-shuffle-symbolic", 18);
      this._shuffleBtn.connect("clicked", () => this.emit("shuffle"));

      this._prevBtn = this._createModernButton("media-skip-backward-symbolic", 20);
      this._prevBtn.connect("clicked", () => this.emit("previous"));

      this._playBtn = this._createPlayButton("media-playback-start-symbolic", 26);
      this._playBtn.connect("clicked", () => this.emit("play-pause"));

      this._nextBtn = this._createModernButton("media-skip-forward-symbolic", 20);
      this._nextBtn.connect("clicked", () => this.emit("next"));

      this._repeatBtn = this._createModernButton("media-playlist-repeat-symbolic", 18);
      this._repeatBtn.connect("clicked", () => this.emit("repeat"));

      controlsBox.add_child(this._shuffleBtn);
      controlsBox.add_child(this._prevBtn);
      controlsBox.add_child(this._playBtn);
      controlsBox.add_child(this._nextBtn);
      controlsBox.add_child(this._repeatBtn);
      this.add_child(controlsBox);
    }

    _createModernButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-button-modern",
        style: `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
        `,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
          style: "color: rgba(255,255,255,0.9);",
        }),
      });

      button.connect("enter-event", () => {
        button.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.15);
          transform: scale(1.05);
        `;
      });

      button.connect("leave-event", () => {
        button.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
        `;
      });

      return button;
    }

    _createPlayButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-play-button-modern",
        style: `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        `,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
          style: "color: #ffffff;",
        }),
      });

      button.connect("enter-event", () => {
        button.style = `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%);
          box-shadow: 0 6px 20px rgba(0,0,0,0.4);
          transform: scale(1.08);
        `;
      });

      button.connect("leave-event", () => {
        button.style = `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        `;
      });

      return button;
    }

    update(info, playerName, manager) {
      if (!info) return;

      const wasPlaying = this._isPlaying;
      const newPlayState = info.status === "Playing";
      this._trackLength = info.length;

      // Update UI elements
      this._titleLabel.text = info.title || "Unknown";
      
      if (info.artists && info.artists.length > 0) {
        this._artistLabel.text = info.artists.join(", ");
        this._artistLabel.show();
      } else {
        this._artistLabel.hide();
      }

      // Update play button
      const playIcon = newPlayState ? "media-playback-pause-symbolic" : "media-playback-start-symbolic";
      this._playBtn.child.icon_name = playIcon;

      // Update shuffle
      if (info.shuffle) {
        this._shuffleBtn.add_style_class_name("active");
        this._shuffleBtn.child.style = "color: @theme_selected_bg_color;";
      } else {
        this._shuffleBtn.remove_style_class_name("active");
        this._shuffleBtn.child.style = "color: rgba(255,255,255,0.9);";
      }

      // Update repeat
      if (info.loopStatus === "Track") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-song-symbolic";
        this._repeatBtn.add_style_class_name("active");
        this._repeatBtn.child.style = "color: @theme_selected_bg_color;";
      } else if (info.loopStatus === "Playlist") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.add_style_class_name("active");
        this._repeatBtn.child.style = "color: @theme_selected_bg_color;";
      } else {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.remove_style_class_name("active");
        this._repeatBtn.child.style = "color: rgba(255,255,255,0.9);";
      }

      // COMPLETELY REWRITTEN: Position handling
      if (!this._sliderDragging && !this._ignoreNextUpdate) {
        const now = GLib.get_monotonic_time();
        
        // Detect state changes
        const justPaused = wasPlaying && !newPlayState;
        const justResumed = !wasPlaying && newPlayState;
        
        if (justPaused) {
          // Just paused - calculate and freeze current position
          log("MediaControls: PAUSED - freezing position");
          const elapsed = now - this._lastUpdateTime;
          this._currentPosition = this._currentPosition + elapsed;
          this._lastUpdateTime = now;
          this._isPlaying = false;
          this.stopPositionUpdate();
          log(`MediaControls: Frozen at ${this._formatTime(this._currentPosition / 1000000)}`);
          
        } else if (justResumed) {
          // Just resumed - DO NOT update position, continue from where we paused
          log("MediaControls: RESUMED - continuing from paused position");
          log(`MediaControls: Resuming from ${this._formatTime(this._currentPosition / 1000000)}`);
          this._lastUpdateTime = now;
          this._isPlaying = true;
          this._justResumed = true;
          this.startPositionUpdate();
          
          // Clear the flag after a brief moment
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            this._justResumed = false;
            return GLib.SOURCE_REMOVE;
          });
          
        } else if (newPlayState && !this._justResumed) {
          // Already playing - sync occasionally to prevent drift
          const timeSinceUpdate = (now - this._lastUpdateTime) / 1000000;
          
          // Only sync every 2 seconds to avoid constant resets
          if (timeSinceUpdate > 2.0) {
            const expectedPosition = this._currentPosition + (now - this._lastUpdateTime);
            const drift = Math.abs(expectedPosition - info.position) / 1000000;
            
            if (drift > 2.0) {
              log(`MediaControls: Large drift detected (${drift.toFixed(2)}s), syncing`);
              this._currentPosition = info.position;
              this._lastUpdateTime = now;
            }
          }
          
          this._isPlaying = true;
          
        } else if (!newPlayState && !justPaused) {
          // Still paused - don't update position at all
          this._isPlaying = false;
        }
        
        // Update the display
        this._updateSliderPosition();
      }

      // Load cover art
      if (info.artUrl) {
        this._loadCover(info.artUrl);
      } else {
        this._setDefaultCover();
      }
    }

    updateTabs(players, currentPlayer, manager) {
      this._tabsBox.destroy_all_children();

      players.forEach((name) => {
        const appIcon = manager.getAppIcon(name);
        const tab = this._createTab(appIcon, name, currentPlayer);
        this._tabsBox.add_child(tab);
      });
    }

    _createTab(iconName, playerName, currentPlayer) {
      const isActive = playerName === currentPlayer;
      
      const button = new St.Button({
        style_class: "media-tab-modern",
        style: isActive
          ? `padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.2); box-shadow: 0 2px 8px rgba(0,0,0,0.2);`
          : `padding: 8px 12px; border-radius: 12px; background: rgba(255,255,255,0.05); opacity: 0.6;`,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: 16,
        }),
      });

      button.connect("clicked", () => {
        this.emit("player-changed", playerName);
      });

      return button;
    }

    _loadCover(url) {
      if (this._coverCache.has(url)) {
        this._coverImage.gicon = this._coverCache.get(url);
        return;
      }

      try {
        let gicon;
        
        if (url.startsWith("file://")) {
          const file = Gio.File.new_for_uri(url);
          gicon = new Gio.FileIcon({ file });
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          this._downloadCover(url);
          return;
        } else {
          const file = Gio.File.new_for_path(url);
          gicon = new Gio.FileIcon({ file });
        }
        
        this._coverImage.gicon = gicon;
        this._coverCache.set(url, gicon);
      } catch (e) {
        this._setDefaultCover();
      }
    }

    _downloadCover(url) {
      const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
      const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "mpris-covers"]);
      GLib.mkdir_with_parents(cacheDir, 0o755);
      const cachePath = GLib.build_filenamev([cacheDir, hash]);
      const cacheFile = Gio.File.new_for_path(cachePath);

      if (cacheFile.query_exists(null)) {
        const gicon = new Gio.FileIcon({ file: cacheFile });
        this._coverImage.gicon = gicon;
        this._coverCache.set(url, gicon);
        return;
      }

      this._setDefaultCover();

      const source = Gio.File.new_for_uri(url);
      source.copy_async(
        cacheFile,
        Gio.FileCopyFlags.OVERWRITE,
        GLib.PRIORITY_LOW,
        null,
        null,
        (src, res) => {
          try {
            src.copy_finish(res);
            const gicon = new Gio.FileIcon({ file: cacheFile });
            this._coverImage.gicon = gicon;
            this._coverCache.set(url, gicon);
          } catch (e) {
            // Silent fail
          }
        }
      );
    }

    _setDefaultCover() {
      const gicon = Gio.icon_new_for_string("audio-x-generic-symbolic");
      this._coverImage.gicon = gicon;
    }

    _updateSliderPosition() {
      if (this._sliderDragging || this._trackLength === 0) {
        return;
      }

      let displayPosition = this._currentPosition;

      // Only advance position if actually playing
      if (this._isPlaying && !this._justResumed) {
        const now = GLib.get_monotonic_time();
        const elapsed = now - this._lastUpdateTime;
        displayPosition = this._currentPosition + elapsed;
      }

      // Clamp position
      displayPosition = Math.max(0, Math.min(displayPosition, this._trackLength));

      // Update slider
      this._positionSlider.block_signal_handler(this._sliderChangedId);
      this._positionSlider.value = this._trackLength > 0 ? displayPosition / this._trackLength : 0;
      this._positionSlider.unblock_signal_handler(this._sliderChangedId);

      // Update labels
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
      
      // Update at 10 FPS for smooth UI
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
      if (this._ignoreNextUpdate) return;
      
      log(`MediaControls: External seek to ${this._formatTime(position / 1000000)}`);
      
      this._currentPosition = position;
      this._lastUpdateTime = GLib.get_monotonic_time();
      
      if (!this._sliderDragging) {
        this._updateSliderPosition();
      }
    }

    destroy() {
      this.stopPositionUpdate();
      
      if (this._sliderChangedId) {
        this._positionSlider.disconnect(this._sliderChangedId);
        this._sliderChangedId = 0;
      }
      
      this._coverCache.clear();
      
      super.destroy();
    }
  }
);