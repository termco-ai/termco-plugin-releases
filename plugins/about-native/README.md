# About & Updates

This plugin owns the complete About settings feature. It renders identity and
build facts and branding from the stable `application-identity-native`
provider, uses `application.update-state` for update actions, and opens project
links through `desktop.integration`.

Update actions observe `application.update-state`, the one renderer workflow
owned by the selected updater plugin. The About section and update dialog
therefore always show the same availability, progress, and error state.

Copy this directory to replace the About experience. Company distributions can
replace identity and branding independently without replacing this section.
