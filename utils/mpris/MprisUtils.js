import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import Shell from "gi://Shell";
import { MprisConstants } from "./MprisConstants.js";

export class MprisUtils {
  static getString(variant) {
    if (!variant) return null;
    try {
      const str = variant.get_string ? variant.get_string()[0] : null;
      return str || null;
    } catch (e) {
      return null;
    }
  }

  static getInt64(variant) {
    if (!variant) return null;
    try {
      return variant.get_int64();
    } catch (e) {
      return null;
    }
  }

  static getInt32(variant) {
    if (!variant) return null;
    try {
      return variant.get_int32();
    } catch (e) {
      return null;
    }
  }

  static getAppInfo(name, desktopEntries) {
    try {
      const desktopEntry = desktopEntries.get(name);
      if (desktopEntry) {
        let appInfo = Gio.DesktopAppInfo.new(`${desktopEntry}.desktop`);
        if (appInfo) return appInfo;

        appInfo = Gio.DesktopAppInfo.new(desktopEntry);
        if (appInfo) return appInfo;
      }

      let cleanName = name.replace(`${MprisConstants.MPRIS_PREFIX}.`, "").toLowerCase();
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");

      const appSystem = Shell.AppSystem.get_default();
      let app = appSystem.lookup_app(`${cleanName}.desktop`);
      if (app) return app.get_app_info();

      if (cleanName === "spotify") {
        app = appSystem.lookup_app("com.spotify.Client.desktop");
        if (app) return app.get_app_info();
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  static getAppIcon(name, desktopEntries) {
    try {
      const iconTheme = Gtk.IconTheme.get_for_display(
        require("gi://Gdk").Display.get_default(),
      );

      const desktopEntry = desktopEntries.get(name);
      if (desktopEntry) {
        const iconNames = [
          desktopEntry,
          desktopEntry.toLowerCase(),
          `${desktopEntry}-symbolic`,
          `${desktopEntry.toLowerCase()}-symbolic`,
        ];

        for (const iconName of iconNames) {
          if (iconTheme.has_icon(iconName)) {
            return iconName;
          }
        }
      }

      let cleanName = name.replace(`${MprisConstants.MPRIS_PREFIX}.`, "").toLowerCase();
      cleanName = cleanName.replace(/\.instance_\d+_\d+$/, "");

      const appMappings = {
        spotify: "spotify",
        vlc: "vlc",
        firefox: "firefox",
        chromium: "chromium",
        chrome: "google-chrome",
        rhythmbox: "rhythmbox",
        totem: "totem",
        mpv: "mpv",
        smplayer: "smplayer",
        audacious: "audacious",
        clementine: "clementine",
        strawberry: "strawberry",
        elisa: "elisa",
        lollypop: "lollypop",
        celluloid: "celluloid",
        brave: "brave-browser",
        "gnome-music": "org.gnome.Music",
        amberol: "io.bassi.Amberol",
      };

      const mappedName = appMappings[cleanName] || cleanName;
      const iconNames = [
        mappedName,
        `${mappedName}-symbolic`,
        cleanName,
        `${cleanName}-symbolic`,
        `com.${cleanName}.Client`,
        `com.spotify.Client`,
        `org.${cleanName}.${cleanName}`,
        "audio-x-generic-symbolic",
      ];

      for (const iconName of iconNames) {
        if (iconTheme.has_icon(iconName)) {
          return iconName;
        }
      }

      return "audio-x-generic-symbolic";
    } catch (e) {
      return "audio-x-generic-symbolic";
    }
  }
}