import St from "gi://St";
import GObject from "gi://GObject";
import Clutter from "gi://Clutter";

export const ControlButtons = GObject.registerClass(
  {
    Signals: {
      "play-pause": {},
      next: {},
      previous: {},
      shuffle: {},
      repeat: {},
    },
  },
  class ControlButtons extends St.BoxLayout {
    _init() {
      super._init({
        style: "spacing: 16px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._buildUI();
    }

    _buildUI() {
      this._shuffleBtn = this._createModernButton(
        "media-playlist-shuffle-symbolic",
        18,
      );
      this._shuffleBtn.connect("clicked", () => this.emit("shuffle"));

      this._prevBtn = this._createModernButton(
        "media-skip-backward-symbolic",
        20,
      );
      this._prevBtn.connect("clicked", () => this.emit("previous"));

      this._playBtn = this._createPlayButton(
        "media-playback-start-symbolic",
        26,
      );
      this._playBtn.connect("clicked", () => this.emit("play-pause"));

      this._nextBtn = this._createModernButton(
        "media-skip-forward-symbolic",
        20,
      );
      this._nextBtn.connect("clicked", () => this.emit("next"));

      this._repeatBtn = this._createModernButton(
        "media-playlist-repeat-symbolic",
        18,
      );
      this._repeatBtn.connect("clicked", () => this.emit("repeat"));

      this.add_child(this._shuffleBtn);
      this.add_child(this._prevBtn);
      this.add_child(this._playBtn);
      this.add_child(this._nextBtn);
      this.add_child(this._repeatBtn);
    }

    _createModernButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-button-modern",
        style: `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
          transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
        `,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
          style: "color: rgba(255,255,255,0.9);",
        }),
      });

      button.connect("enter-event", () => {
        button.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.15);
          transform: scale(1.05);
        `;
      });

      button.connect("leave-event", () => {
        button.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
        `;
      });

      return button;
    }

    _createPlayButton(iconName, size) {
      const button = new St.Button({
        style_class: "media-play-button-modern",
        style: `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        `,
        child: new St.Icon({
          icon_name: iconName,
          icon_size: size,
          style: "color: #ffffff;",
        }),
      });

      button.connect("enter-event", () => {
        button.style = `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.15) 100%);
          box-shadow: 0 6px 20px rgba(0,0,0,0.4);
          transform: scale(1.08);
        `;
      });

      button.connect("leave-event", () => {
        button.style = `
          padding: 16px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%);
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        `;
      });

      return button;
    }

    updateButtons(info) {
      const playIcon =
        info.status === "Playing"
          ? "media-playback-pause-symbolic"
          : "media-playback-start-symbolic";
      this._playBtn.child.icon_name = playIcon;

      if (info.shuffle) {
        this._shuffleBtn.add_style_class_name("active");
        this._shuffleBtn.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(29, 185, 84, 0.2);
        `;
        this._shuffleBtn.child.style = "color: #1db954;";
      } else {
        this._shuffleBtn.remove_style_class_name("active");
        this._shuffleBtn.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
        `;
        this._shuffleBtn.child.style = "color: rgba(255,255,255,0.9);";
      }

      if (info.loopStatus === "Track") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-song-symbolic";
        this._repeatBtn.add_style_class_name("active");
        this._repeatBtn.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(29, 185, 84, 0.2);
        `;
        this._repeatBtn.child.style = "color: #1db954;";
      } else if (info.loopStatus === "Playlist") {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.add_style_class_name("active");
        this._repeatBtn.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(29, 185, 84, 0.2);
        `;
        this._repeatBtn.child.style = "color: #1db954;";
      } else {
        this._repeatBtn.child.icon_name = "media-playlist-repeat-symbolic";
        this._repeatBtn.remove_style_class_name("active");
        this._repeatBtn.style = `
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,255,255,0.08);
        `;
        this._repeatBtn.child.style = "color: rgba(255,255,255,0.9);";
      }
    }
  },
);
