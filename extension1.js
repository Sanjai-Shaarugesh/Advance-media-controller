import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import St from "gi://St";
import GObject from 'gi://GObject';

export default class sanjai extends Extension{
  enable() {
    log("Panel Button Extension Enabled");
    Main.notify("Panel Button Extension Enabled");
    
    // create a button using panel
    this._indicator = new PanelMenu.Button(0, "Panel Btton", false);
    
    // create icon using St
    let icon = new St.Icon({
      icon_name: "face-smile",
      style_class: 'system-status-icon',
    });
    
    // Add icon to the button
    this._indicator.add_child(icon);
    
    // menu item with callback 
    let item1 = new PopupMenu.PopupMenuItem('Show Notification');
    item1.connect('activate', () => {
      Main.notify("Hello", "You clicked the first menu item 🤗");
    });
    
    this._indicator.menu.addMenuItem(item1)
    
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
      Main.notify('Toggle changed', `Featureis now ${state ? 'ON' : 'OFF'}`);
    });
    this._indicator.menu.addMenuItem(this._toggleItem);
    
    // subMenu
    let subMenu = new PopupMenu.PopupSubMenuMenuItem('More options');
    subMenu.menu.addMenuItem(new PopupMenu.PopupMenuItem('Option 1'));
    subMenu.menu.addMenuItem(new PopupMenu.PopupMenuItem("Option 2"));
    subMenu.menu.addMenuItem(new PopupMenu.PopupMenuItem("Option 3"));
    
    this._indicator.menu.addMenuItem(subMenu);
    
    // //connect the button to the click event 
    // this._indicator.connect('button-press-event', () => {
    //   Main.notify("Button clicked ", "you clicked my extension!");
    // });
    
    // Add to the status area 
     Main.panel.addToStatusArea('popup-menu-extension', this._indicator);
    
  }
  disable() {
    log("Panel Button Extension Disabled");
    Main.notify("Panel Button Extension Disabled");
    
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    
    this._toggleItem = null;
  }
}