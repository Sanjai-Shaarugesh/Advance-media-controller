import Gio from "gi://Gio";
import GLib from "gi://GLib";
import { MprisConstants } from "./MprisConstants.js";
import { MprisUtils } from "./MprisUtils.js";

export class MprisPlayer {
  constructor(manager) {
    this._manager = manager;
  }

  async addPlayer(name) {
    if (this._manager._proxies.has(name) || this._manager._pendingProxies.has(name) || this._manager._isDestroyed || this._manager._operationsPaused) return;

    this._manager._pendingProxies.add(name);

    try {
      const proxy = await this._createProxy(name);
      if (this._manager._isDestroyed || this._manager._operationsPaused) {
        this._safeDisposeProxy(proxy);
        this._manager._pendingProxies.delete(name);
        return;
      }
      
      this._manager._proxies.set(name, proxy);
      this._manager._errorCounts.set(name, 0);
      
      const signals = new Map();
      this._manager._proxySignals.set(name, signals);

      await this._fetchIdentity(name);
      await this._fetchDesktopEntry(name);

      if (this._manager._isDestroyed || this._manager._operationsPaused) {
        this._queueProxyCleanup(name);
        this._manager._pendingProxies.delete(name);
        return;
      }

      try {
        const propSignalId = proxy.connect("g-properties-changed", (p, changed) => {
          if (this._manager._isDestroyed || this._manager._operationsPaused) return;
          
          try {
            const props = changed.deep_unpack();
            if (
              "Metadata" in props ||
              "PlaybackStatus" in props ||
              "Shuffle" in props ||
              "LoopStatus" in props ||
              "Position" in props
            ) {
              this._updateInstanceMetadata(name);
              
              if ("Position" in props) {
                const pos = MprisUtils.getInt64(props["Position"]);
                if (pos !== null) {
                  this._manager._playerPositions.set(name, pos);
                }
              }
              
              if (!this._manager._operationsPaused) {
                this._manager._onPlayerChanged?.(name);
              }
              
              this._manager._errorCounts.set(name, 0);
            }
          } catch (e) {
            this.handlePlayerError(name, e, "property change");
          }
        });
        signals.set('properties', propSignalId);
      } catch (e) {
        logError(e, `Failed to connect property signals for ${name}`);
      }

      try {
        const seekSignalId = proxy.connectSignal("Seeked", (proxy, sender, [position]) => {
          if (this._manager._isDestroyed || this._manager._operationsPaused) return;
          
          try {
            this._manager._playerPositions.set(name, position);
            if (!this._manager._operationsPaused) {
              this._manager._onSeeked?.(name, position);
            }
          } catch (e) {
            this.handlePlayerError(name, e, "seek");
          }
        });
        signals.set('seeked', seekSignalId);
      } catch (e) {
        logError(e, `Failed to connect seek signal for ${name}`);
      }

      this._updateInstanceMetadata(name);
      this._manager._pendingProxies.delete(name);
      
      if (!this._manager._isDestroyed && !this._manager._operationsPaused) {
        this._manager._onPlayerAdded?.(name);
      }
    } catch (e) {
      logError(e, `Failed to add player ${name}`);
      this._manager._proxies.delete(name);
      this._manager._proxySignals.delete(name);
      this._manager._pendingProxies.delete(name);
    }
  }

  handlePlayerError(name, error, context) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return;
    
    const errorCount = (this._manager._errorCounts.get(name) || 0) + 1;
    this._manager._errorCounts.set(name, errorCount);
    
    if (errorCount < 3) {
      logError(error, `Player ${name} error in ${context} (${errorCount}/${this._manager._maxErrorsPerPlayer})`);
    }
    
