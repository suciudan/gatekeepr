# Node.js and Yarn

Use Node.js 24 LTS for this monorepo. Install a current 24.x release using the [official Node.js downloads](https://nodejs.org/en/download) or your preferred Node version manager. Use the same Node major locally and in CI.

The repository pins Yarn 4.9.2 in `package.json`. From the repository root:

```sh
corepack enable
node --version
yarn --version
yarn install --immutable
```

If your Node distribution does not provide Corepack, install it with `npm install --global corepack`, then run `corepack enable`. See [Yarn's Corepack guide](https://yarnpkg.com/corepack) for installation and troubleshooting. Avoid installing a separate global Yarn version that overrides the repository pin.

On Windows, WSL provides the POSIX shell used by the setup examples and runtime scripts. Install Node/Yarn within WSL when working there. Reinstall dependencies when moving between operating systems; native modules in `node_modules` are platform-specific.
