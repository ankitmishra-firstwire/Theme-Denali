# Shopify Skeleton Theme (standard Liquid-compatible edition)

This edition adapts the original Shopify Skeleton Theme to standard Shopify theme syntax so it can be developed locally with Shopify CLI and uploaded to a regular Shopify store. It uses Liquid templates, snippets, section groups for the global header/footer, and standard Liquid tags. Experimental `{% block %}` and `{% partial %}` tags have been removed.

## Requirements
- Latest Shopify CLI
- A Shopify development store for previewing and testing

## Local development
Run from the theme root:

```bash
shopify theme check
shopify theme dev
```

## Notes
- Header and footer are standard sections in `sections/`, configured through section groups.
- Page templates remain `.liquid` templates and use standard Liquid markup.
- The homepage welcome content and Liquid tips are snippets. The tip refresh works client-side and does not require Shopify's experimental partial-rendering feature.
- Review the theme in a development store before publishing, especially menus, product forms, cart flows, translations, and theme editor settings.

This is a compatibility conversion of the minimal Skeleton starter, not a production-ready commercial theme.
