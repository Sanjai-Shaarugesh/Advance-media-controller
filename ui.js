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
        style: "padding: 12px; width: 280px; background: #383838; border-radius: 12px;",
      });

      this._coverCache = new Map();
      this._updateInterval = null;
      this._sliderDragging = false;
      this._lastPosition = 0;
      this._lastUpdateTime = 0;
      this._currentLength = 0;
      this._currentInfo = null;
      this._userSeekedPosition = null;

      this._buildUI();
    }

    _buildUI() {
      // Header with app name and tabs
      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 12px; spacing: 8px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._appIcon = new St.Icon({
        icon_name: "audio-x-generic-symbolic",
        icon_size: 20,
        style: "margin-right: 4px;",
      });
      headerBox.add_child(this._appIcon);

      this._appNameLabel = new St.Label({
        text: "Media Player",
        style: "font-weight: 600; font-size: 13px; color: #ffffff;",
      });
      headerBox.add_child(this._appNameLabel);

      const upArrow = new St.Icon({
        icon_name: "go-up-symbolic",
        icon_size: 14,
        style: "color: #ffffff; margin-left: 4px;",
      });
      headerBox.add_child(upArrow);

      this._tabsBox = new St.BoxLayout({
        style: "spacing: 6px; margin-left: 8px;",
      });
      headerBox.add_child(this._tabsBox);

      this.add_child(headerBox);

      // Album art
      const coverBox = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin-bottom: 12px;",
      });

      this._coverArt = new St.Bin({
        style: "width: 256px; height: 256px; border-radius: 8px; background-color: #2a2a2a;",
      });

      this._coverImage = new St.Icon({
        icon_size: 256,
        style: "border-radius: 8px;",
      });
      this._coverArt.set_child(this._coverImage);

      coverBox.add_child(this._coverArt);
      this.add_child(coverBox);

      // Track title
      this._titleLabel = new St.Label({
        text: "No media playing",
        style: "font-weight: 500; font-size: 14px; color: #ffffff; padding: 0 2px;",
      });
      this._titleLabel.clutter_text.ellipsize = 3;
      this._titleLabel.clutter_text.line_wrap = false;
      this.add_child(this._titleLabel);

      // Artist name
      this._artistLabel = new St.Label({
        text: "",
        style: "font-size: 12px; color: #b3b3b3; margin-top: 2px; padding: 0 2px;",
      });
      this._artistLabel.clutter_text.ellipsize = 3;
      this.add_child(this._artistLabel);

      // Time and GTK slider
      const timeSliderBox = new St.BoxLayout({
        vertical: true,
        style: "margin-top: 12px; margin-bottom: 6px;",
      });

      const timeBox = new St.BoxLayout({
        style: "margin-bottom: 4px;",
      });

      this._currentTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 11px; color: #b3b3b3;",
      });

      this._totalTimeLabel = new St.Label({
        text: "0:00",
        style: "font-size: 11px; color: #b3b3b3;",
        x_align: Clutter.ActorAlign.END,
        x_expand: true,
      });

      timeBox.add_child(this._currentTimeLabel);
      timeBox.add_child(this._totalTimeLabel);
      timeSliderBox.add_child(timeBox);

      // Use default GTK Slider
      this._positionSlider = new Slider.Slider(0);
      this._positionSlider.accessible_name = "Position";

      this._sliderChangedId = this._positionSlider.connect("notify::value", () => {
        if (this._sliderDragging) {
          this._updateTimeLabel();
        }
      });

      this._positionSlider.connect("drag-begin", () => {
        this._sliderDragging = true;
      });

      this._positionSlider.connect("drag-end", () => {
        this._sliderDragging = false;
        const position = (this._positionSlider.value * this._currentLength) / 1000000;
        
        this._userSeekedPosition = position * 1000000;
        this._lastPosition = this._userSeekedPosition;
        this._lastUpdateTime = GLib.get_monotonic_time();
        
        this.emit("seek", position);
      });

      timeSliderBox.add_child(this._positionSlider);
      this.add_child(timeSliderBox);

      // Control buttons
      const controlsBox = new St.BoxLayout({
        style: "spacing: 6px; margin-top: 10px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._shuffleBtn = this._createButton("media-playlist-shuffle-symbolic", 18);
      this._shuffleBtn.connect("clicked", () => this.emit("shuffle"));

      this._prevBtn = this._createButton("media-skip-backward-symbolic", 20);
      this._prevBtn.connect("clicked", () => this.emit("previous"));

      this._playBtn = this._createButton("media-playback-start-symbolic", 22);
      this._playBtn.connect("clicked", () => this.emit("play-pause"));

      this._nextBtn = this._createButton("media-skip-forward-symbolic", 20);
      this._nextBtn.connect("clicked", () => this.emit("next"));

      this._repeatBtn = this._createButton("media-playlist-repeat-symbolic", 18);
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
        style: "padding: 8px; border-radius: 50%; background: transparent;",
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
          style: "color: #b3b3b3;",
        }),
      });

      button.connect("enter-event", () => {
        button.child.style = `color: #ffffff; icon-size: ${size};`;
      });

      button.connect("leave-event", () => {
        button.child.style = `color: #b3b3b3; icon-size: ${size};`;
      });

      return button;
    }

    update(info, playerName, manager) {
      if (!info) return;

      this._currentInfo = info;

      // Update app icon and name
      const identity = manager.getPlayerIdentity(playerName);
      this._appNameLabel.text = identity;
      
      const appIcon = manager.getAppIcon(playerName);
      this._appIcon.icon_name = appIcon;

      // Update track info
      this._titleLabel.text = info.title || "Unknown";

      if (info.artists && info.artists.length > 0) {
        this._artistLabel.text = info.artists.join(", ");
        this._artistLabel.show();
      } else {
        this._artistLabel.hide();
      }

      // Update play button
      const playIcon =
        info.status === "Playing"
          ? "media-playback-pause-symbolic"
          : "media-playback-start-symbolic";
      this._playBtn.child.icon_name = playIcon;

      // Update shuffle button
      if (info.shuffle) {
        this._shuffleBtn.child.style = "color: #1db954;";
      } else {
        this._shuffleBtn.child.style = "color: #b3b3b3;";
      }

      // Update repeat button
      if (info.loopStatus === "Track") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-song-symbolic";
        this._repeatBtn.child.style = "color: #1db954;";
      } else if (info.loopStatus === "Playlist") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.child.style = "color: #1db954;";
      } else {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.child.style = "color: #b3b3b3;";
      }

      // Update position
      if (this._userSeekedPosition !== null) {
        this._lastPosition = this._userSeekedPosition;
        this._userSeekedPosition = null;
      } else {
        this._lastPosition = info.position;
      }
      
      this._lastUpdateTime = GLib.get_monotonic_time();
      this._currentLength = info.length;
      this._updateSliderPosition(info);

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
        style:
          playerName === currentPlayer
            ? "padding: 4px 6px; border-radius: 12px; background: rgba(255,255,255,0.2);"
            : "padding: 4px 6px; border-radius: 12px; background: rgba(255,255,255,0.1);",
        child: new St.Icon({
          icon_name: iconName,
          icon_size: 16,
          style: "color: #ffffff;",
        }),
      });

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

    _updateSliderPosition(info) {
      if (this._sliderDragging || !info || info.length === 0) return;

      let currentPosition = this._lastPosition;

      if (info.status === "Playing") {
        const now = GLib.get_monotonic_time();
        const elapsed = (now - this._lastUpdateTime) / 1000000;
        currentPosition = this._lastPosition + elapsed * 1000000;
      }

      currentPosition = Math.max(0, Math.min(currentPosition, info.length));

      this._positionSlider.block_signal_handler(this._sliderChangedId);
      this._positionSlider.value = info.length > 0 ? currentPosition / info.length : 0;
      this._positionSlider.unblock_signal_handler(this._sliderChangedId);

      this._currentTimeLabel.text = this._formatTime(currentPosition / 1000000);
      this._totalTimeLabel.text = this._formatTime(info.length / 1000000);
    }

    _updateTimeLabel() {
      if (this._currentLength > 0) {
        const position = this._positionSlider.value * this._currentLength;
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
        if (!this._sliderDragging && this._currentInfo) {
          this._updateSliderPosition(this._currentInfo);
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
      this._lastPosition = position;
      this._lastUpdateTime = GLib.get_monotonic_time();
      this._userSeekedPosition = null;
      if (this._currentInfo) {
        this._updateSliderPosition(this._currentInfo);
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