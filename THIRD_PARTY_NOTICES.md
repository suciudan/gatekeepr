# Third-party notices

The root [MIT license](LICENSE) covers the Gatekeepr source code and documentation in this monorepo. It does not replace the licenses of dependencies, external datasets, or third-party brands.

## Dependencies and framework code

JavaScript dependencies are resolved in `yarn.lock`; PHP dependencies are declared in `packages/laravel/composer.json`. Their copyright and license notices remain with the upstream packages. Preserve those notices when distributing installed dependencies or built applications.

The dashboard uses [Payload](https://github.com/payloadcms/payload/blob/main/LICENSE.md) and [Next.js](https://github.com/vercel/next.js/blob/canary/license.md). MIT notices for template-derived code and contributor guidance are retained in [licenses/payload-MIT.txt](licenses/payload-MIT.txt) and [licenses/nextjs-MIT.txt](licenses/nextjs-MIT.txt). Framework dependencies are installed separately, rather than vendored in the source release.

[Retype](https://retype.com/license/) is a separately licensed documentation build tool. Its generated runtime assets are not relicensed under Gatekeepr's MIT license; generated `.retype` output is excluded from this repository. Check its terms before distributing a compiled documentation site.

## External intelligence

The refresh jobs download third-party email, network, and browser data. See [Data Sources](docs/DataSources.md) for upstream links and known restrictions. The monorepo source release does not include production databases, downloaded feed snapshots, or the generated merged datasets. Permission to use or redistribute a feed must be established separately; a public download URL is not a license grant.

## Media and branding

The local dashboard upload directory is excluded. Do not add customer uploads, scraped article images, photographs, or content from another project without documenting permission and attribution. Third-party names and logos used to identify integrations remain the property of their owners; the source license does not imply endorsement.
