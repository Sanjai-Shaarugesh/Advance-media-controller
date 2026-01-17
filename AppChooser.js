import Adw from "gi://Adw";
import Gio from "gi://Gio";
import GObject from "gi://GObject";
import Gtk from "gi://Gtk";

/**
 * Dialog for selecting which media players to show in the extension
 */
class AppChooser extends Adw.Window {
    /**
     * @private
     * @type {Gtk.ListBox}
     */
    listBox;
    
    /**
     * @private
     * @type {Gtk.Button}
     */
    selectBtn;
    
    /**
     * @private
     * @type {Gtk.Button}
     */
    cancelBtn;
    
    /**
     * @private
     * @type {Gtk.SearchEntry}
     */
    searchEntry;
    
    /**
     * @private
     * @type {Set<string>}
     */
    selectedApps;

    /**
     * @param {Object} params
     * @param {string[]} params.enabledPlayers - Currently enabled player app IDs
     */
    constructor(params = {}) {
        super({
            title: "Select Media Players",
            modal: true,
            defaultWidth: 600,
            defaultHeight: 700,
        });

        this.selectedApps = new Set(params.enabledPlayers || []);

        // Main container
        const toolbarView = new Adw.ToolbarView();
        this.set_content(toolbarView);

        // Header bar
        const headerBar = new Adw.HeaderBar();
        toolbarView.add_top_bar(headerBar);

        // Search entry in header
        this.searchEntry = new Gtk.SearchEntry({
            placeholderText: "Search applications...",
            hexpand: true,
        });
        headerBar.set_title_widget(this.searchEntry);

        // Main content box
        const contentBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 0,
        });
        toolbarView.set_content(contentBox);

        // Info banner
        const banner = new Adw.Banner({
            title: "Select which media players to show in the panel",
            revealed: true,
        });
        contentBox.append(banner);

        // Scrolled window for list
        const scrolled = new Gtk.ScrolledWindow({
            vexpand: true,
            hexpand: true,
        });
        contentBox.append(scrolled);

        // List box with selection mode
        this.listBox = new Gtk.ListBox({
            selectionMode: Gtk.SelectionMode.NONE,
        });
        this.listBox.add_css_class("boxed-list");
        scrolled.set_child(this.listBox);

        // Bottom action bar
        const actionBar = new Gtk.ActionBar();
        contentBox.append(actionBar);

        // Cancel button
        this.cancelBtn = new Gtk.Button({
            label: "Cancel",
        });
        actionBar.pack_start(this.cancelBtn);

        // Select All / Deselect All buttons
        const selectAllBtn = new Gtk.Button({
            label: "Select All",
        });
        selectAllBtn.connect("clicked", () => {
            this._selectAll(true);
        });
        actionBar.pack_start(selectAllBtn);

        const deselectAllBtn = new Gtk.Button({
            label: "Deselect All",
        });
        deselectAllBtn.connect("clicked", () => {
            this._selectAll(false);
        });
        actionBar.pack_start(deselectAllBtn);

        // Save button
        this.selectBtn = new Gtk.Button({
            label: "Save Selection",
        });
        this.selectBtn.add_css_class("suggested-action");
        actionBar.pack_end(this.selectBtn);

        // Populate with all applications
        this._populateApps();

        // Connect search
        this.searchEntry.connect("search-changed", () => {
            this.listBox.invalidate_filter();
        });

        this.listBox.set_filter_func((row) => {
            const searchText = this.searchEntry.get_text().toLowerCase();
            if (!searchText) return true;
            
            const appRow = /** @type {Adw.ActionRow} */ (row.get_child());
            const title = appRow.title.toLowerCase();
            const subtitle = appRow.subtitle?.toLowerCase() || "";
            
            return title.includes(searchText) || subtitle.includes(searchText);
        });

        this.cancelBtn.connect("clicked", () => {
            this.close();
        });
    }

    /**
     * @private
     */
    _populateApps() {
        const apps = Gio.AppInfo.get_all()
            .filter((app) => app.should_show())
            .sort((a, b) => {
                const nameA = a.get_display_name().toLowerCase();
                const nameB = b.get_display_name().toLowerCase();
                return nameA.localeCompare(nameB);
            });

        if (apps.length === 0) {
            const emptyRow = new Adw.ActionRow({
                title: "No applications found",
                subtitle: "Install applications to use this feature",
            });
            const icon = new Gtk.Image({
                iconName: "application-x-executable-symbolic",
                pixelSize: 32,
            });
            emptyRow.add_prefix(icon);
            this.listBox.append(emptyRow);
            return;
        }

        for (const app of apps) {
            const appId = app.get_id();
            const isEnabled = this.selectedApps.size === 0 || this.selectedApps.has(appId);

            const row = new Adw.ActionRow({
                title: app.get_display_name(),
                subtitle: appId,
                subtitleLines: 1,
                activatable: true,
            });

            // Get app icon using GIcon
            const icon = new Gtk.Image({
                gicon: app.get_icon(),
                pixelSize: 32,
            });
            row.add_prefix(icon);

            // Add checkmark
            const checkBtn = new Gtk.CheckButton({
                active: isEnabled,
                valign: Gtk.Align.CENTER,
            });

            checkBtn.connect("toggled", () => {
                if (checkBtn.active) {
                    this.selectedApps.add(appId);
                } else {
                    this.selectedApps.delete(appId);
                }
            });

            row.add_suffix(checkBtn);
            row.set_activatable_widget(checkBtn);

            this.listBox.append(row);
        }
    }

    /**
     * @private
     * @param {boolean} selectAll
     */
    _selectAll(selectAll) {
        let child = this.listBox.get_first_child();
        while (child) {
            const actionRow = /** @type {Adw.ActionRow} */ (child.get_child());
            if (actionRow) {
                const checkBtn = /** @type {Gtk.CheckButton} */ (
                    actionRow.get_last_child()?.get_prev_sibling()
                );
                if (checkBtn instanceof Gtk.CheckButton) {
                    checkBtn.active = selectAll;
                }
            }
            child = child.get_next_sibling();
        }
    }

    /**
     * @public
     * @returns {Promise<string[]>}
     */
    showChooser() {
        return new Promise((resolve) => {
            const signalId = this.selectBtn.connect("clicked", () => {
                this.close();
                this.selectBtn.disconnect(signalId);
                resolve(Array.from(this.selectedApps));
            });
            
            const cancelId = this.connect("close-request", () => {
                this.disconnect(cancelId);
                // Return current selection on cancel too
                resolve(Array.from(this.selectedApps));
            });

            this.present();
        });
    }
}

const GAppChooser = GObject.registerClass(
    {
        GTypeName: "MediaControlsAppChooser",
    },
    AppChooser
);

export default GAppChooser;