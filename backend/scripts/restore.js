'use strict';
// OFFLINE ONLY: stop the app before running. Creates a safety backup of DB and media first.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { execFileSync } = require('child_process');
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '..', 'data', 'chandrahasa.db');
const input = process.argv[2];
if (!input) { console.error('Usage: npm run db:restore -- /data/backups/chandrahasa-YYYY-MM-DDTHH-MM-SS-sssZ.sqlite'); process.exit(2); }
const sourcePath = path.resolve(input);
if (!fs.existsSync(sourcePath) || !/^chandrahasa-.*\.sqlite$/.test(path.basename(sourcePath))) throw new Error('Restore source must be an existing Chandrahasa backup .sqlite file.');
const checksumPath = sourcePath + '.sha256';
if (!fs.existsSync(checksumPath)) throw new Error('Database backup checksum file missing; refusing restore.');
const expected = fs.readFileSync(checksumPath,'utf8').trim().split(/\s+/)[0];
const actual = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex');
if (!/^[a-f0-9]{64}$/i.test(expected) || expected !== actual) throw new Error('Database backup checksum mismatch; refusing restore.');
const candidate = new Database(sourcePath,{readonly:true,fileMustExist:true});
try {
  if(candidate.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Backup integrity check failed.');
  const tables=candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name);
  for(const required of ['orders','order_items','payments','products','users'])if(!tables.includes(required))throw new Error('Backup missing required table: '+required);
} finally { candidate.close(); }

// Validate media archive before changing the live database.
const mediaPath=sourcePath.replace(/\.sqlite$/,'.media.tar.gz');
let mediaEntries=null;
if(fs.existsSync(mediaPath)){
  const mediaChecksum=mediaPath+'.sha256';
  if(!fs.existsSync(mediaChecksum))throw new Error('Media archive checksum missing; refusing restore.');
  const expectedMedia=fs.readFileSync(mediaChecksum,'utf8').trim().split(/\s+/)[0];
  const actualMedia=crypto.createHash('sha256').update(fs.readFileSync(mediaPath)).digest('hex');
  if(!/^[a-f0-9]{64}$/i.test(expectedMedia)||expectedMedia!==actualMedia)throw new Error('Media archive checksum mismatch; refusing restore.');
  mediaEntries=execFileSync('tar',['-tzf',mediaPath],{encoding:'utf8',maxBuffer:10*1024*1024}).split(/\r?\n/).filter(Boolean);
  if(mediaEntries.some(entry=>entry.startsWith('/')||entry.split('/').includes('..')))throw new Error('Unsafe path found in media archive.');
}
if(!fs.existsSync(DATA_PATH))throw new Error('Current database not found: '+DATA_PATH);
const backup=require('./backup');
(async()=>{
  const safety=await backup.createBackup();
  const temp=DATA_PATH+'.restore-'+process.pid;
  fs.copyFileSync(sourcePath,temp,fs.constants.COPYFILE_EXCL);
  const check=new Database(temp,{readonly:true,fileMustExist:true});
  try{if(check.pragma('integrity_check',{simple:true})!=='ok')throw new Error('Copied restore candidate failed integrity check.');}
  finally{check.close();}
  fs.renameSync(temp,DATA_PATH);
  for(const suffix of ['-wal','-shm'])fs.rmSync(DATA_PATH+suffix,{force:true});
  if(mediaEntries){
    const uploadDir=path.join(path.dirname(DATA_PATH),'uploads');
    fs.rmSync(uploadDir,{recursive:true,force:true});
    fs.mkdirSync(uploadDir,{recursive:true,mode:0o700});
    execFileSync('tar',['-xzf',mediaPath,'-C',uploadDir,'--no-same-owner','--no-same-permissions']);
  }
  console.log(JSON.stringify({restored:sourcePath,safetyBackup:safety.file,integrity:'ok',mediaRestored:!!mediaEntries,note:'Restart the application and verify /api/health, owner login, products, orders and uploaded images.'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
