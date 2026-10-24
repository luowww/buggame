import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
function walk(dir){return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
function sourceFingerprint(){
  const files=[...walk('src/game'),...walk('tests'),'index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json',
    'scripts/check-release.mjs','README.md','docs/v6/THREAD_REVIEW.md'];
  if(fs.existsSync(path.join(root,'.github/workflows/verify.yml')))files.push('.github/workflows/verify.yml');
  const digest=crypto.createHash('sha256');
  for(const file of files.sort())digest.update(file+'\0'+read(file).replace(/\r\n/g,'\n')+'\0');
  return digest.digest('hex');
}
function requireThat(ok,message){if(!ok)throw new Error(message);}
function docs(){
  const files=['README.md',...walk('docs/v6').filter(f=>f.endsWith('.md')),'docs/guide/README.md'];let checked=0;
  for(const file of files)for(const match of read(file).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    const target=match[1];if(/^(?:https?:|#)/.test(target))continue;
    const local=decodeURIComponent(target.split('#')[0]);if(!local)continue;
    requireThat(fs.existsSync(path.resolve(root,path.dirname(file),local)),`${file}: broken link ${target}`);checked++;
  }
  return checked;
}
function staticBuild(){
  for(const file of ['index.html','character-card.html','THIRD_PARTY_NOTICES.txt'])requireThat(fs.existsSync(path.join(root,'dist',file)),`Missing dist/${file}`);
  const html=read('dist/index.html'),assets=[...html.matchAll(/(?:src|href)="\.\/([^"#]+\.(?:js|css))"/g)].map(m=>m[1]);
  requireThat(assets.some(a=>a.endsWith('.js'))&&assets.some(a=>a.endsWith('.css')),'Built entry must reference JavaScript and CSS assets');
  for(const asset of assets){const file=`dist/${asset}`;requireThat(fs.existsSync(path.join(root,file)),`Missing ${file}`);
    if(asset.endsWith('.js')){const js=read(file);requireThat(!js.includes('__city'),'Development mutation hooks leaked into production');requireThat(!/localhost:538[0-9]|127\.0\.0\.1:538[0-9]/.test(js),'Local QA URL leaked into production');}}
  requireThat(!fs.existsSync(path.join(root,'dist/qa')),'QA fixtures must not be published');
  return assets;
}
const mode=process.argv[2];
if(mode==='--seal'){
  // Only seal after the recorded UI checks and written review have been completed.
  const file='artifacts/v6.2-ui-checks.json',receipt=JSON.parse(read(file));
  requireThat(receipt.checks?.length>=20&&receipt.checks.every(c=>c.passed===true),'UI evidence contains failures or is incomplete');
  requireThat(read('docs/v6/THREAD_REVIEW.md').includes('状态：通过'),'Written review has not passed');
  receipt.sourceFingerprint=sourceFingerprint();receipt.review='docs/v6/THREAD_REVIEW.md';receipt.buildAssets=staticBuild();
  fs.writeFileSync(path.join(root,file),JSON.stringify(receipt,null,2)+'\n');
  process.stdout.write('UI evidence sealed against the reviewed source.\n');
}else{
  const links=docs(),assets=staticBuild();
  if(mode==='--strict'){
    const receipt=JSON.parse(read('artifacts/v6.2-ui-checks.json'));
    requireThat(receipt.version===JSON.parse(read('package.json')).version,'QA receipt version mismatch');
    requireThat(receipt.checks?.length>=20&&receipt.checks.every(c=>c.passed===true),'UI checks have not all passed');
    requireThat(Array.isArray(receipt.finalConsoleErrors)&&receipt.finalConsoleErrors.length===0,'Final browser errors have not been cleared');
    requireThat(read('docs/v6/THREAD_REVIEW.md').includes('状态：通过'),'Written review has not passed');
    requireThat(receipt.sourceFingerprint===sourceFingerprint(),'Source changed after UI QA/review; rerun affected checks and reseal the evidence');
  }
  process.stdout.write(JSON.stringify({staticBuild:'passed',localLinks:links,assets,review:mode==='--strict'?'passed':'not requested'})+'\n');
}
