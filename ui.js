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
        style_class: "media-controls-box",
        style: "padding: 20px; width: 340px;",
      });

      this._coverCache = new Map();
      this._updateInterval = null;
      this._sliderDragging = false;
      this._lastKnownPosition = 0;
      this._lastKnownTime = 0;
      this._trackLength = 0;
      this._currentInfo = null;
      this._playbackStatus = "Stopped";
      this._userSeeking = false;

      this._buildUI();
    }

    _buildUI() {
      // Header with tabs only
      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 18px; spacing: 6px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._tabsBox = new St.BoxLayout({
        style: "spacing: 6px;",
      });
      headerBox.add_child(this._tabsBox);

      this.add_child(headerBox);

      // Album art
      const coverBox = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin-bottom: 22px;",
      });

      this._coverArt = new St.Bin({
        style: "width: 240px; height: 240px; border-radius: 12px; background-color: rgba(255,255,255,0.05);",
      });

      this._coverImage = new St.Icon({
        icon_size: 240,
        style: "border-radius: 12px;",
      });
      this._coverArt.set_child(this._coverImage);

      coverBox.add_child(this._coverArt);
      this.add_child(coverBox);

      // Track info
      const infoBox = new St.BoxLayout({
        vertical: true,
        style: "spacing: 6px; margin-bottom: 22px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._titleLabel = new St.Label({
        text: "No media playing",
        style: "font-weight: 600; font-size: 15px;",
      });
      this._titleLabel.clutter_text.ellipsize = 3;
      this._titleLabel.clutter_text.line_wrap = false;
      infoBox.add_child(this._titleLabel);

      this._artistLabel = new St.Label({
        text: "",
        style: "font-size: 13px; opacity: 0.7;",
      });
      this._artistLabel.clutter_text.ellipsize = 3;
      infoBox.add_child(this._artistLabel);

      this.add_child(infoBox);

      // Progress section
      const progressBox = new St.BoxLayout({
        vertical: true,
        style: "spacing: 10px; margin-bottom: 14px;",
      });

      // Slider
      this._positionSlider = new Slider.Slider(0);
      this._positionSlider.accessible_name = "Position";

      this._sliderChangedId = this._positionSlider.connect("notify::value", () => {
        if (this._sliderDragging) {
          this._updateTimeLabel();
        }
      });

      this._positionSlider.connect("drag-begin", () => {
        this._sliderDragging = true;
        this._userSeeking = true;
      });

      this._positionSlider.connect("drag-end", () => {
        const seekPosition = this._positionSlider.value * this._trackLength;
        
        this._sliderDragging = false;
        
        // Update our tracking BEFORE emitting seek
        this._lastKnownPosition = seekPosition;
        this._lastKnownTime = GLib.get_monotonic_time();
        
        // Emit seek
        this.emit("seek", seekPosition / 1000000);
        
        // Clear user seeking flag after a short delay
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
          this._userSeeking = false;
          return GLib.SOURCE_REMOVE;
        });
      });

      progressBox.add_child(this._positionSlider);

      // Time labels
      const timeBox = new St.BoxLayout({});

      this._currentTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 11px; opacity: 0.65;",
      });

      this._totalTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 11px; opacity: 0.65;",
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
      });

      timeBox.add_child(this._currentTimeLabel);
      timeBox.add_child(this._totalTimeLabel);
      progressBox.add_child(timeBox);

      this.add_child(progressBox);

      // Control buttons
      const controlsBox = new St.BoxLayout({
        style: "spacing: 14px; margin-top: 14px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._shuffleBtn = this._createButton("media-playlist-shuffle-symbolic", 20);
      this._shuffleBtn.connect("clicked", () => this.emit("shuffle"));

      this._prevBtn = this._createButton("media-skip-backward-symbolic", 22);
      this._prevBtn.connect("clicked", () => this.emit("previous"));

      this._playBtn = this._createButton("media-playback-start-symbolic", 28);
      this._playBtn.style = "padding: 14px; border-radius: 50%;";
      this._playBtn.connect("clicked", () => this.emit("play-pause"));

      this._nextBtn = this._createButton("media-skip-forward-symbolic", 22);
      this._nextBtn.connect("clicked", () => this.emit("next"));

      this._repeatBtn = this._createButton("media-playlist-repeat-symbolic", 20);
      this._repeatBtn.connect("clicked", () => this.emit("repeat"));

      controlsBox.add_child(this._shuffleBtn);
      controlsBox.add_child(this._prevBtn);
      controlsBox.add_child(this._playBtn);
      controlsBox.add_child(this._nextBtn);
      controlsBox.add_child(this._repeatBtn);

      this.add_child(controlsBox);
    }

    _createButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-control-button",
        style: "padding: 10px; border-radius: 50%;",
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
        }),
      });

      return button;
    }

    update(info, playerName, manager) {
      if (!info) return;

      this._currentInfo = info;
      this._playbackStatus = info.status;
      this._trackLength = info.length;

      // Update track info
      this._titleLabel.text = info.title || "Unknown";

      if (info.artists && info.artists.length > 0) {
        this._artistLabel.text = info.artists.join(", ");
        this._artistLabel.show();
      } else {
        this._artistLabel.hide();
      }

      // Update play button
      const playIcon = info.status === "Playing"
        ? "media-playback-pause-symbolic"
        : "media-playback-start-symbolic";
      this._playBtn.child.icon_name = playIcon;

      // Update shuffle button
      if (info.shuffle) {
        this._shuffleBtn.add_style_class_name("active");
      } else {
        this._shuffleBtn.remove_style_class_name("active");
      }

      // Update repeat button
      if (info.loopStatus === "Track") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-song-symbolic";
        this._repeatBtn.add_style_class_name("active");
      } else if (info.loopStatus === "Playlist") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.add_style_class_name("active");
      } else {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.remove_style_class_name("active");
      }

      // Update position - only if not seeking
      if (!this._userSeeking && !this._sliderDragging) {
        this._lastKnownPosition = info.position;
        this._lastKnownTime = GLib.get_monotonic_time();
        this._updateSliderPosition();
      }

      // Load cover art
      if (info.artUrl) {
        this._loadCoverUltraFast(info.artUrl);
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
      const button = new St.Button({
        style_class: "media-tab-button",
        style: playerName === currentPlayer
          ? "padding: 6px 8px; border-radius: 8px;"
          : "padding: 6px 8px; border-radius: 8px; opacity: 0.5;",
        child: new St.Icon({
          icon_name: iconName,
          icon_size: 16,
        }),
      });

      if (playerName === currentPlayer) {
        button.add_style_class_name("active");
      }

      button.connect("clicked", () => {
        this.emit("player-changed", playerName);
      });

      return button;
    }

    _loadCoverUltraFast(url) {
      if (this._coverCache.has(url)) {
        const gicon = this._coverCache.get(url);
        this._coverImage.gicon = gicon;
        return;
      }

      try {
        if (url.startsWith("file://")) {
          const file = Gio.File.new_for_uri(url);
          const gicon = new Gio.FileIcon({ file });
          this._coverImage.gicon = gicon;
          this._coverCache.set(url, gicon);
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          this._downloadAndCacheCover(url);
        } else {
          const file = Gio.File.new_for_path(url);
          const gicon = new Gio.FileIcon({ file });
          this._coverImage.gicon = gicon;
          this._coverCache.set(url, gicon);
        }
      } catch (e) {
        this._setDefaultCover();
      }
    }

    _downloadAndCacheCover(url) {
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
        GLib.PRIORITY_HIGH,
        null,
        null,
        (src, res) => {
          try {
            src.copy_finish(res);
            const gicon = new Gio.FileIcon({ file: cacheFile });
            this._coverImage.gicon = gicon;
            this._coverCache.set(url, gicon);
          } catch (e) {
            log(`Failed to download cover: ${e.message}`);
          }
        }
      );
    }

    _setDefaultCover() {
      const gicon = Gio.icon_new_for_string("audio-x-generic-symbolic");
      this._coverImage.gicon = gicon;
    }

    _updateSliderPosition() {
      if (this._sliderDragging || this._trackLength === 0) return;

      let currentPosition = this._lastKnownPosition;

      // Only advance if playing
      if (this._playbackStatus === "Playing") {
        const now = GLib.get_monotonic_time();
        const elapsed = (now - this._lastKnownTime) / 1000000;
        currentPosition = this._lastKnownPosition + (elapsed * 1000000);
      }

      currentPosition = Math.max(0, Math.min(currentPosition, this._trackLength));

      this._positionSlider.block_signal_handler(this._sliderChangedId);
      this._positionSlider.value = this._trackLength > 0 ? currentPosition / this._trackLength : 0;
      this._positionSlider.unblock_signal_handler(this._sliderChangedId);

      this._currentTimeLabel.text = this._formatTime(currentPosition / 1000000);
      this._totalTimeLabel.text = this._formatTime(this._trackLength / 1000000);
    }

    _updateTimeLabel() {
      if (this._trackLength > 0) {
        const position = this._positionSlider.value * this._trackLength;
        this._currentTimeLabel.text = this._formatTime(position / 1000000);
      }
    }

    _formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    startPositionUpdate() {
      this.stopPositionUpdate();
      this._updateInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        if (!this._sliderDragging && !this._userSeeking) {
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
      // External seek event from player
      this._lastKnownPosition = position;
      this._lastKnownTime = GLib.get_monotonic_time();
      this._userSeeking = false;
      
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