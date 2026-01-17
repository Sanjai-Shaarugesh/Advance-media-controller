import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class MediaControlsPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    // General page
    const generalPage = new Adw.PreferencesPage({
      title: "General",
      icon_name: "preferences-system-symbolic",
    });
    window.add(generalPage);

    // Panel Settings Group
    const panelGroup = new Adw.PreferencesGroup({
      title: "Panel Settings",
      description: "Configure the position and appearance in the top panel",
    });
    generalPage.add(panelGroup);

    // Panel Position
    const positionRow = new Adw.ComboRow({
      title: "Panel Position",
    });
    
    const positionModel = new Gtk.StringList();
    positionModel.append("Left");
    positionModel.append("Center");
    positionModel.append("Right");
    positionRow.model = positionModel;
    
    const positions = ["left", "center", "right"];
    const currentPos = settings.get_string("panel-position");
    positionRow.selected = positions.indexOf(currentPos);
    
    positionRow.connect("notify::selected", (widget) => {
      settings.set_string("panel-position", positions[widget.selected]);
    });
    
    panelGroup.add(positionRow);

    // Panel Index
    const indexRow = new Adw.SpinRow({
      title: "Panel Index",
      adjustment: new Gtk.Adjustment({
        lower: -1,
        upper: 20,
        step_increment: 1,
        page_increment: 1,
      }),
    });
    
    settings.bind(
      "panel-index",
      indexRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    panelGroup.add(indexRow);

    // Display Settings Group
    const displayGroup = new Adw.PreferencesGroup({
      title: "Display Settings",
      description: "Configure what appears in the panel",
    });
    generalPage.add(displayGroup);

    // Show Track Name
    const showTrackRow = new Adw.SwitchRow({
      title: "Show Track Name",
    });
    
    settings.bind(
      "show-track-name",
      showTrackRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(showTrackRow);

    // Show Artist
    const showArtistRow = new Adw.SwitchRow({
      title: "Show Artist Name",
    });
    
    settings.bind(
      "show-artist",
      showArtistRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(showArtistRow);

    // Max Title Length
    const maxLengthRow = new Adw.SpinRow({
      title: "Maximum Title Length",
      adjustment: new Gtk.Adjustment({
        lower: 10,
        upper: 100,
        step_increment: 5,
        page_increment: 10,
      }),
    });
    
    settings.bind(
      "max-title-length",
      maxLengthRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(maxLengthRow);

    // Scroll Speed
    const scrollSpeedRow = new Adw.SpinRow({
      title: "Scroll Speed",
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 10,
        step_increment: 1,
        page_increment: 1,
      }),
    });
    
    settings.bind(
      "scroll-speed",
      scrollSpeedRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(scrollSpeedRow);

    // Separator Text
    const separatorRow = new Adw.EntryRow({
      title: "Separator Text",
    });
    separatorRow.show_apply_button = true;
    
    separatorRow.text = settings.get_string("separator-text");
    
    separatorRow.connect("apply", () => {
      settings.set_string("separator-text", separatorRow.text);
    });
    
    separatorRow.connect("changed", () => {
      settings.set_string("separator-text", separatorRow.text);
    });
    
    displayGroup.add(separatorRow);

    // Lock Screen Group
    const lockScreenGroup = new Adw.PreferencesGroup({
      title: "Lock Screen",
      description: "Control visibility on the lock screen",
    });
    generalPage.add(lockScreenGroup);

    // Show on Lock Screen
    const lockScreenRow = new Adw.SwitchRow({
      title: "Show on Lock Screen",
    });
    
    settings.bind(
      "show-on-lock-screen",
      lockScreenRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    lockScreenGroup.add(lockScreenRow);

    // About page
    const aboutPage = new Adw.PreferencesPage({
      title: "About",
      icon_name: "help-about-symbolic",
    });
    window.add(aboutPage);

    const aboutGroup = new Adw.PreferencesGroup();
    aboutPage.add(aboutGroup);

    const aboutRow = new Adw.ActionRow({
      title: "Media Controls Extension",
    });
    aboutRow.add_suffix(new Gtk.Label({
      label: "v2.1",
      css_classes: ["dim-label"],
    }));
    
    aboutGroup.add(aboutRow);
  }
}