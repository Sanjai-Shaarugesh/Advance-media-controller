import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class expExtension extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Get settings
    const settings = this.getSettings();

    // preferences page
    const page = new Adw.PreferencesPage({
      title: "General",
      icon_name: "dialog-information-symbolic",
    });

    // create a Preferences group
    const group = new Adw.PreferencesGroup({
      title: "Appearance",
      description: "Configure the extension Appearance",
    });
    page.add(group);

    // text entry for greeting
    const greetingRow = new Adw.EntryRow({
      title: "Gretting Text",
    });
    greetingRow.set_text(settings.get_string("greeting-text"));
    greetingRow.connect("changed", () => {
      settings.set_string("greeting-text", greetingRow.get_text());
    });

    group.add(greetingRow);

    // switch for showing icon
    const iconRow = new Adw.SwitchRow({
      title: "Show icon",
      subtitle: "show icon in the panel",
    });
    settings.bind(
      "show-icon",
      iconRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    group.add(iconRow);

    // combo box for position
    const positionRow = new Adw.ComboRow({
      title: "Panel position",
      subtitle: "choose where to place the button",
    });

    const positionModel = new Gtk.StringList();
    positionModel.append("Left");
    positionModel.append("Center");
    positionModel.append("Right");

    positionRow.set_model(positionModel);

    const positions = ["left", "center", "right"];
    const currentPosition = settings.get_string("panel-position");
    positionRow.set_selected(positions.indexOf(currentPosition));

    positionRow.connect("notify::selected", () => {
      const selected = positionRow.get_selectd();
      settings.set_string("panel-position", positions[selected]);
    });
    group.add(positionRow);

    // group for statistics
    const statsGroup = new Adw.PreferencesGroup({
      title: "statistics",
    });
    page.add(statsGroup);
    
    // dispaly click count 
    const clickCountRow = new Adw.ActionRow({
      title: "Total clicks",
      subtitle: settings.get_int('click-count').toString(),
    });
    
    // add reset button 
    const resetButton = new Gtk.Button({
      label: 'Reset',
      valign: Gtk.Align.CENTER,
      css_classes: ['destructive-action'],
    });
    
    resetButton.connect('clicked', () => {
      settings.set_int('click-count', 0),
        clickCountRow.set_subtitle('0');
    });
    
    clickCountRow.add_suffix(resetButton);
    
    statsGroup.add(clickCountRow);
    //update the subtitle when settings changes
    settings.connect('changed::click-count', () => {
      clickCountRow.set_subtitle(settings.get_int('click-count').toString());
    })

    window.add(page);
  }
}
