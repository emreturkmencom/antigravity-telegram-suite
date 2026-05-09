const path = require('path');
const fs = require('fs');

function getArtifactDisplayInfo(filename, filepath) {
    const ext = path.extname(filename).toLowerCase();
    let isAnimated = false;

    // Check if webp is animated
    if (ext === '.webp') {
        try {
            const fd = fs.openSync(filepath, 'r');
            const header = Buffer.alloc(50);
            fs.readSync(fd, header, 0, 50, 0);
            fs.closeSync(fd);
            if (header.includes('ANIM')) isAnimated = true;
        } catch (e) {}
    }

    // Determine icon
    let icon = '📄';
    if (ext === '.md' || ext === '.txt' || ext === '.json') icon = '📝';
    else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') icon = '🖼️';
    else if (ext === '.mp4' || ext === '.mov') icon = '🎥';
    else if (ext === '.webp') {
        icon = isAnimated ? '🎥' : '🖼️';
    }

    // Determine clean name
    const extless = filename.replace(/\.[^/.]+$/, "");
    let baseName = extless;
    let dateStrFull = '';

    const timeMatch = extless.match(/_(\d{13})$/);
    if (timeMatch) {
        baseName = extless.slice(0, -timeMatch[0].length);
        if (baseName.endsWith('_')) baseName = baseName.slice(0, -1);
        
        const date = new Date(parseInt(timeMatch[1], 10));
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        let dateStr = '';
        if (date.toDateString() === today.toDateString()) dateStr = 'Today';
        else if (date.toDateString() === yesterday.toDateString()) dateStr = 'Yesterday';
        else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        
        const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        dateStrFull = ` (${dateStr} ${timeStr})`;
    }

    baseName = baseName.replace(/_/g, ' ')
                       .split(' ')
                       .filter(w => w.length > 0)
                       .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                       .join(' ');
    
    const displayName = `${baseName}${dateStrFull}`;

    return { displayName, icon, isAnimated, ext };
}

module.exports = {
    getArtifactDisplayInfo
};
