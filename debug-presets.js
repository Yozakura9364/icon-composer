const https = require('https');
function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(d));
    }).on('error', reject);
  });
}
function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const lastQuote = line.lastIndexOf('"');
    const lastComma = line.lastIndexOf(',');
    let cols;
    if (lastQuote > lastComma) {
      const before = line.slice(0, lastComma).split(',');
      const name = line.slice(lastQuote + 1, -1);
      cols = [...before, name];
    } else {
      cols = line.split(',');
    }
    rows.push(cols);
  }
  return rows;
}
(async() => {
  const bgRaw = await fetch('https://cdn.jsdelivr.net/gh/InfSein/ffxiv-datamining-mixed@master/chs/BannerBg.csv');
  const presetRaw = await fetch('https://cdn.jsdelivr.net/gh/InfSein/ffxiv-datamining-mixed@master/chs/BannerDesignPreset.csv');

  const bgMap = {};
  for (const row of parseCsv(bgRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[1]);
    if (key > 0 && imgId > 0) bgMap[key] = imgId;
  }
  console.log('bgMap sample:', JSON.stringify(Object.entries(bgMap).slice(0,3)));

  const presets = [];
  for (const row of parseCsv(presetRaw)) {
    if (!row[5]) { console.log('row[5] undefined:', JSON.stringify(row)); continue; }
    const name = (row[5] || '').replace(/^"|"$/g, '').trim();
    const bgIdx = parseInt(row[1]);
    const bgId = bgMap[bgIdx] || 0;
    if (!name || name === '自定义' || name === '') continue;
    presets.push({ name, bgIdx, bgId });
    if (presets.length <= 3) console.log('preset:', name, 'bgIdx=', bgIdx, 'bgId=', bgId);
  }
  console.log('Total:', presets.length);
})();
