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
    positionRow.subtitle = "Where to show the indicator in the panel";
    
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
    indexRow.subtitle = "Position within the panel area (0 = leftmost/rightmost)";
    
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
    showTrackRow.subtitle = "Display scrolling track name in the panel while playing";
    
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
    showArtistRow.subtitle = "Include artist name with track title";
    
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
    maxLengthRow.subtitle = "Maximum characters before scrolling starts";
    
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
    scrollSpeedRow.subtitle = "How fast the text scrolls (1=slowest, 10=fastest)";
    
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
    
    // Set initial value
    separatorRow.text = settings.get_string("separator-text");
    
    // Connect apply signal
    separatorRow.connect("apply", () => {
      settings.set_string("separator-text", separatorRow.text);
    });
    
    // Also update on focus lost
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
    lockScreenRow.subtitle = "Display media controls when the screen is locked";
    
    settings.bind(
      "show-on-lock-screen",
      lockScreenRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    lockScreenGroup.add(lockScreenRow);

    // Info Group
    const infoGroup = new Adw.PreferencesGroup({
      title: "Information",
    });
    generalPage.add(infoGroup);

    const restartRow = new Adw.ActionRow({
      title: "⚠️ Restart Required",
    });
    restartRow.subtitle = "Panel position changes require restarting GNOME Shell\nPress Alt+F2, type 'r', and press Enter (X11 only)\nOr log out and back in (Wayland)";
    
    infoGroup.add(restartRow);

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
    aboutRow.subtitle = "MPRIS media player integration for GNOME Shell\n\nVersion 2.0\n\nFeatures GPU-accelerated rendering, fast image loading,\nand seamless integration with your favorite media players.";
    
    aboutGroup.add(aboutRow);
  }
}