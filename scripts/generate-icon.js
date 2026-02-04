const fs = require('fs');
const path = require('path');

// Create a simple PNG icon using raw pixel data
// This creates a 256x256 icon with an orange "4" on dark background

const width = 256;
const height = 256;
const channels = 4; // RGBA

// Create pixel buffer
const pixels = Buffer.alloc(width * height * channels);

// Background color (dark)
const bgR = 0x1a, bgG = 0x1a, bgB = 0x1a;
// Orange color
const fgR = 0xff, fgG = 0x67, fgB = 0x00;

// Fill background
for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        pixels[idx] = bgR;
        pixels[idx + 1] = bgG;
        pixels[idx + 2] = bgB;
        pixels[idx + 3] = 255; // Alpha
    }
}

// Draw the "4"
function fillRect(x, y, w, h) {
    for (let py = y; py < y + h && py < height; py++) {
        for (let px = x; px < x + w && px < width; px++) {
            const idx = (py * width + px) * channels;
            pixels[idx] = fgR;
            pixels[idx + 1] = fgG;
            pixels[idx + 2] = fgB;
            pixels[idx + 3] = 255;
        }
    }
}

// Vertical line of 4
fillRect(140, 60, 40, 136);

// Top vertical part
fillRect(76, 60, 40, 80);

// Horizontal bar
fillRect(76, 120, 104, 40);

// Create PNG manually (simplified - just save as raw data for now)
// We'll use a library to convert to proper PNG

console.log('Icon pixel data generated. Installing sharp to create PNG...');

// Try to use sharp if available
try {
    const sharp = require('sharp');

    sharp(pixels, {
        raw: {
            width: width,
            height: height,
            channels: channels
        }
    })
        .png()
        .toFile(path.join(__dirname, '../assets/icon.png'))
        .then(() => {
            console.log('✓ Icon created: assets/icon.png');
            console.log('Now converting to ICO format...');

            // Create ICO (Windows icon) - just copy PNG for now
            // Electron will handle the conversion
            fs.copyFileSync(
                path.join(__dirname, '../assets/icon.png'),
                path.join(__dirname, '../assets/icon.ico')
            );
            console.log('✓ Icon copied to: assets/icon.ico');
        })
        .catch(err => {
            console.error('Error creating icon:', err);
            console.log('Please install sharp: npm install sharp');
        });
} catch (err) {
    console.log('Sharp not installed. Installing...');
    const { execSync } = require('child_process');
    execSync('npm install sharp', { stdio: 'inherit' });
    console.log('Please run this script again: node scripts/generate-icon.js');
}
