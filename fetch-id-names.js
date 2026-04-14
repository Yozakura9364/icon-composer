/**
 * 从 GitHub API 爬取 FFXIV 数据挖掘 CSV，构建 ID → 中文名称映射
 *
 * CSV 结构（实际验证）:
 * BannerBg/Frame/Decoration: col[1]=ImageID, col[9]=Name
 * CharaCardBase/Decoration:    col[3]=ImageID, col[12]=Name
 * CharaCardHeader:             col[1]=TopID, col[2]=BotID, col[13]=Name
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'InfSein';
const REPO_NAME = 'ffxiv-datamining-mixed';
const BRANCH = 'master';
const LANG = 'chs';

const CSV_FILES = [
  'BannerBg.csv',
  'BannerFrame.csv',
  'BannerDecoration.csv',
  'CharaCardBase.csv',
  'CharaCardDecoration.csv',
  'CharaCardHeader.csv',
];

const csvCache = {};
const idToName = {};

function parseCsv(raw) {
  if (!raw) return [];
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines.slice(3).filter(l => l.trim().length > 0).map(line => {
    const result = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) {
        result.push(current.trim());
        current = '';
      } else { current += ch; }
    }
    result.push(current.trim());
    return result;
  });
}

function fetchGitHubApi(filePath) {
  return new Promise((resolve, reject) => {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${LANG}/${filePath}?ref=${BRANCH}`;
    https.get(url, { headers: { 'User-Agent': 'node.js' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const j = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        csvCache[filePath] = Buffer.from(j.content, 'base64').toString('utf8');
        resolve();
      });
    }).on('error', reject);
  });
}

function cleanName(s) {
  return (s || '').replace(/^"|"$/g, '').trim();
}

async function main() {
  console.log('爬取 FFXIV CSV...\n');
  for (const file of CSV_FILES) {
    try {
      await fetchGitHubApi(file);
      console.log(`  + ${file}`);
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.error(`  x ${file}: ${e.message}`); }
  }
  console.log('');

  // BannerBg: col[1] = Image ID, col[9] = Name
  const bannerBg = parseCsv(csvCache['BannerBg.csv']);
  for (const row of bannerBg) {
    const imgId = parseInt(row[1], 10);
    const name = cleanName(row[9]);
    if (imgId >= 190002 && imgId <= 190999 && name && name !== '无') idToName[imgId] = name;
  }
  console.log(`  BannerBg: 190002~190999 → ${bannerBg.filter(r => {const n=cleanName(r[9]); return n && n!=='无' && parseInt(r[1])>=190002 && parseInt(r[1])<=190999;}).length} 条`);

  // BannerFrame: col[1] = Image ID, col[9] = Name
  const bannerFrame = parseCsv(csvCache['BannerFrame.csv']);
  for (const row of bannerFrame) {
    const imgId = parseInt(row[1], 10);
    const name = cleanName(row[9]);
    if (imgId >= 191002 && imgId <= 191999 && name && name !== '无') idToName[imgId] = name;
  }
  console.log(`  BannerFrame: 191002~191999 → ${bannerFrame.filter(r => {const n=cleanName(r[9]); return n && n!=='无' && parseInt(r[1])>=191002 && parseInt(r[1])<=191999;}).length} 条`);

  // BannerDecoration: col[1] = Image ID, col[9] = Name
  const bannerDec = parseCsv(csvCache['BannerDecoration.csv']);
  for (const row of bannerDec) {
    const imgId = parseInt(row[1], 10);
    const name = cleanName(row[9]);
    if (imgId >= 192002 && imgId <= 192999 && name && name !== '无') idToName[imgId] = name;
  }
  console.log(`  BannerDecoration: 192002~192999 → ${bannerDec.filter(r => {const n=cleanName(r[9]); return n && n!=='无' && parseInt(r[1])>=192002 && parseInt(r[1])<=192999;}).length} 条`);

  // CharaCardBase: col[1] = Image ID, col[12] = Name
  const charaBase = parseCsv(csvCache['CharaCardBase.csv']);
  for (const row of charaBase) {
    const imgId = parseInt(row[1], 10);
    const name = cleanName(row[12]);
    if (imgId >= 193002 && imgId <= 193999 && name && name !== '无') idToName[imgId] = name;
  }
  console.log(`  CharaCardBase: 193002~193999 → ${charaBase.filter(r => {const n=cleanName(r[12]); return n && n!=='无' && parseInt(r[1])>=193002 && parseInt(r[1])<=193999;}).length} 条`);

  // CharaCardDecoration: col[3] = Image ID, col[11] = Name (col[10]=uint16是SortKey, col[11]=str才是Name)
  const charaDec = parseCsv(csvCache['CharaCardDecoration.csv']);
  const decRanges = [
    [194002, 194999], [195002, 195999], [197002, 197999],
    [198002, 198999], [199002, 199999], [234401, 234499],
  ];
  let decCount = 0;
  for (const row of charaDec) {
    const imgId = parseInt(row[3], 10);
    const name = cleanName(row[11]);
    if (!name || name === '无') continue;
    for (const [mn, mx] of decRanges) {
      if (imgId >= mn && imgId <= mx) { idToName[imgId] = name; decCount++; break; }
    }
  }
  console.log(`  CharaCardDecoration: 194/195/197/198/199/234xxx → ${decCount} 条`);

  // CharaCardHeader: col[1]=TopImage, col[2]=BottomImage, col[13]=Name
  const charaHeader = parseCsv(csvCache['CharaCardHeader.csv']);
  let hCount = 0;
  for (const row of charaHeader) {
    const topId = parseInt(row[1], 10);
    const botId = parseInt(row[2], 10);
    const name = cleanName(row[13]);
    if (!name || name === '无') continue;
    if (topId >= 196002 && topId <= 196249) { idToName[topId] = name; hCount++; }
    if (botId >= 196252 && botId <= 196499) { idToName[botId] = name; hCount++; }
  }
  console.log(`  CharaCardHeader: 196xxx → ${hCount} 条`);

  const outPath = path.join(__dirname, 'id-names.json');
  fs.writeFileSync(outPath, JSON.stringify(idToName, null, 2), 'utf8');
  console.log(`\n总计 ${Object.keys(idToName).length} 个映射 → ${outPath}`);

  // 随机抽样
  const ids = Object.keys(idToName).map(Number).sort((a, b) => a - b);
  console.log('\n抽样（前 5 + 后 5）:');
  ids.slice(0, 5).forEach(id => console.log(`  ${id}: ${idToName[id]}`));
  console.log('  ...');
  ids.slice(-5).forEach(id => console.log(`  ${id}: ${idToName[id]}`));
}

main().catch(e => { console.error(e); process.exit(1); });
