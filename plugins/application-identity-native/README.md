# Application Identity

This low-dependency provider owns `application.info` in the main process and
projects it to the renderer alongside stable `application.branding`. About,
Settings, diagnostics, and updater surfaces consume the identity; none owns it.

Company distributions can replace this plugin to change the product name,
build identity, or logo without replacing About or desktop integration.
