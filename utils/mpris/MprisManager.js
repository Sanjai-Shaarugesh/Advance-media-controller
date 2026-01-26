import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { MprisPlayer } from "./MprisPlayer.js";
import { MprisUtils } from "./MprisUtils.js";
import { MprisConstants } from "./MprisConstants.js";

export class MprisManager {
  constructor() {
    this._bus = null;
    this._proxies = new Map();
    this._identities = new Map();
    this._desktopEntries = new Map();
    this._instanceMetadata = new Map();
    this._playerPositions = new Map();
    this._subscriptions = [];
    this._onPlayerAdded = null;
    this._onPlayerRemoved = null;
    this._onPlayerChanged = null;
    this._onSeeked = null;
    this._isDestroyed = false;
    this._proxySignals = new Map();
    this._pendingProxies = new Set();
    this._errorCounts = new Map();
    this._maxErrorsPerPlayer = 10;
    this._operationsPaused = false;
    this._cleanupTimers = new Map();
    this._proxyCleanupQueue = [];
    this._cleanupInProgress = false;
    this._pollingPlayers = new Set();
    this._positionPollingInterval = null;

    this._player = new MprisPlayer(this);
  }

  startPositionPolling(name) {
    if (!name || this._pollingPlayers.has(name)) return;

    this._pollingPlayers.add(name);

    if (!this._positionPollingInterval) {
      this._positionPollingInterval = GLib.timeout_add(GLib.PRIORITY_LOW, 1000, () => {
        if (this._isDestroyed) return GLib.SOURCE_REMOVE;

        for (const playerName of this._pollingPlayers) {
          this._pollPlayerPosition(playerName);
        }

        return GLib.SOURCE_CONTINUE;
      });
    }
  }

  stopPositionPolling(name) {
    this._pollingPlayers.delete(name);

    if (this._pollingPlayers.size === 0 && this._positionPollingInterval) {
      GLib.source_remove(this._positionPollingInterval);
      this._positionPollingInterval = null;
    }
  }

  _pollPlayerPosition(name) {
    if (this._isDestroyed || this._operationsPaused) return;

    const proxy = this._proxies.get(name);
    if (!proxy) return;

    try {
      const statusV = proxy.get_cached_property("PlaybackStatus");
      const status = statusV ? statusV.deep_unpack() : "Stopped";

      if (status !== "Playing") return;

      this._bus.call(
        name,
        MprisConstants.MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", [MprisConstants.MPRIS_PLAYER_IFACE, "Position"]),
        null,
        Gio.DBusCallFlags.NONE,
        1000,
        null,
        (conn, result) => {
          if (this._isDestroyed || this._operationsPaused) return;

          try {
            const reply = conn.call_finish(result);
            const position = reply.deep_unpack()[0].unpack();
            const oldPosition = this._playerPositions.get(name) || 0;

            if (Math.abs(position - oldPosition) > 500000) {
              this._playerPositions.set(name, position);
              this._onPlayerChanged?.(name);
            }
          } catch (e) {
            this.stopPositionPolling(name);
          }
        },
      );
    } catch (e) {}
  }

  pauseOperations() {
    this._operationsPaused = true;
  }

