const path = require('path');

const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif',
    '.bmp', '.tif', '.tiff', '.heic', '.heif', '.svg',
    '.avif', '.jfif', '.pjpeg', '.pjp', '.ico'
]);

const LOCAL_IMAGE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return value;
    }
}

function normalizeLocalMediaPath(rawPath) {
    if (!rawPath) return null;
    let value = rawPath.trim();
    if (value.startsWith('<') && value.endsWith('>')) {
        value = value.slice(1, -1).trim();
    }

    if (/^https?:\/\//i.test(value)) {
        return null;
    }

    if (/^file:\/\//i.test(value)) {
        value = value.replace(/^file:\/\/\/?/i, '');
        if (value.startsWith('/') && /^[a-zA-Z]:/.test(value.slice(1))) {
            value = value.slice(1);
        }
    }

    value = safeDecode(value);

    if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
        return value;
    }

    return path.isAbsolute(value) ? value : null;
}

function isSupportedImagePath(filePath) {
    return IMAGE_EXTENSIONS.has(path.extname(filePath || '').toLowerCase());
}

function isLocalImageUrl(rawUrl) {
    if (!rawUrl) return false;
    try {
        const url = new URL(rawUrl.trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
        if (!LOCAL_IMAGE_HOSTS.has(url.hostname)) return false;
        return isSupportedImagePath(url.pathname);
    } catch (_) {
        return false;
    }
}

function extractLocalImageMarkdown(text) {
    const images = [];
    const nextText = (text || '').replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (original, alt, rawPath) => {
        const filePath = normalizeLocalMediaPath(rawPath);
        const isLocalUrl = isLocalImageUrl(rawPath);
        if ((!filePath || !isSupportedImagePath(filePath)) && !isLocalUrl) {
            return original;
        }

        const label = (alt || '图片').trim() || '图片';
        images.push({
            alt: label,
            path: isLocalUrl ? rawPath.trim() : filePath,
            type: isLocalUrl ? 'url' : 'file',
            original
        });
        return `[📷 ${label} 已发送到手机]`;
    });

    return { text: nextText, images };
}

module.exports = {
    extractLocalImageMarkdown,
    isLocalImageUrl,
    isSupportedImagePath,
    normalizeLocalMediaPath
};
