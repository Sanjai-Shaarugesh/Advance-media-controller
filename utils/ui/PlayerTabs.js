import St from "gi://St";
import GObject from "gi://GObject";

export const PlayerTabs = GObject.registerClass(
  {
    Signals: {
      "player-changed": { param_types: [GObject.TYPE_STRING] },
    },
  },
  class PlayerTabs extends St.BoxLayout {
    _init() {
      super._init({
        style: "spacing: 8px;",
      });
    }

    updateTabs(players, currentPlayer, manager) {
      this.destroy_all_children();

      players.forEach((name) => {
        const appInfo = manager.getAppInfo(name);
        const tab = this._createTab(appInfo, name, currentPlayer);
        this.add_child(tab);
      });
    }

    _createTab(appInfo, playerName, currentPlayer) {
      const isActive = playerName === currentPlayer;

      const button = new St.Button({
        style_class: "media-tab-modern",
        style: isActive
          ? `padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.2); box-shadow: 0 2px 8px rgba(0,0,0,0.2);`
          : `padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); opacity: 0.6;`,
      });

      let icon;
      if (appInfo && appInfo.get_icon()) {
        icon = new St.Icon({
          gicon: appInfo.get_icon(),
          icon_size: 20,
        });
      } else {
        icon = new St.Icon({
          icon_name: "audio-x-generic-symbolic",
          icon_size: 20,
        });
      }

      button.set_child(icon);

      button.connect("clicked", () => {
        this.emit("player-changed", playerName);
      });

      button.connect("enter-event", () => {
        if (!isActive) {
          button.style = `padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.15); opacity: 1;`;
        }
      });

      button.connect("leave-event", () => {
        if (!isActive) {
          button.style = `padding: 10px 14px; border-radius: 12px; background: rgba(255,255,255,0.05); opacity: 0.6;`;
        }
      });

      return button;
    }
  },
);
