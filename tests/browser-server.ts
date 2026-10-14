import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dir=mkdtempSync(join(tmpdir(),'studio-browser-'));
process.env.PORT='3100';process.env.STUDIO_DATA_DIR=dir;process.env.STUDIO_MANAGER_PASSWORD='browser-test-password-only';
process.env.NODE_ENV='production';
process.on('exit',()=>rmSync(dir,{recursive:true,force:true}));
process.on('SIGTERM',()=>process.exit(0));
await import('../server/index.ts');
