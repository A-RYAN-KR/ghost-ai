'use strict';

// Re-export for programmatic usage
module.exports = {
  startWatcher: require('./watcher').startWatcher,
  injectFile: require('./injector').injectFile,
  parseGenMarkers: require('./parser').parseGenMarkers,
  generateCode: require('./ai').generateCode,
  fixImports: require('./import-fixer').fixImports,
};
