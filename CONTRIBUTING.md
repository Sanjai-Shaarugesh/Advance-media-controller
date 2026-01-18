# 🤝 Contributing to Advanced Media Controller

Thanks for wanting to help make this extension better! 🎉

![Welcome](icons/media-logo.png)

---

## 🚀 Quick Start

### For Bug Reports 🐛

Found a bug? Here's what we need:

1. **What happened** vs **what you expected**
2. **Steps to reproduce** the issue
3. **Your system info**: GNOME version, media player you're using
4. **Logs** (if possible): 
   ```bash
   journalctl -f -o cat /usr/bin/gnome-shell | grep "Media Controls"
   ```

**Example:**
```
Bug: Extension crashes when I switch from Spotify to Firefox

Steps:
1. Play music on Gapless
2. Open YouTube in Firefox
3. Extension disappears

Expected: Should show both players

System: GNOME 49, Gapless Flatpak app 
```

### For Feature Ideas 💡

Got a cool idea? Tell us:

1. **What problem** would this solve?
2. **How it should work**
3. **Why it's useful** to others

**Example:**
```
Feature: Volume slider in the popup

Why: I want to adjust volume without opening the media player

How: Add a slider below the seek bar (like GNOME's volume control)
```

---

## 💻 Code Contributions

### First Time?

1. **Fork** this repo on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/Sanjai-Shaarugesh/Advance-media-controller.git
   ```
3. **Install** for testing:
   ```bash
   cd advanced-media-controller
   ln -s $(pwd) ~/.local/share/gnome-shell/extensions/mediacontrols@cliffniff.github.com
   glib-compile-schemas schemas/
   gnome-extensions enable mediacontrols@cliffniff.github.com
   ```
4. **Restart GNOME** (Alt+F2, type `r`) / **Wayland** (logout and login again) / 
    - bash 
    ```
    dbus-run-session gnome-shell --devkit --wayland
```

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b fix/my-bug-fix
   # or
   git checkout -b feature/my-cool-feature
   ```

2. **Make your changes**

3. **Test everything**:
   - ✅ Does it still work with Gapless?
   - ✅ Does it work with multiple players?
   - ✅ No errors in logs?

4. **Commit**:
   ```bash
   git add .
   git commit -m "Fix: Crash when switching players"
   ```

5. **Push**:
   ```bash
   git push origin fix/my-bug-fix
   ```

6. **Open a Pull Request** on GitHub

---

## 🎨 Important Code Rules

### ⚠️ CRITICAL: Prevent System Logout

**Always clean up D-Bus proxies properly:**

```javascript
// ✅ GOOD
class PlayerProxy {
    constructor() {
        this.isDestroyed = false;
    }

    onDestroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        
        // Disconnect signals
        if (this.signalId) {
            this.proxy.disconnectSignal(this.signalId);
        }
        
        // Dispose proxy
        if (this.proxy) {
            this.proxy.run_dispose();
        }
    }
}

// ❌ BAD: Missing cleanup = SYSTEM LOGOUT!
```

### 🚫 Never Use Browser Storage

```javascript
// ❌ NEVER DO THIS
localStorage.setItem('key', 'value');  // Causes extension to fail!

// ✅ DO THIS INSTEAD
const settings = this.getSettings();
settings.set_string('key', 'value');
```

### ✅ Always Check Destroyed State

```javascript
// ✅ GOOD
if (this.isDestroyed) return;
doSomething();

// ❌ BAD: Operating on destroyed objects
doSomething();  // Can crash!
```

---

## 📁 Project Structure

```
advanced-media-controller/
├── extension.js          # Main extension code
├── prefs.js             # Settings window
├── utils/
│   ├── indicator.js        # panel indicator code
│   └── mpris.js    # D-Bus helpers
│   └── ui.js 
├── schemas/             # Settings definitions
    └── org.gnome.shell.extensions.advanced-media-controller.gschema.xml            # GTK interface files
├── stylesheet.css
```

**Files you'll likely edit:**
- `extension.js` - Adding features
- `prefs.js` - Adding settings
- `utils.js/ui` - UI changes
- `schemas/org.gnome.shell.extensions.advanced-media-controller.gschema.xml` - New settings

---

## 🧪 Testing Checklist

Before submitting, test these:

- [ ] ✅ Works with Gapless (native AND Flatpak)
- [ ] ✅ Works with Firefox/Chrome
- [ ] ✅ Multiple players at once
- [ ] ✅ Enable/disable extension
- [ ] ✅ All settings work
- [ ] ✅ No errors in logs

**View logs:**
```bash
journalctl -f -o cat /usr/bin/gnome-shell
```

---

## 🎯 Common Tasks

### Adding a New Setting

1. **Add to schema** (`schemas/*.gschema.xml`):
```xml
<key name="my-setting" type="b">
    <default>true</default>
    <summary>My Cool Setting</summary>
</key>
```

2. **Compile**:
```bash
glib-compile-schemas schemas/
```

3. **Add UI** in `prefs.js`:
```javascript
this.bindSetting("my-setting", "sr-my-setting", "active");
```

4. **Use in extension.js**:
```javascript
this.mySetting = this.settings.get_boolean("my-setting");
```

### Debugging

**Use Looking Glass** (Alt+F2, type `lg`):
```javascript
// Access extension
let ext = imports.ui.main.extensionManager.lookup('mediacontrols@cliffniff.github.com');

// Check current state
ext.extension.playerProxies.size;

// Test something
ext.extension.setActivePlayer();
```

---

## 📝 Pull Request Tips

**Good PR title:**
- ✅ `Fix: Extension crashes with Spotify Flatpak`
- ✅ `Feature: Add volume control slider`
- ❌ `Updated files`

**Good PR description:**
```markdown
## What This Fixes
Extension was crashing when using Spotify Flatpak due to improper 
D-Bus proxy cleanup.

## Changes Made
- Added isDestroyed flag to PlayerProxy
- Properly disconnect signals before destroying
- Call run_dispose() on all proxies

## Testing Done
- ✅ Tested with Spotify Flatpak
- ✅ Tested lock/unlock
- ✅ Tested with multiple players
- ✅ No errors in logs

Fixes #123
```

---

## 🌍 Translations

Help translate to your language:

1. Copy `po/template.pot` to `po/YOUR_LANG.po`
2. Translate strings
3. Test by changing your system language
4. Submit PR

---

## ❓ Need Help?

- 💬 Ask in [GitHub Discussions](https://github.com/Sanjai-Shaarugesh/Advance-media-controller/discussions)
- 🐛 Check existing [Issues](https://github.com/Sanjai-Shaarugesh/Advance-media-controller/issues)
- 📧 Email: your.email@example.com

---

## 🎉 Thank You!

Every contribution makes this extension better for everyone!

**Your code** → **Helps thousands of GNOME users** → **You're awesome!** 🌟

---

## 📜 Code of Conduct

Simple rules:
- 🤝 Be respectful
- 💙 Be welcoming to newcomers  
- 🎯 Stay on topic
- ✨ Have fun!

---

<div align="center">

**Ready to contribute? Let's do this! 🚀**

[Report Bug](https://github.com/Sanjai-Shaarugesh/Advance-media-controller/issues) · 
[Suggest Feature](https://github.com/Sanjai-Shaarugesh/Advance-media-controller/issues) · 
[Ask Question](https://github.com/Sanjai-Shaarugesh/Advance-media-controller/discussions)

</div>