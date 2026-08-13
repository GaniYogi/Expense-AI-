const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const targetZip = path.join(rootDir, 'Expense-AI-Clean-Source.zip');

console.log('Creating clean distribution package: Expense-AI-Clean-Source.zip ...');

// Exclude patterns
const excludePatterns = [
    '.env',
    'node_modules',
    'venv',
    '__pycache__',
    '.git',
    '.pytest_cache',
    '*.log',
    'Expense-AI-Clean-Source.zip'
];

// Using PowerShell Compress-Archive or custom copy to temp folder
const tempDir = path.join(rootDir, 'temp_clean_dist');

if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
}
fs.mkdirSync(tempDir);

function shouldInclude(relPath) {
    const parts = relPath.split(path.sep);
    for (const part of parts) {
        if (part === '.env' || part === 'node_modules' || part === 'venv' || part === '__pycache__' || part === '.git' || part === '.pytest_cache' || part.endsWith('.log') || part === 'Expense-AI-Clean-Source.zip' || part === 'temp_clean_dist') {
            return false;
        }
    }
    return true;
}

function copyRecursive(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest);
        const entries = fs.readdirSync(src);
        for (const entry of entries) {
            const srcPath = path.join(src, entry);
            const destPath = path.join(dest, entry);
            const relPath = path.relative(rootDir, srcPath);
            if (shouldInclude(relPath)) {
                copyRecursive(srcPath, destPath);
            }
        }
    } else {
        const relPath = path.relative(rootDir, src);
        if (shouldInclude(relPath)) {
            fs.copyFileSync(src, dest);
        }
    }
}

copyRecursive(rootDir, tempDir);

// Now zip tempDir using PowerShell
if (fs.existsSync(targetZip)) {
    fs.unlinkSync(targetZip);
}

try {
    execSync(`powershell -Command "Compress-Archive -Path '${tempDir}\\*' -DestinationPath '${targetZip}' -Force"`);
    console.log(`✅ Clean ZIP created successfully at: ${targetZip}`);
} catch (e) {
    console.error('Failed to create zip archive via PowerShell:', e.message);
} finally {
    if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}
