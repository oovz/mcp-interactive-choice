import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// Read root version
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

console.log(`Syncing version ${version} across the project...`);

// 1. packages/native-ui/package.json
const uiPkgPath = path.join(root, 'packages/native-ui/package.json');
if (fs.existsSync(uiPkgPath)) {
    const uiPkg = JSON.parse(fs.readFileSync(uiPkgPath, 'utf8'));
    uiPkg.version = version;
    fs.writeFileSync(uiPkgPath, JSON.stringify(uiPkg, null, 2) + '\n');
    console.log(`Updated ${uiPkgPath}`);
}

// 2. packages/native-ui/src-tauri/tauri.conf.json
const tauriConfPath = path.join(root, 'packages/native-ui/src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    console.log(`Updated ${tauriConfPath}`);
}

console.log('Version sync complete!');
