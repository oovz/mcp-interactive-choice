import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');

if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir);
}

const platform = process.platform;
const arch = process.arch;
const exeSuffix = platform === 'win32' ? '.exe' : '';

const sourceFile = path.join(rootDir, 'packages', 'native-ui', 'src-tauri', 'target', 'release', `native-ui${exeSuffix}`);
const targetFile = path.join(binDir, `native-ui-${platform}-${arch}${exeSuffix}`);

if (fs.existsSync(sourceFile)) {
    console.log(`Copying ${sourceFile} to ${targetFile}`);
    fs.copyFileSync(sourceFile, targetFile);
} else {
    const debugSource = path.join(rootDir, 'packages', 'native-ui', 'src-tauri', 'target', 'debug', `native-ui${exeSuffix}`);
    if (fs.existsSync(debugSource)) {
        console.log(`Release binary not found. Copying debug binary: ${debugSource} to ${targetFile}`);
        fs.copyFileSync(debugSource, targetFile);
    } else {
        console.error('Error: Could not find native-ui binary. Run build:ui first.');
        process.exit(1);
    }
}
