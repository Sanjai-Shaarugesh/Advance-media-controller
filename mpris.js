import Gio from "gi://Gio";
import GLib from "gi://GLib";
import St from "gi://St";

const MPRIS_PREFIX = "org.mpris.MediaPlayer2";
const MPRIS_PATH = "/org/mpris/MediaPlayer2";
const MPRIS_PLAYER_IFACE = "org.mpris.MediaPlayer2.Player";
const MPRIS_IFACE = "org.mpris.MediaPlayer2";

export class MprisManager {
  constructor() {
    this._bus = Gio.DBus.session;
    this._proxies = new Map();
    this._identities = new Map();
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

      // Get identity
      await this._fetchIdentity(name);

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
            resolve();
          } catch (e) {
            // Fallback to bus name
            const shortName = name.replace(`${MPRIS_PREFIX}.`, "");
            this._identities.set(name, shortName);
            resolve();
          }
        }
      );
    });
  }

  _removePlayer(name) {
    this._proxies.delete(name);
    this._identities.delete(name);
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

  getPlayerIdentity(name) {
    return this._identities.get(name) || name.replace(`${MPRIS_PREFIX}.`, "");
  }

  getAppIcon(name) {
    try {
      // Get clean app name without instance numbers
      let cleanName = name.replace(`${MPRIS_PREFIX}.`, "").toLowerCase();
      
      // Remove instance numbers (e.g., instance_1_01)
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");
      
      const iconNames = [cleanName, `${cleanName}-symbolic`, "audio-x-generic-symbolic"];

      const iconTheme = St.IconTheme.get_default();
      for (const iconName of iconNames) {
        if (iconTheme.has_icon(iconName)) {
          return iconName;
        }
      }
      return "audio-x-generic-symbolic";
    } catch (e) {
      return "audio-x-generic-symbolic";
    }
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
    this._identities.clear();
  }
}