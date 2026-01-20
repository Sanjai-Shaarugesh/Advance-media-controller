import St from "gi://St";
import Gio from "gi://Gio";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import GObject from "gi://GObject";

export const AlbumArt = GObject.registerClass(
  class AlbumArt extends St.BoxLayout {
    _init() {
      super._init({
        x_align: Clutter.ActorAlign.CENTER,
        style: "margin-bottom: 24px;",
      });

      this._coverCache = new Map();
      this._currentArtUrl = null;
      this._buildUI();
    }

    _buildUI() {
      this._coverArt = new St.Bin({
        style_class: "media-album-art",
        style: `
          width: 300px; 
          height: 300px; 
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
        `,
      });

      this._coverImage = new St.Widget({
        style_class: "cover-art-image",
        width: 300,
        style: `
          border-radius: 16px;
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          min-height: 300px;
        `,
      });
      
      this._coverArt.set_child(this._coverImage);
      this.add_child(this._coverArt);
    }

    loadCover(url, forceRefresh = false) {
      // Don't reload if it's the same URL and not forced
      if (!forceRefresh && this._currentArtUrl === url) {
        return;
      }
      
      this._currentArtUrl = url;

      if (!forceRefresh) {
        const cached = this._coverCache.get(url);
        if (cached) {
          this._coverImage.style = cached;
          return;
        }
      }

      try {
        let imageUrl = url;
        
        if (url.startsWith("file://")) {
          imageUrl = url;
        } else if (url.startsWith("http://") || url.startsWith("https://")) {
          this._downloadCover(url);
          return;
        } else {
          imageUrl = `file://${url}`;
        }
        
        const coverStyle = `
          border-radius: 16px;
          background-image: url('${imageUrl}');
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          min-height: 300px;
        `;
        
        this._coverImage.style = coverStyle;
        this._coverCache.set(url, coverStyle);
        
      } catch (e) {
        this.setDefaultCover();
      }
    }

    _downloadCover(url) {
      const hash = GLib.compute_checksum_for_string(GLib.ChecksumType.MD5, url, -1);
      const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), "mpris-covers"]);
      GLib.mkdir_with_parents(cacheDir, 0o755);
      const cachePath = GLib.build_filenamev([cacheDir, hash]);
      const cacheFile = Gio.File.new_for_path(cachePath);

      if (cacheFile.query_exists(null)) {
        const coverStyle = `
          border-radius: 16px;
          background-image: url('file://${cachePath}');
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          min-height: 300px;
        `;
        this._coverImage.style = coverStyle;
        this._coverCache.set(url, coverStyle);
        return;
      }

      this.setDefaultCover();

      const source = Gio.File.new_for_uri(url);
      source.copy_async(
        cacheFile,
        Gio.FileCopyFlags.OVERWRITE,
        GLib.PRIORITY_LOW,
        null,
        null,
        (src, res) => {
          try {
            src.copy_finish(res);
            const coverStyle = `
              border-radius: 16px;
              background-image: url('file://${cachePath}');
              background-size: contain;
              background-position: center;
              background-repeat: no-repeat;
              min-height: 300px;
            `;
            this._coverImage.style = coverStyle;
            this._coverCache.set(url, coverStyle);
          } catch (e) {}
        }
      );
    }

    setDefaultCover() {
      this._currentArtUrl = null;
      const defaultStyle = `
        border-radius: 16px;
        background-size: contain;
        background-position: center;
        background-repeat: no-repeat;
        min-height: 300px;
      `;
      this._coverImage.style = defaultStyle;
      
      const gicon = Gio.icon_new_for_string("audio-x-generic-symbolic");
      this._coverImage.gicon = gicon;
    }

    destroy() {
      this._coverCache.clear();
      this._currentArtUrl = null;
      super.destroy();
    }
  }
);