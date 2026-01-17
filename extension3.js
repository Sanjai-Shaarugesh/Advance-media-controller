import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";
import St from "gi://St";
import GObject from "gi://GObject";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";

const MPRIS_PREFIX = "org.mpris.MediaPlayer2";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER_IFACE = "org.mpris.MediaPlayer2.Player";

class MprisManager {
  constructor() {
    this._bus = Gio.DBus.session;
    this._proxies = new Map();
    this._subscriptions = [];
    this._onPlayerAdded = null;
    this._onPlayerRemoved = null;
    this._onPlayerChanged = null;
    this._onSeeked = null;
  }

  async init(callbacks) {
    this._onPlayerAdded = callbacks.added || null;
    this._onPlayerRemoved = callbacks.removed || null;
    this._onPlayerChanged = callbacks.changed || null;
    this._onSeeked = callbacks.seeked || null;

    const watchId = this._bus.signal_subscribe(
      "org.freedesktop.DBus",
      "org.freedesktop.DBus",
      "NameOwnerChanged",
      "/org/freedesktop/DBus",
      null,
      Gio.DBusSignalFlags.NONE,
      this._onNameOwnerChanged.bind(this)
    );
    this._subscriptions.push(watchId);

    await this._scanExistingPlayers();
  }

  async _scanExistingPlayers() {
    return new Promise((resolve) => {
      this._bus.call(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        "ListNames",
        null,
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        async (conn, result) => {
          try {
            const reply = conn.call_finish(result);
            const [names] = reply.deep_unpack();

            for (const name of names) {
              if (name.startsWith(`${MPRIS_PREFIX}.`)) {
                await this._addPlayer(name);
              }
            }
            resolve();
          } catch (e) {
            logError(e);
            resolve();
          }
        }
      );
    });
  }

  async _onNameOwnerChanged(conn, sender, path, iface, signal, params) {
    const [name, oldOwner, newOwner] = params.deep_unpack();
    if (!name.startsWith(`${MPRIS_PREFIX}.`)) return;

    if (!oldOwner && newOwner) {
      await this._addPlayer(name);
    } else if (oldOwner && !newOwner) {
      this._removePlayer(name);
    }
  }

  async _addPlayer(name) {
    if (this._proxies.has(name)) return;

    try {
      const proxy = await this._createProxy(name);
      this._proxies.set(name, proxy);

      proxy.connect("g-properties-changed", (p, changed) => {
        const props = changed.deep_unpack();
        if (
          "Metadata" in props ||
          "PlaybackStatus" in props ||
          "Shuffle" in props ||
          "LoopStatus" in props
        ) {
          this._onPlayerChanged?.(name);
        }
      });

      proxy.connectSignal("Seeked", (proxy, sender, [position]) => {
        this._onSeeked?.(name, position);
      });

      this._onPlayerAdded?.(name);
    } catch (e) {
      logError(e);
    }
  }

  _removePlayer(name) {
    this._proxies.delete(name);
    this._onPlayerRemoved?.(name);
  }

