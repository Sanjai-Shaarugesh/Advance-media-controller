import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MediaIndicator } from "./indicator.js";

export default class MediaExtension extends Extension {
  enable() {
    log("Media Controls Extension Enabled");

    this._settings = this.getSettings();
    
    // Create indicator
    this._indicator = new MediaIndicator(this._settings);
    
    // Add to panel with configured position
    this._addToPanel();

    // Watch for lock screen setting
    this._lockScreenChangedId = this._settings.connect(
      "changed::show-on-lock-screen",
      () => this._updateLockScreenVisibility()
    );

    // Monitor session mode changes
    this._sessionModeChangedId = Main.sessionMode.connect(
      "updated",
      () => {
        log(`MediaControls: Session mode changed to: ${Main.sessionMode.currentMode}, isLocked: ${Main.sessionMode.isLocked}`);
        this._updateLockScreenVisibility();
      }
    );

    // Also monitor lock screen state separately
    this._lockStateId = Main.screenShield?.connect('active-changed', () => {
      log(`MediaControls: Screen shield active changed: ${Main.screenShield.locked}`);
      this._updateLockScreenVisibility();
    });

    this._updateLockScreenVisibility();
  }

  _addToPanel() {
    const position = this._settings.get_string("panel-position");
    const index = this._settings.get_int("panel-index");
    
    // Determine target box
    let targetBox;
    switch (position) {
      case "left":
        targetBox = Main.panel._leftBox;
        break;
      case "center":
        targetBox = Main.panel._centerBox;
        break;
      case "right":
      default:
        targetBox = Main.panel._rightBox;
        break;
    }
    
    // Calculate actual index
    const actualIndex = index === -1 ? 0 : Math.min(index, targetBox.get_n_children());
    
    // Add indicator
    targetBox.insert_child_at_index(this._indicator.container, actualIndex);
    
    log(`MediaControls: Added to panel at ${position}[${actualIndex}]`);
  }

  _updateLockScreenVisibility() {
    if (!this._indicator) return;

    const showOnLockScreen = this._settings.get_boolean("show-on-lock-screen");
    const isLocked = Main.sessionMode.isLocked || 
                     Main.sessionMode.currentMode === 'unlock-dialog' ||
                     (Main.screenShield && Main.screenShield.locked);

    if (this._indicator._manager) {
      const hasPlayers = this._indicator._manager.getPlayers().length > 0;
      
      if (hasPlayers) {
        if (isLocked && showOnLockScreen) {
          this._indicator.show();
        } else if (isLocked && !showOnLockScreen) {
          this._indicator.hide();
        } else if (!isLocked) {
          this._indicator.show();
        }
      } else {
        this._indicator.hide();
      }
    }
  }

  disable() {
    log("Media Controls Extension Disabled");

    if (this._lockScreenChangedId) {
      this._settings.disconnect(this._lockScreenChangedId);
      this._lockScreenChangedId = 0;
    }

    if (this._sessionModeChangedId) {
      Main.sessionMode.disconnect(this._sessionModeChangedId);
      this._sessionModeChangedId = 0;
    }

    if (this._lockStateId && Main.screenShield) {
      Main.screenShield.disconnect(this._lockStateId);
      this._lockStateId = 0;
    }

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
  }
}