    if (errorCount >= this._manager._maxErrorsPerPlayer && !this._manager._operationsPaused) {
      this.schedulePlayerRemoval(name);
    }
  }

  _updateInstanceMetadata(name) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return;
    
    try {
      const info = this.getPlayerInfo(name);
      if (info && info.title) {
        this._manager._instanceMetadata.set(name, {
          title: info.title,
          artists: info.artists,
          trackId: info.trackId,
          status: info.status,
          artUrl: info.artUrl,
        });
      }
    } catch (e) {}
  }

  async _fetchIdentity(name) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return;
    
    return new Promise((resolve) => {
      this._manager._bus.call(
        name,
        MprisConstants.MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", [MprisConstants.MPRIS_IFACE, "Identity"]),
        null,
        Gio.DBusCallFlags.NONE,
        MprisConstants.DBUS_TIMEOUT,
        null,
        (conn, result) => {
          if (this._manager._isDestroyed || this._manager._operationsPaused) {
            resolve();
            return;
          }
          
          try {
            const reply = conn.call_finish(result);
            const identity = reply.deep_unpack()[0].unpack();
            this._manager._identities.set(name, identity);
          } catch (e) {
            const shortName = name.replace(`${MprisConstants.MPRIS_PREFIX}.`, "");
            this._manager._identities.set(name, shortName);
          }
          resolve();
        }
      );
    });
  }

  async _fetchDesktopEntry(name) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return;
    
    return new Promise((resolve) => {
      this._manager._bus.call(
        name,
        MprisConstants.MPRIS_PATH,
        "org.freedesktop.DBus.Properties",
        "Get",
        new GLib.Variant("(ss)", [MprisConstants.MPRIS_IFACE, "DesktopEntry"]),
        null,
        Gio.DBusCallFlags.NONE,
        MprisConstants.DBUS_TIMEOUT,
        null,
        (conn, result) => {
          if (this._manager._isDestroyed || this._manager._operationsPaused) {
            resolve();
            return;
          }
          
          try {
            const reply = conn.call_finish(result);
            const desktopEntry = reply.deep_unpack()[0].unpack();
            this._manager._desktopEntries.set(name, desktopEntry);
          } catch (e) {}
          resolve();
        }
      );
    });
  }

  schedulePlayerRemoval(name) {
    if (this._manager._cleanupTimers.has(name)) {
      GLib.source_remove(this._manager._cleanupTimers.get(name));
    }

    const timerId = GLib.timeout_add(GLib.PRIORITY_LOW, 500, () => {
      if (!this._manager._isDestroyed && !this._manager._operationsPaused) {
        this._queueProxyCleanup(name);
      }
      this._manager._cleanupTimers.delete(name);
      return GLib.SOURCE_REMOVE;
    });

    this._manager._cleanupTimers.set(name, timerId);
  }

  _queueProxyCleanup(name) {
    if (!this._manager._proxies.has(name)) return;
    
    this._manager._proxyCleanupQueue.push(name);
    
    if (!this._manager._cleanupInProgress) {
      this._processCleanupQueue();
    }
  }

  _processCleanupQueue() {
    if (this._manager._proxyCleanupQueue.length === 0 || this._manager._isDestroyed) {
      this._manager._cleanupInProgress = false;
      return;
    }

    this._manager._cleanupInProgress = true;
    const name = this._manager._proxyCleanupQueue.shift();

    GLib.timeout_add(GLib.PRIORITY_LOW, 150, () => {
      if (!this._manager._isDestroyed && !this._manager._operationsPaused) {
        this.removePlayerSafe(name);
      }
      
      GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
        this._processCleanupQueue();
        return GLib.SOURCE_REMOVE;
      });
      
      return GLib.SOURCE_REMOVE;
    });
  }

  _safeDisposeProxy(proxy) {
    if (!proxy) return;
    
    GLib.timeout_add(GLib.PRIORITY_LOW, 100, () => {
      try {
        proxy.run_dispose();
      } catch (e) {}
      return GLib.SOURCE_REMOVE;
    });
  }

  removePlayerSafe(name) {
    if (!this._manager._proxies.has(name)) return;
    
    const signals = this._manager._proxySignals.get(name);
    const proxy = this._manager._proxies.get(name);
    
    if (signals && proxy) {
      for (const [signalType, signalId] of signals) {
        try {
          proxy.disconnect(signalId);
        } catch (e) {}
      }
      this._manager._proxySignals.delete(name);
    }
    
    this._manager._proxies.delete(name);
    this._manager._identities.delete(name);
    this._manager._desktopEntries.delete(name);
    this._manager._instanceMetadata.delete(name);
    this._manager._errorCounts.delete(name);
    
    if (proxy) {
      this._safeDisposeProxy(proxy);
    }
    
    if (!this._manager._isDestroyed && !this._manager._operationsPaused) {
      this._manager._onPlayerRemoved?.(name);
    }
  }

  async _createProxy(name) {
    return new Promise((resolve, reject) => {
      Gio.DBusProxy.new(
        this._manager._bus,
        Gio.DBusProxyFlags.DO_NOT_AUTO_START,
        null,
        name,
        MprisConstants.MPRIS_PATH,
        MprisConstants.MPRIS_PLAYER_IFACE,
        null,
        (source, result) => {
          if (this._manager._isDestroyed || this._manager._operationsPaused) {
            reject(new Error("Manager destroyed or paused"));
            return;
          }
          
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

  // In MprisPlayer.js - Replace the getPlayerInfo method
  
  getPlayerInfo(name) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return null;
    
    const proxy = this._manager._proxies.get(name);
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
        try {
          const item = metaV.get_child_value(i);
          const key = MprisUtils.getString(item.get_child_value(0));
          const valueVariant = item.get_child_value(1).get_variant();
          
          if (!key) continue;
          meta[key] = valueVariant;
        } catch (e) {
          continue;
        }
      }
  
      const positionV = proxy.get_cached_property("Position");
      const shuffleV = proxy.get_cached_property("Shuffle");
      const loopStatusV = proxy.get_cached_property("LoopStatus");
  
      const lengthMicroseconds = MprisUtils.getInt64(meta["mpris:length"]);
      const artUrl = MprisUtils.getString(meta["mpris:artUrl"]);
      const trackId = MprisUtils.getString(meta["mpris:trackid"]) || "/";
      
      // IMPROVED POSITION HANDLING FOR FLATPAK
      let currentPosition = 0;
      
      // Try to get position from cached property first
      if (positionV) {
        try {
          currentPosition = positionV.unpack();
        } catch (e) {
          // If unpack fails, try direct value
          currentPosition = positionV.get_int64?.() || 0;
        }
      }
      
      // If we have a saved position and current is 0, use saved
      const savedPosition = this._manager._playerPositions.get(name);
      if (currentPosition === 0 && savedPosition) {
        currentPosition = savedPosition;
      }
      
      // If still 0 and status is Playing, manually query position
      if (currentPosition === 0 && status === "Playing") {
        try {
          this._queryPositionAsync(name);
        } catch (e) {}
      }
      
      return {
        title: MprisUtils.getString(meta["xesam:title"]),
        artists: meta["xesam:artist"]?.deep_unpack() ?? null,
        album: MprisUtils.getString(meta["xesam:album"]),
        artUrl: artUrl,
        trackId: trackId,
        trackNumber: MprisUtils.getInt32(meta["xesam:trackNumber"]),
        discNumber: MprisUtils.getInt32(meta["xesam:discNumber"]),
        genres: meta["xesam:genre"]?.deep_unpack() ?? null,
        contentCreated: MprisUtils.getString(meta["xesam:contentCreated"]),
        status: status,
        position: currentPosition,
        length: lengthMicroseconds || 0,
        shuffle: shuffleV ? shuffleV.unpack() : false,
        loopStatus: loopStatusV ? loopStatusV.unpack() : "None",
      };
    } catch (e) {
      this.handlePlayerError(name, e, "getPlayerInfo");
      return null;
    }
  }
  
  // Add this new method to MprisPlayer class
  _queryPositionAsync(name) {
    if (this._manager._isDestroyed || this._manager._operationsPaused) return;
    
    this._manager._bus.call(
      name,
      MprisConstants.MPRIS_PATH,
      "org.freedesktop.DBus.Properties",
      "Get",
      new GLib.Variant("(ss)", [MprisConstants.MPRIS_PLAYER_IFACE, "Position"]),
      null,
      Gio.DBusCallFlags.NONE,
      1000, // Short timeout
      null,
      (conn, result) => {
        if (this._manager._isDestroyed || this._manager._operationsPaused) return;
        
        try {
          const reply = conn.call_finish(result);
          const position = reply.deep_unpack()[0].unpack();
          this._manager._playerPositions.set(name, position);
          
          // Trigger update
          if (!this._manager._operationsPaused) {
            this._manager._onPlayerChanged?.(name);
          }
        } catch (e) {
          // Position query failed, player might not support it
        }
      }
    );
  }

  getPlayerDisplayLabel(name) {
    const baseApp = this._getBaseAppName(name);
    const instances = this._getInstancesOfApp(baseApp);
    
    if (instances.length <= 1) {
      return this._manager.getPlayerIdentity(name);
    }
    
    const metadata = this._manager._instanceMetadata.get(name);
    if (metadata && metadata.title) {
      const shortTitle = metadata.title.length > 25 
        ? metadata.title.substring(0, 25) + "..." 
        : metadata.title;
      return `${this._manager.getPlayerIdentity(name)}: ${shortTitle}`;
    }
    
    return this._manager.getPlayerIdentity(name);
  }

  _getBaseAppName(name) {
    return name.replace(/\.instance_\d+_\d+$/, "");
  }

  _getInstancesOfApp(baseAppName) {
    const instances = [];
    for (const name of this._manager._proxies.keys()) {
      if (this._getBaseAppName(name) === baseAppName) {
        instances.push(name);
      }
    }
    return instances;
  }

  getGroupedPlayers() {
    const groups = new Map();
    
    for (const name of this._manager._proxies.keys()) {
      const baseApp = this._getBaseAppName(name);
      if (!groups.has(baseApp)) {
        groups.set(baseApp, []);
      }
      groups.get(baseApp).push(name);
    }
    
    return groups;
  }
}