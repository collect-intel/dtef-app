const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = {
  onPostBuild({ utils }) {
    const handlerDir = path.join(
      process.cwd(),
      '.netlify/functions-internal/___netlify-server-handler'
    );

    if (!fs.existsSync(handlerDir)) {
      console.log('Server handler directory not found, skipping cleanup');
      return;
    }

    const dirsToRemove = [
      '.git',
      '.netlify',
      'data',
      'docs',
      'tools',
      'scripts',
      'examples',
      'output',
      '.claude',
    ];

    let savedBytes = 0;
    for (const dir of dirsToRemove) {
      const fullPath = path.join(handlerDir, dir);
      if (fs.existsSync(fullPath)) {
        try {
          const size = execSync(`du -sb "${fullPath}" 2>/dev/null || du -sk "${fullPath}"`)
            .toString()
            .trim()
            .split('\t')[0];
          execSync(`rm -rf "${fullPath}"`);
          savedBytes += parseInt(size, 10);
          console.log(`Removed ${dir}/ (${size} bytes)`);
        } catch (e) {
          console.log(`Failed to remove ${dir}/: ${e.message}`);
        }
      }
    }

    // Also remove platform-specific sharp binaries that won't work on Linux
    const sharpDarwin = path.join(handlerDir, 'node_modules/.pnpm/@img+sharp-libvips-darwin-arm64@1.2.0');
    if (fs.existsSync(sharpDarwin)) {
      try {
        execSync(`rm -rf "${sharpDarwin}"`);
        console.log('Removed macOS-specific sharp binary');
      } catch (e) {}
    }

    // Check final size
    try {
      const finalSize = execSync(`du -sh "${handlerDir}"`)
        .toString()
        .trim()
        .split('\t')[0];
      console.log(`Server handler final size: ${finalSize}`);
    } catch (e) {}
  },
};
