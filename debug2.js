const https = require('https');
https.get('https://cdn.jsdelivr.net/gh/InfSein/ffxiv-datamining-mixed@master/chs/BannerDesignPreset.csv', res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const lines = d.trim().split(/\r?\n/);
    const line3 = lines[3];
    console.log('Line 3:', line3);
    console.log('Line 3 JSON:', JSON.stringify(line3));
    const parts = line3.split(',');
    console.log('Parts:', parts);
    console.log('Parts len:', parts.length);
    const lq = line3.lastIndexOf('"');
    const lc = line3.lastIndexOf(',');
    console.log('lastQuote:', lq, 'lastComma:', lc);
    console.log('slice result:', JSON.stringify(line3.slice(lq + 1, -1)));
  });
});
