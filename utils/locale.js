/**
 * Initializes Gettext to load translations from the extension's locale directory
 * and binds convenience functions to the extension object.
 */
export function initTranslations(extension) {
  const localeDir = extension.dir.get_child('locale');

  if (localeDir.query_exists(null)) {
    const localeDirPath = localeDir.get_path();
    imports.gettext.bindtextdomain('advanced-media-controller', localeDirPath);
  }
}

/**
 * Returns the gettext function for translating strings.
 * This should be called after initTranslations.
 */
export function gettext(str) {
  return imports.gettext.dgettext('advanced-media-controller', str);
}

/**
 * Returns the ngettext function for translating plural strings.
 * This should be called after initTranslations.
 */
export function ngettext(singular, plural, n) {
  return imports.gettext.dngettext('advanced-media-controller', singular, plural, n);
}