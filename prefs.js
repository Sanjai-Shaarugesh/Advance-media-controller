import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Gdk from "gi://Gdk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class MediaControlsPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    window.set_title("Advanced Media Controller");
    window.set_default_size(700, 650);
    window.set_resizable(true);

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

    // About page
    const aboutPage = this._createAboutPage(settings);
    window.add(aboutPage);
  }

  _createAboutPage(settings) {
    const page = new Adw.PreferencesPage({
      title: "About",
      icon_name: "help-about-symbolic",
    });

    const infoGroup = new Adw.PreferencesGroup({
      title: "Advanced Media Controller",
      description: "Beautiful and modern media controls with multi-instance support",
    });

    const headerBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 20,
      margin_top: 20,
      margin_bottom: 20,
      halign: Gtk.Align.CENTER,
    });

    // Try to load extension logo
    const logoPath = `${this.dir.get_path()}/icons/media-logo.png`;
    let logoImage;
    try {
      logoImage = Gtk.Image.new_from_file(logoPath);
      logoImage.set_pixel_size(72);
    } catch (e) {
      logoImage = new Gtk.Image({
        icon_name: "multimedia-player-symbolic",
        pixel_size: 72,
      });
    }

    const infoBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      valign: Gtk.Align.CENTER,
    });

    const titleLabel = new Gtk.Label({
      label: "Advanced Media Controller",
      halign: Gtk.Align.START,
      css_classes: ["title-2"],
    });

    const versionLabel = new Gtk.Label({
      label: "Version 1.0",
      halign: Gtk.Align.START,
      css_classes: ["caption"],
    });

    const descLabel = new Gtk.Label({
      label: "Modern media controls with native GNOME design",
      halign: Gtk.Align.START,
      wrap: true,
      max_width_chars: 40,
      css_classes: ["body"],
    });

    infoBox.append(titleLabel);
    infoBox.append(versionLabel);
    infoBox.append(descLabel);
    headerBox.append(logoImage);
    headerBox.append(infoBox);

    const headerRow = new Adw.ActionRow({ title: "", activatable: false });
    headerRow.add_suffix(headerBox);

    const linksGroup = new Adw.PreferencesGroup({
      title: "Extension Links",
      description: "Source code, issues, and contributions",
    });

    const githubRow = new Adw.ActionRow({
      title: "View on GitHub",
      subtitle: "Source code, issues, and contributions",
      activatable: true,
    });

    const githubIcon = this._createGitHubIcon();
    githubRow.add_prefix(githubIcon);

    const externalIcon = new Gtk.Image({
      icon_name: "adw-external-link-symbolic",
      pixel_size: 16,
    });
    githubRow.add_suffix(externalIcon);
    githubRow.connect("activated", () => {
      try {
        Gio.AppInfo.launch_default_for_uri(
          "https://github.com/Sanjai-Shaarugesh/Advance-media-controller",
          null
        );
      } catch (error) {
        console.error("Could not open GitHub link:", error);
      }
    });

    // QR Code Section
    const qrGroup = new Adw.PreferencesGroup({
      title: "☕ Support by buying me a coffee — just scan the QR code!",
      description: "Preferred Method - Scan QR code to support development",
    });

    const qrContainer = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 16,
      halign: Gtk.Align.CENTER,
      margin_top: 24,
      margin_bottom: 24,
      margin_start: 24,
      margin_end: 24,
      css_classes: ["qr-container"],
    });

    const qrImageBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      halign: Gtk.Align.CENTER,
      css_classes: ["qr-image-container"],
    });

    const qrPath = `${this.dir.get_path()}/icons/qr.png`;
    let qrImage;
    try {
      qrImage = Gtk.Image.new_from_file(qrPath);
      qrImage.set_pixel_size(200);
      qrImage.set_css_classes(["qr-code-image"]);
    } catch (e) {
      qrImage = new Gtk.Image({
        icon_name: "camera-web-symbolic",
        pixel_size: 200,
      });
      qrImage.set_css_classes(["qr-code-placeholder"]);
    }

    qrImageBox.append(qrImage);
    qrContainer.append(qrImageBox);

    const qrRow = new Adw.ActionRow({
      title: "",
      activatable: false,
    });
    qrRow.set_child(qrContainer);

    // Donation Address Section
    const addressGroup = new Adw.PreferencesGroup({
      title: "Donation Address",
      css_classes: ["address-group"],
    });

    const addressRow = new Adw.ActionRow({
      title: "https://buymeacoffee.com/sanjai",
      activatable: true,
      css_classes: ["address-row"],
    });

    const donationIcon = new Gtk.Image({
      icon_name: "emote-love-symbolic",
      pixel_size: 16,
    });
    addressRow.add_prefix(donationIcon);

    const copyIcon = new Gtk.Image({
      icon_name: "edit-copy-symbolic",
      pixel_size: 16,
      css_classes: ["copy-icon"],
    });
    addressRow.add_suffix(copyIcon);

    addressRow.connect("activated", () => {
      const address = "https://buymeacoffee.com/sanjai";
      this._copyToClipboard(address, "Donation address");
    });

    const sponsorRow = new Adw.ActionRow({
      title: "☕ Buy Me a Coffee",
      subtitle: "Support development with a small donation",
      activatable: true,
    });
    const heartIcon = new Gtk.Image({
      icon_name: "emblem-favorite-symbolic",
      pixel_size: 20,
    });
    sponsorRow.add_prefix(heartIcon);
    const sponsorIcon = new Gtk.Image({
      icon_name: "adw-external-link-symbolic",
      pixel_size: 16,
    });
    sponsorRow.add_suffix(sponsorIcon);
    sponsorRow.connect("activated", () => {
      try {
        Gio.AppInfo.launch_default_for_uri("https://buymeacoffee.com/sanjai", null);
      } catch (error) {
        console.error("Could not open sponsor link:", error);
      }
    });

    const licenseGroup = new Adw.PreferencesGroup({
      title: "License & Credits",
      description: "Open source software information",
    });

    const licenseRow = new Adw.ActionRow({
      title: "Open Source License",
      subtitle: "GPL-3.0 License - Free and open source software",
      activatable: false,
    });
    const licenseIcon = new Gtk.Image({
      icon_name: "security-high-symbolic",
      pixel_size: 16,
    });
    licenseRow.add_prefix(licenseIcon);

    const creditsRow = new Adw.ActionRow({
      title: "Media Data Sources",
      subtitle: "MPRIS D-Bus interface - Standard media player remote interfacing",
      activatable: false,
    });
    const apiIcon = new Gtk.Image({
      icon_name: "network-server-symbolic",
      pixel_size: 16,
    });
    creditsRow.add_prefix(apiIcon);

    const featuresRow = new Adw.ActionRow({
      title: "Key Features",
      subtitle: "• Multi-instance browser support\n• Album art display\n• Smooth animations\n• Lock screen controls",
      activatable: false,
    });
    const featuresIcon = new Gtk.Image({
      icon_name: "starred-symbolic",
      pixel_size: 16,
    });
    featuresRow.add_prefix(featuresIcon);

    // Add all rows to their respective groups
    infoGroup.add(headerRow);
    linksGroup.add(githubRow);
    linksGroup.add(sponsorRow);
    qrGroup.add(qrRow);
    addressGroup.add(addressRow);
    licenseGroup.add(licenseRow);
    licenseGroup.add(creditsRow);
    licenseGroup.add(featuresRow);

    // Add all groups to the page
    page.add(infoGroup);
    page.add(linksGroup);
    page.add(qrGroup);
    page.add(addressGroup);
    page.add(licenseGroup);

    return page;
  }

  _createGitHubIcon() {
    try {
      const githubIconPath = `${this.dir.get_path()}/icons/github.svg`;
      const file = Gio.File.new_for_path(githubIconPath);

      if (file.query_exists(null)) {
        return new Gtk.Image({
          file: githubIconPath,
          pixel_size: 20,
        });
      }
    } catch (error) {
      console.log("GitHub icon file not found, creating from SVG data");
    }

    try {
      const githubSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
</svg>`;

      const tempDir = GLib.get_tmp_dir();
      const tempPath = `${tempDir}/github-icon-${Date.now()}.svg`;
      const tempFile = Gio.File.new_for_path(tempPath);

      tempFile.replace_contents(githubSvg, null, false, Gio.FileCreateFlags.NONE, null);

      const githubIcon = new Gtk.Image({
        file: tempPath,
        pixel_size: 20,
      });

      GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        try {
          tempFile.delete(null);
        } catch (e) {}
        return GLib.SOURCE_REMOVE;
      });

      return githubIcon;
    } catch (error) {
      console.error("Failed to create GitHub icon:", error);
      return new Gtk.Image({
        icon_name: "software-properties-symbolic",
        pixel_size: 20,
      });
    }
  }

  _copyToClipboard(text, label = null) {
    try {
      const display = Gdk.Display.get_default();
      if (!display) {
        throw new Error("No display available");
      }

      const clipboard = display.get_clipboard();
      if (!clipboard) {
        throw new Error("No clipboard available");
      }

      clipboard.set_text_async(text, -1, null, (clipboard, result) => {
        try {
          clipboard.set_text_finish(result);
          this._showToast(`✅ ${label || 'Text'} copied to clipboard!`);
        } catch (error) {
          console.log("Async clipboard set failed:", error.message);
          this._trySync(clipboard, text, label);
        }
      });
      return;
    } catch (error) {
      console.log("Async clipboard method failed:", error.message);
    }

    try {
      const display = Gdk.Display.get_default();
      const clipboard = display?.get_clipboard();
      if (clipboard) {
        this._trySync(clipboard, text, label);
        return;
      }
    } catch (error) {
      console.log("Sync clipboard method failed:", error.message);
    }

    console.log("All clipboard methods failed, showing manual copy dialog");
    this._showCopyDialog(text, label);
  }

  _trySync(clipboard, text, label) {
    try {
      clipboard.set_text(text);
      this._showToast(`✅ ${label || 'Text'} copied to clipboard!`);
      return true;
    } catch (error) {
      console.log("Synchronous clipboard failed:", error.message);

      try {
        const contentProvider = Gdk.ContentProvider.new_for_value(text);
        if (contentProvider) {
          clipboard.set_content(contentProvider);
          this._showToast(`✅ ${label || 'Text'} copied to clipboard!`);
          return true;
        }
      } catch (providerError) {
        console.log("Content provider approach failed:", providerError.message);
      }

      return false;
    }
  }

  _showCopyDialog(text, label = null) {
    const dialog = new Adw.MessageDialog({
      heading: "Copy to Clipboard",
      body: `Unable to automatically copy to clipboard. Please manually copy the ${label || 'text'} below:`,
      modal: true,
    });

    dialog.add_response("close", "Close");
    dialog.add_response("select", "Select Text");
    dialog.set_response_appearance("select", Adw.ResponseAppearance.SUGGESTED);
    dialog.set_default_response("select");

    const contentBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 12,
      margin_top: 12,
      margin_bottom: 12,
      margin_start: 12,
      margin_end: 12,
    });

    const textView = new Gtk.TextView({
      editable: false,
      cursor_visible: true,
      wrap_mode: Gtk.WrapMode.CHAR,
      css_classes: ["monospace", "card"],
      margin_top: 8,
      margin_bottom: 8,
      margin_start: 8,
      margin_end: 8,
    });

    const scrolledWindow = new Gtk.ScrolledWindow({
      child: textView,
      height_request: Math.min(120, Math.max(40, text.length / 3)),
      hscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      css_classes: ["view"],
    });

    const buffer = textView.get_buffer();
    buffer.set_text(text, -1);

    contentBox.append(scrolledWindow);

    const instructionLabel = new Gtk.Label({
      label: "💡 Select the text above and press Ctrl+C to copy",
      css_classes: ["caption", "dim-label"],
      halign: Gtk.Align.CENTER,
      margin_top: 8,
    });
    contentBox.append(instructionLabel);

    dialog.set_extra_child(contentBox);

    dialog.connect("response", (dialog, response) => {
      if (response === "select") {
        const startIter = buffer.get_start_iter();
        const endIter = buffer.get_end_iter();
        buffer.select_range(startIter, endIter);
        textView.grab_focus();

        try {
          const display = Gdk.Display.get_default();
          if (display) {
            const clipboard = display.get_clipboard();
            if (clipboard) {
              clipboard.set_text(text);
              this._showToast(`✅ ${label || 'Text'} copied to clipboard!`);
              dialog.close();
              return;
            }
          }
        } catch (e) {
          this._showToast("💡 Text selected! Press Ctrl+C to copy");
        }
        return;
      }
      dialog.close();
    });

    dialog.present();
  }

  _showToast(message) {
    console.log(message);
  }
}