import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gtk from "gi://Gtk";
import Shell from "gi://Shell";

const MPRIS_PREFIX = "org.mpris.MediaPlayer2";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER_IFACE = "org.mpris.MediaPlayer2.Player";
const MPRIS_IFACE = "org.mpris.MediaPlayer2";

// Helper functions for variant extraction
function getString(variant) {
  if (!variant) return null;
  try {
    const str = variant.get_string ? variant.get_string()[0] : null;
    return str || null;
  } catch (e) {
    return null;
  }
}

function getInt64(variant) {
  if (!variant) return null;
  try {
    return variant.get_int64();
  } catch (e) {
    return null;
  }
}

function getInt32(variant) {
  if (!variant) return null;
  try {
    return variant.get_int32();
  } catch (e) {
    return null;
  }
}

export class MprisManager {
  constructor() {
    this._bus = null;
    this._proxies = new Map();
    this._identities = new Map();
    this._desktopEntries = new Map();
    this._instanceMetadata = new Map(); // Track metadata per instance
    this._subscriptions = [];
    this._onPlayerAdded = null;
    this._onPlayerRemoved = null;
    this._onPlayerChanged = null;
    this._onSeeked = null;
  }

  async init(callbacks) {
    this._bus = Gio.DBus.session;
    this._onPlayerAdded = callbacks.added || null;
    this._onPlayerRemoved = callbacks.removed || null;
    this._onPlayerChanged = callbacks.changed || null;
    this._onSeeked = callbacks.seeked || null;

    // Subscribe to NameOwnerChanged signals
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

    // Scan for existing players
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
            const players = names.filter(name => name.startsWith(`${MPRIS_PREFIX}.`));

            for (const name of players) {
              await this._addPlayer(name);
            }
            resolve();
          } catch (e) {
            logError(e, "Failed to scan existing players");
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

      await this._fetchIdentity(name);
      await this._fetchDesktopEntry(name);

      proxy.connect("g-properties-changed", (p, changed) => {
        const props = changed.deep_unpack();
        if (
          "Metadata" in props ||
          "PlaybackStatus" in props ||
          "Shuffle" in props ||
          "LoopStatus" in props ||
          "Position" in props
        ) {
          // Update instance metadata cache
          this._updateInstanceMetadata(name);
          this._onPlayerChanged?.(name);
        }
      });

      proxy.connectSignal("Seeked", (proxy, sender, [position]) => {
        this._onSeeked?.(name, position);
      });

      // Initialize instance metadata
      this._updateInstanceMetadata(name);
      
      this._onPlayerAdded?.(name);
    } catch (e) {
      logError(e, `Failed to add player ${name}`);
    }
  }

  _updateInstanceMetadata(name) {
    const info = this.getPlayerInfo(name);
    if (info && info.title) {
      this._instanceMetadata.set(name, {
        title: info.title,
        artists: info.artists,
        trackId: info.trackId,
        status: info.status,
      });
    }
  }

  async _fetchIdentity(name) {
    return new Promise((resolve) => {
      this._bus.call(
        name,
        MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", [MPRIS_IFACE, "Identity"]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (conn, result) => {
          try {
            const reply = conn.call_finish(result);
            const identity = reply.deep_unpack()[0].unpack();
            this._identities.set(name, identity);
          } catch (e) {
            const shortName = name.replace(`${MPRIS_PREFIX}.`, "");
            this._identities.set(name, shortName);
          }
          resolve();
        }
      );
    });
  }

  async _fetchDesktopEntry(name) {
    return new Promise((resolve) => {
      this._bus.call(
        name,
        MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", [MPRIS_IFACE, "DesktopEntry"]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (conn, result) => {
          try {
            const reply = conn.call_finish(result);
            const desktopEntry = reply.deep_unpack()[0].unpack();
            this._desktopEntries.set(name, desktopEntry);
          } catch (e) {
            // Desktop entry is optional
          }
          resolve();
        }
      );
    });
  }

  _removePlayer(name) {
    const proxy = this._proxies.get(name);
    if (proxy) {
      try {
        GObject.signal_handlers_destroy(proxy);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    
    this._proxies.delete(name);
    this._identities.delete(name);
    this._desktopEntries.delete(name);
    this._instanceMetadata.delete(name);
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

    try {
      const statusV = proxy.get_cached_property("PlaybackStatus");
      const status = statusV ? statusV.deep_unpack() : "Stopped";

      if (status !== "Playing" && status !== "Paused" && status !== "Stopped") {
        return null;
      }

      const metaV = proxy.get_cached_property("Metadata");
      if (!metaV) return null;

      const meta = {};
      const len = metaV.n_children();
      
      if (!len) return null;

      for (let i = 0; i < len; i++) {
        const item = metaV.get_child_value(i);
        const key = getString(item.get_child_value(0));
        const valueVariant = item.get_child_value(1).get_variant();
        
        if (!key) continue;
        meta[key] = valueVariant;
      }

      const positionV = proxy.get_cached_property("Position");
      const shuffleV = proxy.get_cached_property("Shuffle");
      const loopStatusV = proxy.get_cached_property("LoopStatus");

      const lengthMicroseconds = getInt64(meta["mpris:length"]);
      const artUrl = getString(meta["mpris:artUrl"]);
      const trackId = getString(meta["mpris:trackid"]) || "/";
      
      return {
        title: getString(meta["xesam:title"]),
        artists: meta["xesam:artist"]?.deep_unpack() ?? null,
        album: getString(meta["xesam:album"]),
        artUrl: artUrl,
        trackId: trackId,
        trackNumber: getInt32(meta["xesam:trackNumber"]),
        discNumber: getInt32(meta["xesam:discNumber"]),
        genres: meta["xesam:genre"]?.deep_unpack() ?? null,
        contentCreated: getString(meta["xesam:contentCreated"]),
        status: status,
        position: positionV ? positionV.unpack() : 0,
        length: lengthMicroseconds || 0,
        shuffle: shuffleV ? shuffleV.unpack() : false,
        loopStatus: loopStatusV ? loopStatusV.unpack() : "None",
      };
    } catch (e) {
      logError(e, `Failed to get player info for ${name}`);
      return null;
    }
  }

  /**
   * Get a display label for a player instance
   * For multi-instance apps (like browsers), includes track info
   */
  getPlayerDisplayLabel(name) {
    const baseApp = this._getBaseAppName(name);
    const instances = this._getInstancesOfApp(baseApp);
    
    // If only one instance, just return the app name
    if (instances.length <= 1) {
      return this.getPlayerIdentity(name);
    }
    
    // Multiple instances - add track info to differentiate
    const metadata = this._instanceMetadata.get(name);
    if (metadata && metadata.title) {
      const shortTitle = metadata.title.length > 25 
        ? metadata.title.substring(0, 25) + "..." 
        : metadata.title;
      return `${this.getPlayerIdentity(name)}: ${shortTitle}`;
    }
    
    return this.getPlayerIdentity(name);
  }

  /**
   * Get base app name (without instance suffix)
   */
  _getBaseAppName(name) {
    // Remove instance suffix like .instance_1234_5678
    return name.replace(/\.instance_\d+_\d+$/, "");
  }

  /**
   * Get all instances of the same app
   */
  _getInstancesOfApp(baseAppName) {
    const instances = [];
    for (const name of this._proxies.keys()) {
      if (this._getBaseAppName(name) === baseAppName) {
        instances.push(name);
      }
    }
    return instances;
  }

  /**
   * Group players by base app
   * Returns: Map<baseAppName, playerName[]>
   */
  getGroupedPlayers() {
    const groups = new Map();
    
    for (const name of this._proxies.keys()) {
      const baseApp = this._getBaseAppName(name);
      if (!groups.has(baseApp)) {
        groups.set(baseApp, []);
      }
      groups.get(baseApp).push(name);
    }
    
    return groups;
  }

  getPlayerIdentity(name) {
    return this._identities.get(name) || name.replace(`${MPRIS_PREFIX}.`, "");
  }

  getAppInfo(name) {
    try {
      const desktopEntry = this._desktopEntries.get(name);
      if (desktopEntry) {
        let appInfo = Gio.DesktopAppInfo.new(`${desktopEntry}.desktop`);
        if (appInfo) return appInfo;
        
        appInfo = Gio.DesktopAppInfo.new(desktopEntry);
        if (appInfo) return appInfo;
      }

      let cleanName = name.replace(`${MPRIS_PREFIX}.`, "").toLowerCase();
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");
      
      const appSystem = Shell.AppSystem.get_default();
      const app = appSystem.lookup_app(`${cleanName}.desktop`);
      
      if (app) {
        return app.get_app_info();
      }

      return null;
    } catch (e) {
      logError(e, `Error getting app info for ${name}`);
      return null;
    }
  }

  getAppIcon(name) {
    try {
      const iconTheme = Gtk.IconTheme.get_for_display(
        require('gi://Gdk').Display.get_default()
      );
      
      const desktopEntry = this._desktopEntries.get(name);
      if (desktopEntry) {
        const iconNames = [
          desktopEntry,
          desktopEntry.toLowerCase(),
          `${desktopEntry}-symbolic`,
          `${desktopEntry.toLowerCase()}-symbolic`,
        ];
        
        for (const iconName of iconNames) {
          if (iconTheme.has_icon(iconName)) {
            return iconName;
          }
        }
      }

      let cleanName = name.replace(`${MPRIS_PREFIX}.`, "").toLowerCase();
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");
      
      const appMappings = {
        'spotify': 'spotify',
        'vlc': 'vlc',
        'firefox': 'firefox',
        'chromium': 'chromium',
        'chrome': 'google-chrome',
        'rhythmbox': 'rhythmbox',
        'totem': 'totem',
        'mpv': 'mpv',
        'smplayer': 'smplayer',
        'audacious': 'audacious',
        'clementine': 'clementine',
        'strawberry': 'strawberry',
        'elisa': 'elisa',
        'lollypop': 'lollypop',
        'celluloid': 'celluloid',
        'brave': 'brave-browser',
        'gnome-music': 'org.gnome.Music',
        'amberol': 'io.bassi.Amberol',
      };

      const mappedName = appMappings[cleanName] || cleanName;
      
      const iconNames = [
        mappedName,
        `${mappedName}-symbolic`,
        cleanName,
        `${cleanName}-symbolic`,
        "audio-x-generic-symbolic"
      ];

      for (const iconName of iconNames) {
        if (iconTheme.has_icon(iconName)) {
          return iconName;
        }
      }
      
      return "audio-x-generic-symbolic";
    } catch (e) {
      logError(e, `Error getting icon for ${name}`);
      return "audio-x-generic-symbolic";
    }
  }

  async callMethod(name, method, params = null) {
    const proxy = this._proxies.get(name);
    if (!proxy) throw new Error(`No proxy for ${name}`);

    return new Promise((resolve, reject) => {
      proxy.call(
        method,
        params,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
        (p, result) => {
          if (!p) return reject(new Error("Proxy was NULL"));
          try {
            p.call_finish(result);
            resolve();
          } catch (e) {
            reject(new Error(`Method ${method} failed on ${name}: ${e}`));
          }
        }
      );
    });
  }

  async setProperty(name, property, value) {
    if (!this._bus) throw new Error("Bus not initialized");

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
    if (this._bus) {
      for (const id of this._subscriptions) {
        this._bus.signal_unsubscribe(id);
      }
    }

    for (const [name, proxy] of this._proxies) {
      try {
        GObject.signal_handlers_destroy(proxy);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    this._subscriptions = [];
    this._proxies.clear();
    this._identities.clear();
    this._desktopEntries.clear();
    this._instanceMetadata.clear();
    this._bus = null;
  }
}