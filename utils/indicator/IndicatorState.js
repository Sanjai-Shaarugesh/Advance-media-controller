import GLib from "gi://GLib";

export class IndicatorState {
  constructor() {
    this._currentPlayer = null;
    this._scrollTimeout = null;
    this._scrollPosition = 0;
    this._fullText = "";
    this._settingsChangedId = 0;
    this._sessionModeId = 0;
    this._updateThrottle = null;
    this._capturedEventId = null;
    this._windowFocusId = null;
    this._overviewShowingId = null;
    this._overviewHidingId = null;
    this._lastUpdateTime = 0;
    this._isDestroyed = false;
    this._isInitializing = true;
    this._pendingOperations = new Set();
    this._sessionChanging = false;
    this._managerInitialized = false;
    this._initTimeout = null;
    this._safetyLock = false;
    this._errorCount = 0;
    this._maxErrors = 10;
    this._lastErrorTime = 0;
    this._preventLogout = false;
  }

  safeExecute(fn) {
    if (this._isDestroyed || this._sessionChanging || this._safetyLock || this._preventLogout)
      return;

    const now = Date.now();
    if (now - this._lastErrorTime < 1000 && this._errorCount >= this._maxErrors) {
      return;
    }

    try {
      fn();
      this._errorCount = 0;
    } catch (e) {
      this._errorCount++;
      this._lastErrorTime = now;

      if (this._errorCount < this._maxErrors) {
        logError(e, "Safe execute error");
      }

      GLib.timeout_add(GLib.PRIORITY_LOW, 5000, () => {
        this._errorCount = Math.max(0, this._errorCount - 1);
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  scheduleOperation(fn, delay = 0) {
    if (this._isDestroyed) return;

    const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT_IDLE, delay, () => {
      this._pendingOperations.delete(id);
      if (!this._isDestroyed && !this._sessionChanging && !this._preventLogout) {
        this.safeExecute(fn);
      }
      return GLib.SOURCE_REMOVE;
    });

    this._pendingOperations.add(id);
    return id;
  }
}