  resumeOperations() {
    GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
      this._operationsPaused = false;
      return GLib.SOURCE_REMOVE;
    });
  }

  async init(callbacks) {
    if (this._isDestroyed) return;

    this._bus = Gio.DBus.session;
    this._onPlayerAdded = callbacks.added || null;
    this._onPlayerRemoved = callbacks.removed || null;
    this._onPlayerChanged = callbacks.changed || null;
    this._onSeeked = callbacks.seeked || null;

    try {
      const watchId = this._bus.signal_subscribe(
        "org.freedesktop.DBus",
        "org.freedesktop.DBus",
        "NameOwnerChanged",
        "/org/freedesktop/DBus",
        null,
        Gio.DBusSignalFlags.NONE,
        this._onNameOwnerChanged.bind(this),
      );
      this._subscriptions.push(watchId);
    } catch (e) {
      logError(e, "Failed to subscribe to NameOwnerChanged");
    }

    await this._scanExistingPlayers();
  }

  async _scanExistingPlayers() {
    if (this._isDestroyed) return;

    return new Promise((resolve) => {
      this._bus.call(
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
        "ListNames",
        null,
        null,
        Gio.DBusCallFlags.NONE,
        MprisConstants.DBUS_TIMEOUT,
        null,
        async (conn, result) => {
          try {
            if (this._isDestroyed) {
              resolve();
              return;
            }

            const reply = conn.call_finish(result);
            const [names] = reply.deep_unpack();
            const players = names.filter((name) =>
              name.startsWith(`${MprisConstants.MPRIS_PREFIX}.`),
            );

            for (const name of players) {
              if (this._isDestroyed) break;
              await this._player.addPlayer(name);
            }
            resolve();
          } catch (e) {
            logError(e, "Failed to scan existing players");
            resolve();
          }
        },
      );
    });
  }

  async _onNameOwnerChanged(conn, sender, path, iface, signal, params) {
    if (this._isDestroyed || this._operationsPaused) return;

    try {
      const [name, oldOwner, newOwner] = params.deep_unpack();
      if (!name.startsWith(`${MprisConstants.MPRIS_PREFIX}.`)) return;

      if (!oldOwner && newOwner) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, 800, () => {
          if (!this._isDestroyed && !this._operationsPaused) {
            this._player.addPlayer(name);
          }
          return GLib.SOURCE_REMOVE;
        });
      } else if (oldOwner && !newOwner) {
        this._player.schedulePlayerRemoval(name);
      }
    } catch (e) {
      logError(e, "Error in _onNameOwnerChanged");
    }
  }

  getPlayerInfo(name) {
    return this._player.getPlayerInfo(name);
  }

  getPlayerPosition(name) {
    return this._playerPositions.get(name) || 0;
  }

  getPlayerDisplayLabel(name) {
    return this._player.getPlayerDisplayLabel(name);
  }

  getGroupedPlayers() {
    return this._player.getGroupedPlayers();
  }

  getPlayerIdentity(name) {
    return this._identities.get(name) || name.replace(`${MprisConstants.MPRIS_PREFIX}.`, "");
  }

  getAppInfo(name) {
    return MprisUtils.getAppInfo(name, this._desktopEntries);
  }

  getAppIcon(name) {
    return MprisUtils.getAppIcon(name, this._desktopEntries);
  }

  async callMethod(name, method, params = null) {
    if (this._isDestroyed || this._operationsPaused)
      throw new Error("Manager not available");

    const proxy = this._proxies.get(name);
    if (!proxy) throw new Error(`No proxy for ${name}`);

    return new Promise((resolve, reject) => {
      proxy.call(
        method,
        params,
        Gio.DBusCallFlags.NO_AUTO_START,
        MprisConstants.DBUS_TIMEOUT,
        null,
        (p, result) => {
          if (!p || this._isDestroyed || this._operationsPaused) {
            reject(new Error("Call failed or manager unavailable"));
            return;
          }

          try {
            p.call_finish(result);
            this._errorCounts.set(name, 0);
            resolve();
          } catch (e) {
            this._player.handlePlayerError(name, e, `method ${method}`);
            reject(e);
          }
        },
      );
    });
  }

  async setProperty(name, property, value) {
    if (this._isDestroyed || this._operationsPaused || !this._bus)
      throw new Error("Manager not available");

    return new Promise((resolve, reject) => {
      this._bus.call(
        name,
        MprisConstants.MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Set",
        new GLib.Variant("(ssv)", [MprisConstants.MPRIS_PLAYER_IFACE, property, value]),
        null,
        Gio.DBusCallFlags.NO_AUTO_START,
        MprisConstants.DBUS_TIMEOUT,
        null,
        (conn, result) => {
          if (this._isDestroyed || this._operationsPaused) {
            reject(new Error("Manager unavailable"));
            return;
          }

          try {
            conn.call_finish(result);
            this._errorCounts.set(name, 0);
            resolve();
          } catch (e) {
            this._player.handlePlayerError(name, e, `set property ${property}`);
            reject(e);
          }
        },
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
    this._playerPositions.set(name, positionUs);
    const trackIdStr = trackId.toString();

    return new Promise((resolve, reject) => {
      try {
        this._bus.call_sync(
          name,
          "/org/mpris/MediaPlayer2",
          "org.mpris.MediaPlayer2.Player",
          "SetPosition",
          new GLib.Variant("(ox)", [trackIdStr, positionUs]),
          null,
          Gio.DBusCallFlags.NONE,
          50,
          null,
        );
        this._errorCounts.set(name, 0);
        resolve();
      } catch (e) {
        this._player.handlePlayerError(name, e, "setPosition");
        reject(e);
      }
    });
  }

  toggleShuffle(name) {
    const info = this.getPlayerInfo(name);
    if (info) {
      return this.setProperty(name, "Shuffle", new GLib.Variant("b", !info.shuffle));
    }
    return Promise.reject(new Error("No player info available"));
  }

  cycleLoopStatus(name) {
    const info = this.getPlayerInfo(name);
    if (info) {
      const statuses = ["None", "Track", "Playlist"];
      const current = statuses.indexOf(info.loopStatus);
      const next = statuses[(current + 1) % statuses.length];
      return this.setProperty(name, "LoopStatus", new GLib.Variant("s", next));
    }
    return Promise.reject(new Error("No player info available"));
  }

  getPlayers() {
    return Array.from(this._proxies.keys());
  }

  destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this._operationsPaused = true;

    if (this._positionPollingInterval) {
      GLib.source_remove(this._positionPollingInterval);
      this._positionPollingInterval = null;
    }
    this._pollingPlayers.clear();

    for (const timerId of this._cleanupTimers.values()) {
      try {
        GLib.source_remove(timerId);
      } catch (e) {}
    }
    this._cleanupTimers.clear();

    if (this._bus) {
      for (const id of this._subscriptions) {
        try {
          this._bus.signal_unsubscribe(id);
        } catch (e) {}
      }
    }

    const proxyNames = Array.from(this._proxies.keys());
    let cleanupIndex = 0;

    const cleanupNext = () => {
      if (cleanupIndex >= proxyNames.length) {
        this._finalCleanup();
        return;
      }

      const name = proxyNames[cleanupIndex++];
      this._player.removePlayerSafe(name);

      GLib.timeout_add(GLib.PRIORITY_LOW, 50, () => {
        cleanupNext();
        return GLib.SOURCE_REMOVE;
      });
    };

    cleanupNext();
  }

  _finalCleanup() {
    this._subscriptions = [];
    this._proxies.clear();
    this._identities.clear();
    this._desktopEntries.clear();
    this._instanceMetadata.clear();
    this._proxySignals.clear();
    this._errorCounts.clear();
    this._pendingProxies.clear();
    this._playerPositions.clear();
    this._proxyCleanupQueue = [];
    this._bus = null;
    this._onPlayerAdded = null;
    this._onPlayerRemoved = null;
    this._onPlayerChanged = null;
    this._onSeeked = null;
  }
}