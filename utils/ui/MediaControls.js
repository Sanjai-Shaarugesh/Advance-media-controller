import St from "gi://St";
import GObject from "gi://GObject";
import GLib from "gi://GLib";
import Clutter from "gi://Clutter";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";
import { ControlButtons } from "./ControlButtons.js";
import { AlbumArt } from "./AlbumArt.js";
import { ProgressSlider } from "./ProgressSlider.js";
import { PlayerTabs } from "./PlayerTabs.js";

export const MediaControls = GObject.registerClass(
  {
    Signals: {
      "play-pause": {},
      "next": {},
      "previous": {},
      "shuffle": {},
      "repeat": {},
      "seek": { param_types: [GObject.TYPE_DOUBLE] },
      "player-changed": { param_types: [GObject.TYPE_STRING] },
    },
  },
  class MediaControls extends St.BoxLayout {
    _init() {
      super._init({
        vertical: true,
        style_class: "media-controls-modern",
      });

      this._currentPlayerName = null;
      this._playerStates = new Map(); // Store complete state per player
      
      this._buildUI();
    }

    _buildUI() {
      // Player tabs
      const headerBox = new St.BoxLayout({
        style: "margin-bottom: 20px; spacing: 8px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._playerTabs = new PlayerTabs();
      this._playerTabs.connect("player-changed", (_, name) => {
        this._switchToPlayer(name);
      });
      headerBox.add_child(this._playerTabs);
      this.add_child(headerBox);

      // Album art
      this._albumArt = new AlbumArt();
      this.add_child(this._albumArt);

      // Track info
      const infoBox = new St.BoxLayout({
        vertical: true,
        style: "spacing: 6px; margin-bottom: 24px;",
        x_align: Clutter.ActorAlign.CENTER,
      });

      this._titleLabel = new St.Label({
        text: "No media playing",
        style: "font-weight: 700; font-size: 16px; color: rgba(255,255,255,0.95);",
      });
      this._titleLabel.clutter_text.ellipsize = 3;
      infoBox.add_child(this._titleLabel);

      this._artistLabel = new St.Label({
        text: "",
        style: "font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.6);",
      });
      this._artistLabel.clutter_text.ellipsize = 3;
      infoBox.add_child(this._artistLabel);
      this.add_child(infoBox);

      // Progress slider
      this._progressSlider = new ProgressSlider();
      this._progressSlider.connect("seek", (_, position) => this.emit("seek", position));
      this._progressSlider.connect("drag-begin", () => {
        this._saveCurrentPlayerState();
        this.stopPositionUpdate();
      });
      this._progressSlider.connect("drag-end", () => {
        this._saveCurrentPlayerState();
      });
      this.add_child(this._progressSlider);

      // Control buttons
      this._controlButtons = new ControlButtons();
      this._controlButtons.connect("play-pause", () => this.emit("play-pause"));
      this._controlButtons.connect("next", () => this.emit("next"));
      this._controlButtons.connect("previous", () => this.emit("previous"));
      this._controlButtons.connect("shuffle", () => this.emit("shuffle"));
      this._controlButtons.connect("repeat", () => this.emit("repeat"));
      this.add_child(this._controlButtons);
    }

    _switchToPlayer(playerName) {
      if (playerName === this._currentPlayerName) return;
      
      // Save current player state before switching
      this._saveCurrentPlayerState();
      
      // Switch to new player
      this._currentPlayerName = playerName;
      this.emit("player-changed", playerName);
      
      // Restore new player state
      this._restorePlayerState(playerName);
    }

    _saveCurrentPlayerState() {
      if (!this._currentPlayerName) return;
      
      const state = {
        position: this._progressSlider.currentPosition,
        length: this._progressSlider.trackLength,
        sliderValue: this._progressSlider.sliderValue,
        isPlaying: this._progressSlider.isPlaying,
        lastUpdateTime: this._progressSlider.lastUpdateTime,
        artUrl: this._playerStates.get(this._currentPlayerName)?.artUrl || null,
        title: this._titleLabel.text,
        artist: this._artistLabel.text,
      };
      
      this._playerStates.set(this._currentPlayerName, state);
    }

    _restorePlayerState(playerName) {
      const savedState = this._playerStates.get(playerName);
      
      if (savedState) {
        // Restore slider position
        this._progressSlider.restoreState(
          savedState.position,
          savedState.length,
          savedState.sliderValue,
          savedState.isPlaying,
          savedState.lastUpdateTime
        );
        
        // Restore album art
        if (savedState.artUrl) {
          this._albumArt.loadCover(savedState.artUrl, false);
        } else {
          this._albumArt.setDefaultCover();
        }
        
        // Restore labels
        this._titleLabel.text = savedState.title || "Unknown";
        if (savedState.artist) {
          this._artistLabel.text = savedState.artist;
          this._artistLabel.show();
        } else {
          this._artistLabel.hide();
        }
      }
    }

    update(info, playerName, manager) {
      if (!info) return;

      const isPlayerSwitch = this._currentPlayerName !== playerName;
      
      // If this update is for the current player, save state first
      if (this._currentPlayerName === playerName) {
        this._saveCurrentPlayerState();
      }
      
      this._currentPlayerName = playerName;

      // Update stored state for this player
      const currentState = this._playerStates.get(playerName) || {};
      
      // Only update UI if this is the currently active player
      if (this._currentPlayerName === playerName) {
        // Update album art only if changed
        if (info.artUrl !== currentState.artUrl) {
          if (info.artUrl) {
            this._albumArt.loadCover(info.artUrl, isPlayerSwitch);
          } else {
            this._albumArt.setDefaultCover();
          }
        }

        // Update track info
        this._titleLabel.text = info.title || "Unknown";
        
        if (info.artists && info.artists.length > 0) {
          this._artistLabel.text = info.artists.join(", ");
          this._artistLabel.show();
        } else {
          this._artistLabel.hide();
        }

        // Update buttons
        this._controlButtons.updateButtons(info);
        
        // Update slider - only if not currently dragging
        if (!this._progressSlider.isDragging) {
          this._progressSlider.updateFromExternalSource(
            info.position || 0,
            info.length || 0,
            info.status === "Playing",
            isPlayerSwitch
          );
        }
      }

      // Always update the stored state for this player
      this._playerStates.set(playerName, {
        position: info.position || 0,
        length: info.length || 0,
        sliderValue: (info.position || 0) / (info.length || 1),
        isPlaying: info.status === "Playing",
        lastUpdateTime: GLib.get_monotonic_time(),
        artUrl: info.artUrl,
        title: info.title,
        artist: info.artists ? info.artists.join(", ") : "",
      });
    }

    updateTabs(players, currentPlayer, manager) {
      this._playerTabs.updateTabs(players, currentPlayer, manager);
    }

    startPositionUpdate() {
      if (this._currentPlayerName) {
        this._progressSlider.startPositionUpdate();
      }
    }

    stopPositionUpdate() {
      this._progressSlider.stopPositionUpdate();
    }

    onSeeked(position) {
      // Only update if this seek is for the current player
      this._progressSlider.onSeeked(position);
      
      // Update stored state
      if (this._currentPlayerName) {
        const state = this._playerStates.get(this._currentPlayerName);
        if (state) {
          state.position = position;
          state.lastUpdateTime = GLib.get_monotonic_time();
          state.sliderValue = position / state.length;
        }
      }
    }

    destroy() {
      this.stopPositionUpdate();
      
      this._playerStates.clear();
      
      if (this._albumArt) {
        this._albumArt.destroy();
      }
      
      super.destroy();
    }
  }
);