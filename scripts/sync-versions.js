import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// Read root version
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

console.log(`Syncing version ${version} across the project...`);

const updatedFiles = [];

// 1. packages/native-ui/package.json
const uiPkgPath = path.join(root, 'packages/native-ui/package.json');
if (fs.existsSync(uiPkgPath)) {
    const uiPkg = JSON.parse(fs.readFileSync(uiPkgPath, 'utf8'));
    uiPkg.version = version;
    fs.writeFileSync(uiPkgPath, JSON.stringify(uiPkg, null, 2) + '\n');
    updatedFiles.push(uiPkgPath);
    console.log(`Updated ${uiPkgPath}`);
}

// 2. packages/native-ui/src-tauri/tauri.conf.json
const tauriConfPath = path.join(root, 'packages/native-ui/src-tauri/tauri.conf.json');
if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = version;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
    updatedFiles.push(tauriConfPath);
    console.log(`Updated ${tauriConfPath}`);
}

// Stage updated files so they are included in npm's version commit
if (updatedFiles.length > 0) {
    const files = updatedFiles.map(f => `"${f}"`).join(' ');
    execSync(`git add ${files}`, { cwd: root, stdio: 'inherit' });
    console.log('Staged updated files for commit.');
}

console.log('Version sync complete!');

