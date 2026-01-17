import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import St from "gi://St";
import GObject from 'gi://GObject';

export default class sanjai extends Extension {
  enable() {
    this._settings = this.getSettings();
    log("Panel Button Extension Enabled");
    Main.notify("Panel Button Extension Enabled");
    
    // create a button using panel
    this._indicator = new PanelMenu.Button(0, "Panel Button", false);
    
    // create icon using St
    let icon = new St.Icon({
      icon_name: "face-smile",
      style_class: 'system-status-icon',
    });
    
    // Add icon to the button
    this._indicator.add_child(icon);
    
    icon.visible = this._settings.get_boolean('show-icon');
    
    let greetItem = new PopupMenu.PopupMenuItem('Show Greeting');
    greetItem.connect('activate', () => {
      // Read the greeting item from the text 
      let greeting = this._settings.get_string('greeting-text');
      
      // Get and increment click count
      let count = this._settings.get_int('click-count');
      this._settings.set_int('click-count', count + 1);
      
      Main.notify(greeting, `You clicked ${count + 1} times`);
    });
    
    this._indicator.menu.addMenuItem(greetItem);
    
    // Toggle for showing icon
    let toggleIcon = new PopupMenu.PopupSwitchMenuItem(
      'Show Icon',
      this._settings.get_boolean('show-icon')
    );
    
    toggleIcon.connect('toggled', (item, state) => {
      // save to the settings
      this._settings.set_boolean('show-icon', state);
      // update the icon visibility
      icon.visible = state;
    });
    
    this._indicator.menu.addMenuItem(toggleIcon);
    
    // Listen for external settings changes
    this._settingsChangedId = this._settings.connect('changed::show-icon', () => {
      let showIcon = this._settings.get_boolean('show-icon');
      icon.visible = showIcon;
    });
    
    // Position menu item 
    let positionMenu = new PopupMenu.PopupSubMenuMenuItem('Panel Position');
    
    ['left', 'center', 'right'].forEach(position => {
      let item = new PopupMenu.PopupMenuItem(
        position.charAt(0).toUpperCase() + position.slice(1)
      );
      item.connect('activate', () => {
        // save the new position
        this._settings.set_string('panel-position', position);
        
        // Remove the indicator from the current position
        Main.panel._rightBox.remove_child(this._indicator);
        Main.panel._centerBox.remove_child(this._indicator);
        Main.panel._leftBox.remove_child(this._indicator);
        
        // Add back to the status area
        Main.panel.addToStatusArea('settings-extension', this._indicator, 0, position);
        Main.notify('Position changed', `Moved to ${position}!`);
      });
      
      positionMenu.menu.addMenuItem(item);
    });
    
    this._indicator.menu.addMenuItem(positionMenu);
    
    // add button to the panel at configured position
    let position = this._settings.get_string('panel-position');
    Main.panel.addToStatusArea('settings-extension', this._indicator, 0, position);
    
    // menu item with callback 
    let item1 = new PopupMenu.PopupMenuItem('Show Notification');
    item1.connect('activate', () => {
      Main.notify("Hello", "You clicked the first menu item 🤗");
    });
    
    this._indicator.menu.addMenuItem(item1);
    
    // Menu item with icon
    let item2 = new PopupMenu.PopupImageMenuItem('Open Settings', 'preferences-system-symbolic');
    item2.connect('activate', () => {
      Main.notify('Settings', "This would open settings");
    });
    
    this._indicator.menu.addMenuItem(item2);
    
    // separator line
    this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    
    // switch toggle item 
    this._toggleItem = new PopupMenu.PopupSwitchMenuItem('Enable Feature', false);
    this._toggleItem.connect('toggled', (item, state) => {
      Main.notify('Toggle changed', `Feature is now ${state ? 'ON' : 'OFF'}`);
    });
    this._indicator.menu.addMenuItem(this._toggleItem);
    
    // subMenu
    let subMenu = new PopupMenu.PopupSubMenuMenuItem('More options');
    
    ['option 1', 'option 2', 'option 3'].forEach(optionName => {
      let item = new PopupMenu.PopupMenuItem(optionName);
      item.connect('activate', () => {
        Main.notify('Clicked', `You clicked: ${optionName}`);
      });
      subMenu.menu.addMenuItem(item);
    });
    
    this._indicator.menu.addMenuItem(subMenu);
  }
  
  disable() {
    log("Panel Button Extension Disabled");
    Main.notify("Panel Button Extension Disabled");
    
    // Disconnect settings signal
    if (this._settingsChangedId) {
      this._settings.disconnect(this._settingsChangedId);
      this._settingsChangedId = null;
    }
    
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    
    this._toggleItem = null;
  }
}