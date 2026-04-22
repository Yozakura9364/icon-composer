#!/usr/bin/env node

const mod = require('./src/server/lib/csv-whitelist');

module.exports = mod;

if (require.main === module) {
  const args = process.argv.slice(2);
  const forceNet = args.includes('--network');
  mod
    .loadCsvIconIdSet({
      forceNetwork: forceNet,
      writeCache: true,
      persistVendorToJson: !forceNet,
    })
    .then(set => {
      if (!set || set.size === 0) {
        console.error(
          'No icon ids loaded. Check vendor/ffxiv-datamining-chs or run with network.'
        );
        process.exit(1);
      }
      console.log('csv-valid-icon-ids.json updated, total ids: %d', set.size);
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
