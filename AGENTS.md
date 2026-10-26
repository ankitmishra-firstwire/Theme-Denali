# Development guidance

This repository uses standard Shopify Liquid and theme architecture. Do not use experimental `{% block %}` or `{% partial %}` tags. Use `{% render %}` for snippets and standard sections/section groups for merchant-configurable global areas. Keep CSS and JavaScript in `assets/`. Validate changes with `shopify theme check` and preview with `shopify theme dev`.
