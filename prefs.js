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
      subtitle: "Position within the panel area (-1 for automatic)",
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
      subtitle: "Display track information in the panel",
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
      subtitle: "Include artist name with track title",
    });
    
    settings.bind(
      "show-artist",
      showArtistRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(showArtistRow);

    // Enable Scroll
    const enableScrollRow = new Adw.SwitchRow({
      title: "Enable Title Scrolling",
      subtitle: "Animate long titles with scrolling effect",
    });
    
    settings.bind(
      "enable-scroll",
      enableScrollRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    displayGroup.add(enableScrollRow);

    // Max Title Length
    const maxLengthRow = new Adw.SpinRow({
      title: "Maximum Title Length",
      subtitle: "Characters to display before scrolling starts",
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
      subtitle: "1 = slowest, 10 = fastest",
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
      text: settings.get_string("separator-text"),
    });
    
    separatorRow.connect("apply", () => {
      settings.set_string("separator-text", separatorRow.text);
    });
    
    displayGroup.add(separatorRow);

    // Popup Behavior Group
    const popupGroup = new Adw.PreferencesGroup({
      title: "Popup Behavior",
      description: "Configure popup menu behavior",
    });
    generalPage.add(popupGroup);

    // Auto-hide on external click
    const autoHideRow = new Adw.SwitchRow({
      title: "Auto-hide on External Click",
      subtitle: "Close popup when clicking outside",
    });
    
    settings.bind(
      "auto-hide-popup",
      autoHideRow,
      "active",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    popupGroup.add(autoHideRow);

    // Popup Timeout
    const timeoutRow = new Adw.SpinRow({
      title: "Auto-close Timeout",
      subtitle: "Seconds before auto-closing (0 = disabled)",
      adjustment: new Gtk.Adjustment({
        lower: 0,
        upper: 60,
        step_increment: 5,
        page_increment: 10,
      }),
    });
    
    settings.bind(
      "popup-timeout",
      timeoutRow,
      "value",
      Gio.SettingsBindFlags.DEFAULT
    );
    
    popupGroup.add(timeoutRow);

    // Lock Screen Group
    const lockScreenGroup = new Adw.PreferencesGroup({
      title: "Lock Screen",
      description: "Control visibility on the lock screen",
    });
    generalPage.add(lockScreenGroup);

    // Show on Lock Screen
    const lockScreenRow = new Adw.SwitchRow({
      title: "Show on Lock Screen",
      subtitle: "Display media controls when screen is locked",
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
      subtitle: "Enhanced MPRIS media player controls for GNOME Shell",
    });
    aboutRow.add_suffix(new Gtk.Label({
      label: "v2.2",
      css_classes: ["dim-label"],
    }));
    
    aboutGroup.add(aboutRow);
  }
}