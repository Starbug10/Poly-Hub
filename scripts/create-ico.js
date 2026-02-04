const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

async function createIco() {
    try {
        const pngPath = path.join(__dirname, '../assets/icon.png');
        const icoPath = path.join(__dirname, '../assets/icon.ico');

        const buf = await toIco([fs.readFileSync(pngPath)], {
            resize: true,
            sizes: [16, 24, 32, 48, 64, 128, 256]
        });

        fs.writeFileSync(icoPath, buf);
        console.log('✓ ICO file created successfully');
    } catch (err) {
        console.error('Error creating ICO:', err);
        process.exit(1);
    }
}

createIco();
