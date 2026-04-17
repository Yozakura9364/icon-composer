const fd = require('c:/Users/13359/WorkBuddy/20260413155959/icon-composer/file-data.json');
console.log('top keys:', Object.keys(fd));
console.log('portrait keys:', Object.keys(fd.portrait || {}));
console.log('nameplate keys:', Object.keys(fd.nameplate || {}));
const bg = fd.portrait && fd.portrait['肖像背景'];
console.log('portrait 肖像背景 sample:', bg ? JSON.stringify(bg.slice(0,2)) : 'undefined');
const base = fd.nameplate && fd.nameplate['铭牌底色'];
console.log('nameplate 铭牌底色 sample:', base ? JSON.stringify(base.slice(0,2)) : 'undefined');
