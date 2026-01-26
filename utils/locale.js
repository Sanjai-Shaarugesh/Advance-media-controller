export function initTranslations(extension) {
  const localeDir = extension.dir.get_child('locale');
  if (localeDir.query_exists(null)) {
    imports.gettext.bindtextdomain('advanced-media-controller', localeDir.get_path());
  }
}

export function gettext(str) {
  return imports.gettext.dgettext('advanced-media-controller', str);
}

export function ngettext(singular, plural, n) {
  return imports.gettext.dngettext('advanced-media-controller', singular, plural, n);
}