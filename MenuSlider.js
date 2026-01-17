import Clutter from "gi://Clutter";
import GObject from "gi://GObject";
import St from "gi://St";
import * as Slider from "resource:///org/gnome/shell/ui/slider.js";

/**
 * Format milliseconds to HH:MM:SS or MM:SS
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted time string
 */
function msToTime(ms) {
    if (!ms || isNaN(ms) || ms < 0) return "0:00";
    
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    
    if (hours > 0) {
        return `${hours}:${remainingMins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Professional media slider with smooth animations
 * @extends St.BoxLayout
 */
class MenuSlider extends St.BoxLayout {
    /**
     * @private
     * @type {Clutter.PropertyTransition}
     */
    transition;

    /**
     * @private
     * @type {Slider.Slider}
     */
    slider;
    
    /**
     * @private
     * @type {St.BoxLayout}
     */
    textBox;
    
    /**
     * @private
     * @type {St.Label}
     */
    elapsedLabel;
    
    /**
     * @private
     * @type {St.Label}
     */
    durationLabel;

    /**
     * @private
     * @type {boolean}
     */
    dragPaused;
    
    /**
     * @private
     * @type {boolean}
     */
    disabled;

    /**
     * @private
     * @type {number}
     */
    rate;

    constructor() {
        super({ 
            vertical: true,
            style: "spacing: 10px; margin-bottom: 20px;",
        });
        
        this.rate = 1.0;
        this.dragPaused = false;
        this.disabled = true;
        
        // Create slider container
        const sliderContainer = new St.BoxLayout({
            style: "margin: 0 8px;",
        });
        
        this.slider = new Slider.Slider(0);
        this.slider.accessible_name = "Position";
        
        // Create time labels container
        this.textBox = new St.BoxLayout({
            style: "margin: 0 8px;",
        });
        
        this.elapsedLabel = new St.Label({
            text: "0:00",
            xExpand: true,
            xAlign: Clutter.ActorAlign.START,
            style_class: "media-time-label",
        });
        
        this.durationLabel = new St.Label({
            text: "0:00",
            xExpand: true,
            xAlign: Clutter.ActorAlign.END,
            style_class: "media-time-label-end",
        });

        // Connect slider events
        this.slider.connectObject(
            "drag-begin",
            () => {
                if (this.transition.is_playing() && !this.disabled) {
                    this.transition.pause();
                    this.dragPaused = true;
                }
                return Clutter.EVENT_PROPAGATE;
            },
            "drag-end",
            () => {
                const ms = this.slider.value * this.transition.duration;
                this.emit("seeked", Math.floor(ms * 1000));
                
                if (this.dragPaused && this.get_stage() != null) {
                    this.transition.advance(ms);
                    this.transition.start();
                    this.dragPaused = false;
                }
                return Clutter.EVENT_PROPAGATE;
            },
            "scroll-event",
            () => {
                return Clutter.EVENT_STOP;
            },
            this,
        );

        // Create transition for smooth animation
        const initial = new GObject.Value();
        initial.init(GObject.TYPE_DOUBLE);
        initial.set_double(0);
        
        const final = new GObject.Value();
        final.init(GObject.TYPE_DOUBLE);
        final.set_double(1);
        
        this.transition = new Clutter.PropertyTransition({
            propertyName: "value",
            progressMode: Clutter.AnimationMode.LINEAR,
            repeatCount: 1,
            interval: new Clutter.Interval({
                valueType: GObject.TYPE_DOUBLE,
                initial: initial,
                final: final,
            }),
        });

        this.transition.connectObject(
            "marker-reached",
            (_, name) => {
                this.elapsedLabel.text = name;
            },
            this,
        );

        // Build UI
        this.textBox.add_child(this.elapsedLabel);
        this.textBox.add_child(this.durationLabel);
        
        sliderContainer.add_child(this.slider);
        this.add_child(sliderContainer);
        this.add_child(this.textBox);
        
        // Pause transition before adding to prevent auto-start
        this.transition.pause();
        this.slider.add_transition("progress", this.transition);

        // Setup cleanup
        this.connect("destroy", this._onDestroy.bind(this));
        this.setDisabled(true);
    }

    /**
     * Update slider with new position and length
     * @public
     * @param {number} position - Position in microseconds
     * @param {number} length - Total length in microseconds
     * @param {number} rate - Playback rate (default 1.0)
     * @returns {void}
     */
    updateSlider(position, length, rate) {
        this.rate = rate || 1.0;
        this.setLength(length);
        this.setPosition(position);
    }

    /**
     * Set playback rate
     * @public
     * @param {number} rate - Playback rate
     * @returns {void}
     */
    setRate(rate) {
        const oldRate = this.rate;
        this.rate = rate || 1.0;
        
        const currentTime = this.transition.get_elapsed_time() * oldRate;
        this.setPosition(currentTime * 1000);
        this.setLength(this.transition.duration * oldRate * 1000);
    }

    /**
     * Set current position
     * @public
     * @param {number} position - Position in microseconds
     * @returns {void}
     */
    setPosition(position) {
        const ms = position / 1000;
        this.elapsedLabel.text = msToTime(ms);
        
        if (this.transition.duration > 0) {
            this.slider.value = ms / this.rate / this.transition.duration;
            this.transition.advance(ms / this.rate);
        }
    }

    /**
     * Set total length
     * @public
     * @param {number} length - Length in microseconds
     * @returns {void}
     */
    setLength(length) {
        const ms = length / 1000;
        this.durationLabel.text = msToTime(ms);
        this.slider.value = 0;
        this.transition.set_duration(ms / this.rate);
        this.transition.rewind();
        this._updateMarkers();
    }

    /**
     * Pause the transition animation
     * @public
     * @returns {void}
     */
    pauseTransition() {
        if (!this.disabled) {
            this.transition.pause();
        }
    }

    /**
     * Resume the transition animation
     * @public
     * @returns {void}
     */
    resumeTransition() {
        if (!this.disabled && this.get_stage() != null) {
            this.transition.start();
        }
    }

    /**
     * Enable or disable the slider
     * @public
     * @param {boolean} disabled - Whether to disable the slider
     * @returns {void}
     */
    setDisabled(disabled) {
        this.disabled = disabled;
        this.slider.reactive = !disabled;
        this.opacity = disabled ? 127 : 255;
        
        if (disabled) {
            this.durationLabel.text = "0:00";
            this.elapsedLabel.text = "0:00";
            this.transition.set_duration(1);
            this.transition.stop();
            this.slider.value = 0;
        } else {
            this._updateMarkers();
        }
    }

    /**
     * Update time markers for smooth label updates
     * @private
     * @returns {void}
     */
    _updateMarkers() {
        const durationSecs = Math.floor(this.transition.duration / (1000 / this.rate));
        const markers = this.transition.list_markers(-1);
        
        // Remove old markers
        for (const marker of markers) {
            this.transition.remove_marker(marker);
        }
        
        // Add new markers (one per second)
        for (let i = 0; i <= durationSecs; i++) {
            const ms = i * 1000;
            const timeText = msToTime(ms);
            this.transition.add_marker_at_time(timeText, ms / this.rate);
        }
    }

    /**
     * Cleanup on destroy
     * @private
     * @returns {void}
     */
    _onDestroy() {
        // Disconnect all signals
        if (this.slider && typeof this.slider.disconnectObject === "function") {
            this.slider.disconnectObject(this);
        }

        if (this.transition && typeof this.transition.disconnectObject === "function") {
            this.transition.disconnectObject(this);
        }

        // Clean up resources
        if (this.slider && typeof this.slider.remove_transition === "function") {
            this.slider.remove_transition("progress");
        }
        
        if (this.transition) {
            this.transition.stop();
        }
    }
}

const GMenuSlider = GObject.registerClass(
    {
        GTypeName: "MenuSlider",
        Signals: {
            seeked: {
                param_types: [GObject.TYPE_INT64],
            },
        },
    },
    MenuSlider,
);

export default GMenuSlider;