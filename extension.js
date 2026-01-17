import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import { MediaIndicator } from "./utils/indicator.js";

export default class MediaExtension extends Extension {
  enable() {
    log("Media Controls Extension Enabled");

    this._settings = this.getSettings();
    
    // Create indicator
    this._indicator = new MediaIndicator(this._settings);
    
    // Add to panel with configured position
    this._addToPanel();

    

    // Monitor session mode changes
    this._sessionModeChangedId = Main.sessionMode.connect(
      "updated",
      () => {
        log(`MediaControls: Session mode changed to: ${Main.sessionMode.currentMode}`);
        
      }
    );

   

   
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

  

  disable() {
    log("Media Controls Extension Disabled");

    

    if (this._sessionModeChangedId) {
      Main.sessionMode.disconnect(this._sessionModeChangedId);
      this._sessionModeChangedId = 0;
    }

   

    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    this._settings = null;
  }
}