  async _createProxy(name) {
    return new Promise((resolve, reject) => {
      Gio.DBusProxy.new(
        this._bus,
        Gio.DBusProxyFlags.NONE,
        null,
        name,
        MPRIS_PATH,
        MPRIS_PLAYER_IFACE,
        null,
        (source, result) => {
          try {
            const proxy = Gio.DBusProxy.new_finish(result);
            resolve(proxy);
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  getPlayerInfo(name) {
    const proxy = this._proxies.get(name);
    if (!proxy) return null;

    const metadata = proxy.get_cached_property("Metadata");
    const status = proxy.get_cached_property("PlaybackStatus");
    const position = proxy.get_cached_property("Position");
    const shuffle = proxy.get_cached_property("Shuffle");
    const loopStatus = proxy.get_cached_property("LoopStatus");

    if (!metadata) return null;

    const meta = metadata.deep_unpack();
    const length = meta["mpris:length"]?.unpack();

    return {
      title: meta["xesam:title"]?.unpack() || null,
      artists: meta["xesam:artist"]?.deep_unpack() || null,
      album: meta["xesam:album"]?.unpack() || null,
      artUrl: meta["mpris:artUrl"]?.unpack() || null,
      status: status?.unpack() || "Stopped",
      position: position ? position.unpack() : 0,
      length: length || 0,
      shuffle: shuffle ? shuffle.unpack() : false,
      loopStatus: loopStatus ? loopStatus.unpack() : "None",
    };
  }

  getAppIcon(name) {
    const shortName = name.replace(`${MPRIS_PREFIX}.`, "").toLowerCase();
    const iconNames = [
      shortName,
      `${shortName}-symbolic`,
      "audio-x-generic-symbolic",
    ];

    const iconTheme = St.IconTheme.get_default();
    for (const iconName of iconNames) {
      if (iconTheme.has_icon(iconName)) {
        return iconName;
      }
    }
    return "audio-x-generic-symbolic";
  }

  async callMethod(name, method, params = null) {
    const proxy = this._proxies.get(name);
    if (!proxy) throw new Error(`No proxy for ${name}`);

    return new Promise((resolve, reject) => {
      proxy.call(method, params, Gio.DBusCallFlags.NONE, -1, null, (p, result) => {
        try {
          p.call_finish(result);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  async setProperty(name, property, value) {
    const proxy = this._proxies.get(name);
    if (!proxy) throw new Error(`No proxy for ${name}`);

    return new Promise((resolve, reject) => {
      this._bus.call(
        name,
        MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Set",
        new GLib.Variant("(ssv)", [MPRIS_PLAYER_IFACE, property, value]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (conn, result) => {
          try {
            conn.call_finish(result);
            resolve();
          } catch (e) {
            reject(e);
          }
        }
      );
    });
  }

  playPause(name) {
    return this.callMethod(name, "PlayPause");
  }

  next(name) {
    return this.callMethod(name, "Next");
  }

  previous(name) {
    return this.callMethod(name, "Previous");
  }

  setPosition(name, trackId, position) {
    const positionUs = Math.floor(position * 1000000);
    return this.callMethod(
      name,
      "SetPosition",
      new GLib.Variant("(ox)", [trackId, positionUs])
    );
  }

  toggleShuffle(name) {
    const info = this.getPlayerInfo(name);
    if (info) {
      return this.setProperty(name, "Shuffle", new GLib.Variant("b", !info.shuffle));
    }
  }

  cycleLoopStatus(name) {
    const info = this.getPlayerInfo(name);
    if (info) {
      const statuses = ["None", "Track", "Playlist"];
      const current = statuses.indexOf(info.loopStatus);
      const next = statuses[(current + 1) % statuses.length];
      return this.setProperty(name, "LoopStatus", new GLib.Variant("s", next));
    }
  }

  getPlayers() {
    return Array.from(this._proxies.keys());
  }

  destroy() {
    this._subscriptions.forEach((id) => {
      this._bus.signal_unsubscribe(id);
    });
    this._subscriptions = [];
    this._proxies.clear();
  }
}

const MediaIndicator = GObject.registerClass(
  class MediaIndicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, "Media Controls", false);

      this._manager = new MprisManager();
      this._currentPlayer = null;
      this._coverCache = new Map();
      this._updateInterval = null;
      this._sliderDragging = false;
      this._lastPosition = 0;
      this._lastUpdateTime = 0;

      this._icon = new St.Icon({
        gicon: Gio.icon_new_for_string("audio-x-generic-symbolic"),
        style_class: "system-status-icon",
      });
      this.add_child(this._icon);

      this._buildMenu();
      this._initManager();
      this.show();
    }

    async _initManager() {
      await this._manager.init({
        added: (name) => this._onPlayerAdded(name),
        removed: (name) => this._onPlayerRemoved(name),
        changed: (name) => this._onPlayerChanged(name),
        seeked: (name, position) => this._onSeeked(name, position),
      });

      if (this._manager.getPlayers().length > 0) {
        this.show();
      }
    }

    _buildMenu() {
      // Main container with native styling
      const mainBox = new St.BoxLayout({
        vertical: true,
        style_class: "media-controls-box",
        style: "padding: 16px; min-width: 300px; max-width: 300px; background: #383838; border-radius: 12px;",
      });

      // Header with app name and icon tabs
      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 16px; spacing: 10px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._appNameLabel = new St.Label({
        text: "Spotify",
        style: "font-weight: 600; font-size: 13px; color: #ffffff;",
      });
      headerBox.add_child(this._appNameLabel);

      // Up arrow icon
      const upArrow = new St.Icon({
        icon_name: "go-up-symbolic",
        icon_size: 16,
        style: "color: #ffffff; margin-left: 4px;",
      });
      headerBox.add_child(upArrow);

      this._tabsBox = new St.BoxLayout({
        style: "spacing: 6px; margin-left: 8px;",
      });
      headerBox.add_child(this._tabsBox);

      mainBox.add_child(headerBox);

      // Album art - square with rounded corners
      const coverBox = new St.BoxLayout({
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin-bottom: 16px;",
      });

      this._coverArt = new St.Bin({
        style: "width: 268px; height: 268px; border-radius: 8px; background-size: cover; background-position: center;",
      });

      coverBox.add_child(this._coverArt);
      mainBox.add_child(coverBox);

      // Track title - left aligned, single line
      this._titleLabel = new St.Label({
        text: "No media playing",
        style: "font-weight: 500; font-size: 15px; color: #ffffff; padding: 0 2px;",
      });
      this._titleLabel.clutter_text.ellipsize = 3;
      this._titleLabel.clutter_text.line_wrap = false;
      mainBox.add_child(this._titleLabel);

      // Artist name - left aligned, smaller, gray
      this._artistLabel = new St.Label({
        text: "",
        style: "font-size: 13px; color: #b3b3b3; margin-top: 2px; padding: 0 2px;",
      });
      this._artistLabel.clutter_text.ellipsize = 3;
      mainBox.add_child(this._artistLabel);

      // Time and slider section
      const timeSliderBox = new St.BoxLayout({
        vertical: true,
        style: "margin-top: 14px; margin-bottom: 8px;",
      });

      // Time labels
      const timeBox = new St.BoxLayout({
        style: "margin-bottom: 6px;",
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

      // Progress slider
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
        this._onSeek();
      });

      timeSliderBox.add_child(this._positionSlider);
      mainBox.add_child(timeSliderBox);

      // Control buttons - evenly spaced
      const controlsBox = new St.BoxLayout({
        style: "spacing: 8px; margin-top: 12px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._shuffleBtn = this._createIconButton("media-playlist-shuffle-symbolic", 18);
      this._shuffleBtn.connect("clicked", () => this._onShuffle());

      this._prevBtn = this._createIconButton("media-skip-backward-symbolic", 22);
      this._prevBtn.connect("clicked", () => this._onPrevious());

      this._playBtn = this._createIconButton("media-playback-start-symbolic", 24);
      this._playBtn.connect("clicked", () => this._onPlayPause());

      this._nextBtn = this._createIconButton("media-skip-forward-symbolic", 22);
      this._nextBtn.connect("clicked", () => this._onNext());

      this._repeatBtn = this._createIconButton("media-playlist-repeat-symbolic", 18);
      this._repeatBtn.connect("clicked", () => this._onRepeat());

      controlsBox.add_child(this._shuffleBtn);
      controlsBox.add_child(this._prevBtn);
      controlsBox.add_child(this._playBtn);
      controlsBox.add_child(this._nextBtn);
      controlsBox.add_child(this._repeatBtn);

      mainBox.add_child(controlsBox);

      const item = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      item.add_child(mainBox);
      this.menu.addMenuItem(item);

      this.menu.connect("open-state-changed", (menu, open) => {
        if (open) {
          this._startPositionUpdate();
        } else {
          this._stopPositionUpdate();
        }
      });
    }

    _createIconButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-control-button",
        style: "padding: 10px; border-radius: 50%; background: transparent;",
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

    _createAppTab(iconName) {
      const button = new St.Button({
        style: "padding: 4px 6px; border-radius: 12px; background: rgba(255,255,255,0.1);",
        child: new St.Icon({
          icon_name: iconName,
          icon_size: 18,
          style: "color: #ffffff;",
        }),
      });

      return button;
    }

    _updateTabs() {
      this._tabsBox.destroy_all_children();

      const players = this._manager.getPlayers();

      if (this._currentPlayer) {
        const shortName = this._currentPlayer.replace(`${MPRIS_PREFIX}.`, "");
        const displayName = shortName.charAt(0).toUpperCase() + shortName.slice(1);
        this._appNameLabel.text = displayName;
      }

      players.forEach((name) => {
        const appIcon = this._manager.getAppIcon(name);
        const tab = this._createAppTab(appIcon);

        if (name === this._currentPlayer) {
          tab.style = "padding: 4px 6px; border-radius: 12px; background: rgba(255,255,255,0.2);";
        }

        tab._playerName = name;
        tab.connect("clicked", () => {
          this._currentPlayer = name;
          this._updateUI();
          this._updateTabs();
        });

        this._tabsBox.add_child(tab);
      });
    }

    _onPlayerAdded(name) {
      const info = this._manager.getPlayerInfo(name);
      if (!this._currentPlayer || info?.status === "Playing") {
        this._currentPlayer = name;
        this._resetPosition();
        this._updateUI();
      }
      this._updateTabs();
      this.show();
    }

    _onPlayerRemoved(name) {
      if (this._currentPlayer === name) {
        this._currentPlayer = null;
        this._selectNextPlayer();
      }
      this._updateTabs();
    }

    _onPlayerChanged(name) {
      if (this._currentPlayer === name) {
        this._updateUI();
      } else {
        const info = this._manager.getPlayerInfo(name);
        if (info?.status === "Playing") {
          this._currentPlayer = name;
          this._resetPosition();
          this._updateUI();
          this._updateTabs();
        }
      }
    }

    _onSeeked(name, position) {
      if (this._currentPlayer === name && !this._sliderDragging) {
        this._lastPosition = position;
        this._lastUpdateTime = GLib.get_monotonic_time();
        this._updateSliderPosition();
      }
    }

    _resetPosition() {
      const info = this._manager.getPlayerInfo(this._currentPlayer);
      if (info) {
        this._lastPosition = info.position;
        this._lastUpdateTime = GLib.get_monotonic_time();
      }
    }

    _selectNextPlayer() {
      const players = this._manager.getPlayers();

      for (const name of players) {
        const info = this._manager.getPlayerInfo(name);
        if (info?.status === "Playing") {
          this._currentPlayer = name;
          this._resetPosition();
          this._updateUI();
          this._updateTabs();
          return;
        }
      }

      if (players.length > 0) {
        this._currentPlayer = players[0];
        this._resetPosition();
        this._updateUI();
        this._updateTabs();
      } else {
        this._showIdle();
      }
    }

    _updateUI() {
      const info = this._manager.getPlayerInfo(this._currentPlayer);

      if (!info) {
        this._showIdle();
        return;
      }

      this._titleLabel.text = info.title || "Unknown";

      if (info.artists && info.artists.length > 0) {
        this._artistLabel.text = info.artists.join(", ");
        this._artistLabel.show();
      } else {
        this._artistLabel.hide();
      }

      const playIcon =
        info.status === "Playing"
          ? "media-playback-pause-symbolic"
          : "media-playback-start-symbolic";
      this._playBtn.child.icon_name = playIcon;

      if (info.shuffle) {
        this._shuffleBtn.child.style = "color: #1db954;";
      } else {
        this._shuffleBtn.child.style = "color: #b3b3b3;";
      }

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

      this._updateSliderPosition();

      if (info.artUrl) {
        this._loadCover(info.artUrl);
      } else {
        this._setDefaultCover();
      }

      this._updateTabs();
      this.show();
    }

    _updateSliderPosition() {
      const info = this._manager.getPlayerInfo(this._currentPlayer);
      if (!info || this._sliderDragging || info.length === 0) return;

      let currentPosition = this._lastPosition;

      if (info.status === "Playing") {
        const now = GLib.get_monotonic_time();
        const elapsed = (now - this._lastUpdateTime) / 1000000;
        currentPosition = this._lastPosition + elapsed * 1000000;
      }

      currentPosition = Math.max(0, Math.min(currentPosition, info.length));

      this._positionSlider.block_signal_handler(this._sliderChangedId);
      this._positionSlider.value = currentPosition / info.length;
      this._positionSlider.unblock_signal_handler(this._sliderChangedId);

      this._currentTimeLabel.text = this._formatTime(currentPosition / 1000000);
      this._totalTimeLabel.text = this._formatTime(info.length / 1000000);
    }

    _updateTimeLabel() {
      const info = this._manager.getPlayerInfo(this._currentPlayer);
      if (info && info.length > 0) {
        const position = this._positionSlider.value * info.length;
        this._currentTimeLabel.text = this._formatTime(position / 1000000);
      }
    }

    _formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    }

    _startPositionUpdate() {
      this._stopPositionUpdate();
      this._resetPosition();
      this._updateInterval = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
        if (!this._sliderDragging) {
          this._updateSliderPosition();
        }
        return GLib.SOURCE_CONTINUE;
      });
    }

    _stopPositionUpdate() {
      if (this._updateInterval) {
        GLib.source_remove(this._updateInterval);
        this._updateInterval = null;
      }
    }

    _onSeek() {
      if (this._currentPlayer) {
        const info = this._manager.getPlayerInfo(this._currentPlayer);
        if (info && info.length > 0) {
          const position = (this._positionSlider.value * info.length) / 1000000;
          this._lastPosition = position * 1000000;
          this._lastUpdateTime = GLib.get_monotonic_time();

          const metadata = this._manager._proxies
            .get(this._currentPlayer)
            .get_cached_property("Metadata");
          const trackId = metadata
            ? metadata.deep_unpack()["mpris:trackid"]?.unpack()
            : "/";

          this._manager
            .setPosition(this._currentPlayer, trackId, position)
            .catch(logError);
        }
      }
    }

    _loadCover(url) {
      if (this._coverCache.has(url)) {
        const cachedUrl = this._coverCache.get(url);
        this._coverArt.style = `width: 268px; height: 268px; border-radius: 8px; background-image: url('${cachedUrl}'); background-size: cover; background-position: center;`;
        this._icon.gicon = Gio.icon_new_for_string(cachedUrl);
        return;
      }

      try {
        let file;

        if (url.startsWith("file://")) {
          const path = url.substring(7);
          this._coverArt.style = `width: 268px; height: 268px; border-radius: 8px; background-image: url('file://${path}'); background-size: cover; background-position: center;`;
          this._coverCache.set(url, `file://${path}`);
          this._icon.gicon = Gio.File.new_for_path(path);
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          this._downloadCover(url);
        } else {
          this._coverArt.style = `width: 268px; height: 268px; border-radius: 8px; background-image: url('file://${url}'); background-size: cover; background-position: center;`;
          this._coverCache.set(url, `file://${url}`);
          this._icon.gicon = Gio.File.new_for_path(url);
        }
      } catch (e) {
        this._setDefaultCover();
      }
    }

    _downloadCover(url) {
      const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
      const cacheDir = GLib.build_filenamev([
        GLib.get_user_cache_dir(),
        "mpris-covers",
      ]);
      GLib.mkdir_with_parents(cacheDir, 0o755);
      const cachePath = GLib.build_filenamev([cacheDir, hash]);
      const cacheFile = Gio.File.new_for_path(cachePath);

      if (cacheFile.query_exists(null)) {
        this._coverArt.style = `width: 268px; height: 268px; border-radius: 8px; background-image: url('file://${cachePath}'); background-size: cover; background-position: center;`;
        this._coverCache.set(url, `file://${cachePath}`);
        this._icon.gicon = cacheFile;
        return;
      }

      const source = Gio.File.new_for_uri(url);
      source.copy_async(
        cacheFile,
        Gio.FileCopyFlags.OVERWRITE,
        GLib.PRIORITY_DEFAULT,
        null,
        null,
        (src, res) => {
          try {
            src.copy_finish(res);
            this._coverArt.style = `width: 268px; height: 268px; border-radius: 8px; background-image: url('file://${cachePath}'); background-size: cover; background-position: center;`;
            this._coverCache.set(url, `file://${cachePath}`);
            this._icon.gicon = cacheFile;
          } catch (e) {
            this._setDefaultCover();
          }
        }
      );
    }

    _setDefaultCover() {
      const gicon = Gio.icon_new_for_string("audio-x-generic-symbolic");
      this._coverArt.style = "width: 268px; height: 268px; border-radius: 8px; background: #2a2a2a;";
      this._icon.gicon = gicon;
    }

    _showIdle() {
      this._setDefaultCover();
      this._titleLabel.text = "No media playing";
      this._artistLabel.hide();
      this._playBtn.child.icon_name = "media-playback-start-symbolic";
      this._positionSlider.value = 0;
      this._currentTimeLabel.text = "0:00";
      this._totalTimeLabel.text = "0:00";
      this._tabsBox.destroy_all_children();
      this._appNameLabel.text = "Media Player";
      this.hide();
    }

    _onPlayPause() {
      if (this._currentPlayer) {
        this._manager.playPause(this._currentPlayer).catch(logError);
      }
    }

    _onNext() {
      if (this._currentPlayer) {
        this._manager.next(this._currentPlayer).catch(logError);
      }
    }

    _onPrevious() {
      if (this._currentPlayer) {
        this._manager.previous(this._currentPlayer).catch(logError);
      }
    }

    _onShuffle() {
      if (this._currentPlayer) {
        this._manager.toggleShuffle(this._currentPlayer).catch(logError);
      }
    }

    _onRepeat() {
      if (this._currentPlayer) {
        this._manager.cycleLoopStatus(this._currentPlayer).catch(logError);
      }
    }

    destroy() {
      this._stopPositionUpdate();
      if (this._sliderChangedId) {
        this._positionSlider.disconnect(this._sliderChangedId);
        this._sliderChangedId = 0;
      }
      this._manager.destroy();
      this._coverCache.clear();
      super.destroy();
    }
  }
);

export default class MediaExtension extends Extension {
  enable() {
    log("Media Controls Extension Enabled");

    this._indicator = new MediaIndicator();
    Main.panel.addToStatusArea("media-controls", this._indicator, 0, "right");
  }

  disable() {
    log("Media Controls Extension Disabled");

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
}