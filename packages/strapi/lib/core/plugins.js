'use strict';

// Dependencies.
const path = require('path');
const fs = require('fs-extra');
const _ = require('lodash');

module.exports = async function() {
  const folder = ((url = _.get(strapi.config.currentEnvironment.server, 'admin.path', 'admin')) =>
    url[0] === '/' ? url.substring(1) : url)().replace(/\/$/, '');

  const configuratePlugin = (acc, current, source, name) => {
    switch (source) {
      case 'host': {
        const host =
          _.get(this.config.environments[current].server, 'admin.build.host').replace(/\/$/, '') || '/';

        if (!host) {
          throw new Error(`You can't use \`remote\` as a source without set the \`host\` configuration.`);
        }

        const folder = _.get(this.config.environments[current].server, 'admin.build.plugins.folder', null);

        if (_.isString(folder)) {
          const cleanFolder = folder[0] === '/' ? folder.substring(1) : folder;

          return `/${host}/${cleanFolder}/${name}/main.js`.replace('//', '/');
        }

        return `/${host}/${name}/main.js`.replace('//', '/');
      }
      case 'custom':
        if (!_.isEmpty(_.get(this.plugins[name].config, `sources.${current}`, {}))) {
          return (acc[current] = this.plugins[name].config.sources[current]);
        }

        throw new Error(
          `You have to define the source URL for each environment in \`./plugins/**/config/sources.json\``,
        );
      case 'backend': {
        const backend = _.get(
          this.config.environments[current],
          'server.admin.build.backend',
          `http://${this.config.environments[current].server.host}:${
            this.config.environments[current].server.port
          }`,
        ).replace(/\/$/, '');

        return `${backend}/${folder.replace(/\/$/, '')}/${name}/main.js`;
      }
      default:
        return `/${name}/main.js`;
    }
  };

  const sourcePath =
    this.config.environment !== 'test'
      ? path.resolve(this.config.appPath, 'admin', 'admin', 'src', 'config', 'plugins.json')
      : path.resolve(
        this.config.appPath,
        'packages',
        'strapi-admin',
        'admin',
        'src',
        'config',
        'plugins.json',
      );
  const buildPath =
    this.config.environment !== 'test'
      ? path.resolve(this.config.appPath, 'admin', 'admin', 'build', 'config', 'plugins.json')
      : path.resolve(
        this.config.appPath,
        'packages',
        'strapi-admin',
        'admin',
        'build',
        'config',
        'plugins.json',
      );

  const isAdmin = await fs.pathExists(path.resolve(this.config.appPath, 'admin', 'admin'));
  if (!isAdmin) return;

  // arrange system directories
  await Promise.all([
    fs.remove(sourcePath),

    (async () => {
      const existBuildPath = await fs.pathExists(buildPath);
      if (existBuildPath) {
        await fs.remove(buildPath);
      } else {
        await fs.ensureDir(path.resolve(buildPath, '..', '..'));
      }
    })(),

    // Create `./config` folder
    fs.ensureDir(path.resolve(buildPath, '..')),
  ]);

  // Create `plugins.json` file.
  // Don't inject the plugins without an Admin
  const existingPlugins = await Object.keys(this.plugins).filter(plugin =>
    fs.pathExists(path.resolve(this.config.appPath, 'plugins', plugin, 'admin', 'src', 'containers', 'App')),
  );

  const existingPluginsInfo = existingPlugins.map(id => ({
    id,
    source: Object.keys(this.config.environments).reduce((acc, current) => {
      const source = _.get(this.config.environments[current].server, 'admin.build.plugins.source', 'default');

      if (_.isString(source)) {
        acc[current] = configuratePlugin(acc, current, source, id);
      } else if (_.isOject(source)) {
        acc[current] = configuratePlugin(acc, current, source[current], id);
      }

      return acc;
    }, {}),
  }));

  await Promise.all([
    fs.writeJSON(sourcePath, existingPluginsInfo, {
      spaces: 2,
      encoding: 'utf8',
    }),
    fs.writeJSON(buildPath, existingPluginsInfo, {
      spaces: 2,
      encoding: 'utf8',
    }),
  ]);
};
