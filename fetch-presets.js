/**
 * 爬取 FFXIV 预设数据，生成 presets.json
 *
 * BannerDesignPreset: BannerBg/Frame/Decoration 各有独立的 index，
 * 先找到 key→Image ID 的映射，再用 BannerDesignPreset 的 index 查表。
 * CharaCardDesignPreset 同理。
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://cdn.jsdelivr.net/gh/InfSein/ffxiv-datamining-mixed@master/chs';
const outPath = path.join(__dirname, 'presets.json');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

// 可靠的 CSV 解析器（处理引号内含逗号）
function parseCsv(raw) {
  if (!raw) return [];
  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const rows = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const result = [];
    let current = '';
    let inQuote = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') { inQuote = !inQuote; }
      else if (ch === ',' && !inQuote) {
        result.push(current.trim());
        current = '';
      } else { current += ch; }
    }
    result.push(current.trim());
    rows.push(result);
  }
  return rows;
}

async function main() {
  console.log('正在获取 Banner CSV...');
  const [bgRaw, frameRaw, decRaw, presetBgRaw,
         baseRaw, headerRaw, decCharRaw, presetCharRaw] = await Promise.all([
    fetch(`${BASE_URL}/BannerBg.csv`),
    fetch(`${BASE_URL}/BannerFrame.csv`),
    fetch(`${BASE_URL}/BannerDecoration.csv`),
    fetch(`${BASE_URL}/BannerDesignPreset.csv`),
    fetch(`${BASE_URL}/CharaCardBase.csv`),
    fetch(`${BASE_URL}/CharaCardHeader.csv`),
    fetch(`${BASE_URL}/CharaCardDecoration.csv`),
    fetch(`${BASE_URL}/CharaCardDesignPreset.csv`),
  ]);

  // BannerBg: key → 190xxx ID (col[1])
  const bgMap = {};
  for (const row of parseCsv(bgRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[1]);
    if (key > 0 && imgId > 0) bgMap[key] = imgId;
  }

  // BannerFrame: key → 191xxx ID
  const frameMap = {};
  for (const row of parseCsv(frameRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[1]);
    if (key > 0 && imgId > 0) frameMap[key] = imgId;
  }

  // BannerDecoration: key → 192xxx ID
  const bannerDecMap = {};
  for (const row of parseCsv(decRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[1]);
    if (key > 0 && imgId > 0) bannerDecMap[key] = imgId;
  }

  // CharaCardBase: key → 193xxx ID
  const baseMap = {};
  for (const row of parseCsv(baseRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[1]);
    if (key > 0 && imgId > 0) baseMap[key] = imgId;
  }

  // CharaCardHeader: key → 196xxx ID (TopImage=col[1], BotImage=col[2])
  const headerTopMap = {};
  const headerBotMap = {};
  for (const row of parseCsv(headerRaw)) {
    const key = parseInt(row[0]);
    const topId = parseInt(row[1]);
    const botId = parseInt(row[2]);
    if (key > 0) {
      if (topId > 0) headerTopMap[key] = topId;
      if (botId > 0) headerBotMap[key] = botId;
    }
  }

  // CharaCardDecoration: key → 194/195/197/198/199xxx ID (col[3])
  const decCharMap = {};
  for (const row of parseCsv(decCharRaw)) {
    const key = parseInt(row[0]);
    const imgId = parseInt(row[3]);
    if (key > 0 && imgId > 0) decCharMap[key] = imgId;
  }

  // Banner presets (BannerDesignPreset: col[1]=BgKey, col[2]=FrameKey, col[3]=DecKey, col[5]=Name)
  const bannerPresets = [];
  for (const row of parseCsv(presetBgRaw)) {
    if (!row[5]) continue;
    const name = (row[5] || '').replace(/^"|"$/g, '').trim();
    if (!name || name === '自定义' || name === '') continue;
    const bgIdx = parseInt(row[1]);
    const frameIdx = parseInt(row[2]);
    const decIdx = parseInt(row[3]);

    const bgId = bgMap[bgIdx] || 0;
    const frameId = frameMap[frameIdx] || 0;
    const decId = bannerDecMap[decIdx] || 0;

    if (!bgId && !frameId && !decId) continue;

    bannerPresets.push({ name, layers: [
      { cat: '肖像背景',   id: bgId },
      { cat: '肖像装饰框', id: frameId },
      { cat: '肖像装饰物', id: decId },
    ]});
  }

  // CharaCard presets (CharaCardDesignPreset: col[1]=Base, col[2]=Top, col[3]=Bot, col[4]=Backing, col[5]=Pattern, col[6]=PortraitFrame, col[7]=PlateFrame, col[8]=Accent, col[10]=Name)
  const charPresets = [];
  for (const row of parseCsv(presetCharRaw)) {
    if (!row[10]) continue;
    const name = (row[10] || '').replace(/^"|"$/g, '').trim();
    if (!name || name === '自定义' || name === '') continue;
    const baseIdx = parseInt(row[1]);
    const topIdx = parseInt(row[2]);
    const botIdx = parseInt(row[3]);
    const backingIdx = parseInt(row[4]);
    const patternIdx = parseInt(row[5]);
    const portraitFrameIdx = parseInt(row[6]);
    const plateFrameIdx = parseInt(row[7]);
    const accentIdx = parseInt(row[8]);

    const layers = [];
    if (baseIdx > 0 && baseMap[baseIdx]) {
      layers.push({ cat: '铭牌底色', id: baseMap[baseIdx] });
    }
    if (topIdx > 0 && headerTopMap[topIdx]) {
      layers.push({ cat: '铭牌顶部装饰', id: headerTopMap[topIdx] });
    }
    if (botIdx > 0 && headerBotMap[botIdx]) {
      layers.push({ cat: '铭牌底部装饰', id: headerBotMap[botIdx] });
    }
    if (backingIdx > 0 && decCharMap[backingIdx]) {
      layers.push({ cat: '铭牌背衬', id: decCharMap[backingIdx] });
    }
    if (patternIdx > 0 && decCharMap[patternIdx]) {
      layers.push({ cat: '铭牌花纹', id: decCharMap[patternIdx] });
    }
    if (portraitFrameIdx > 0 && decCharMap[portraitFrameIdx]) {
      layers.push({ cat: '肖像外框', id: decCharMap[portraitFrameIdx] });
    }
    if (plateFrameIdx > 0 && decCharMap[plateFrameIdx]) {
      layers.push({ cat: '铭牌外框', id: decCharMap[plateFrameIdx] });
    }
    if (accentIdx > 0 && decCharMap[accentIdx]) {
      layers.push({ cat: '铭牌装饰物', id: decCharMap[accentIdx] });
    }

    if (layers.length === 0) continue;
    charPresets.push({ name, layers });
  }

  const presets = {
    banner: bannerPresets,
    charcard: charPresets,
  };

  fs.writeFileSync(outPath, JSON.stringify(presets, null, 2), 'utf8');
  console.log(`Banner 预设: ${bannerPresets.length} 个`);
  console.log(`CharaCard 预设: ${charPresets.length} 个`);
  console.log(`保存到: ${outPath}`);

  // 抽样
  console.log('\nBanner 抽样:');
  bannerPresets.slice(0, 3).forEach(p => {
    console.log(`  ${p.name}:`, p.layers.map(l => `${l.cat}=${l.id}`).join(', '));
  });
  console.log('\nCharaCard 抽样:');
  charPresets.slice(0, 3).forEach(p => {
    console.log(`  ${p.name}:`, p.layers.map(l => `${l.cat}=${l.id}`).join(', '));
  });
}

main().catch(e => { console.error(e); process.exit(1); });
