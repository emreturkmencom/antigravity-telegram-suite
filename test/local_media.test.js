const assert = require('assert');
const { extractLocalImageMarkdown, isLocalImageUrl, isSupportedImagePath, normalizeLocalMediaPath } = require('../src/local_media');

function run() {
    assert.strictEqual(
        normalizeLocalMediaPath('file:///C:/tmp/%E5%9B%BE%E7%89%87.png'),
        'C:/tmp/图片.png'
    );
    assert.strictEqual(
        normalizeLocalMediaPath('<C:/tmp/desktop screenshot.png>'),
        'C:/tmp/desktop screenshot.png'
    );
    assert.strictEqual(normalizeLocalMediaPath('https://example.com/a.png'), null);

    assert.strictEqual(isSupportedImagePath('C:/tmp/a.PNG'), true);
    assert.strictEqual(isSupportedImagePath('C:/tmp/a.heic'), true);
    assert.strictEqual(isSupportedImagePath('C:/tmp/a.txt'), false);
    assert.strictEqual(
        isLocalImageUrl('https://127.0.0.1:60274/static/artifacts/abc/selene_sea_moon.jpg?csrf=token'),
        true
    );
    assert.strictEqual(isLocalImageUrl('http://localhost:60274/static/artifacts/abc/image.webp'), true);
    assert.strictEqual(isLocalImageUrl('https://example.com/static/artifacts/abc/image.webp'), false);

    const extracted = extractLocalImageMarkdown([
        '第一张：![截图](file:///C:/tmp/%E6%A1%8C%E9%9D%A2.png)',
        '网络图保留：![remote](https://example.com/a.png)',
        '第二张：![diagram](D:/work/diagram.svg)',
        '桌面端 artifact：![海面明月与女孩](https://127.0.0.1:60274/static/artifacts/abc/selene_sea_moon.jpg?csrf=token)'
    ].join('\n'));

    assert.deepStrictEqual(extracted.images, [
        { alt: '截图', path: 'C:/tmp/桌面.png', type: 'file', original: '![截图](file:///C:/tmp/%E6%A1%8C%E9%9D%A2.png)' },
        { alt: 'diagram', path: 'D:/work/diagram.svg', type: 'file', original: '![diagram](D:/work/diagram.svg)' },
        { alt: '海面明月与女孩', path: 'https://127.0.0.1:60274/static/artifacts/abc/selene_sea_moon.jpg?csrf=token', type: 'url', original: '![海面明月与女孩](https://127.0.0.1:60274/static/artifacts/abc/selene_sea_moon.jpg?csrf=token)' }
    ]);
    assert(extracted.text.includes('[📷 截图 已发送到手机]'));
    assert(extracted.text.includes('![remote](https://example.com/a.png)'));
    assert(extracted.text.includes('[📷 diagram 已发送到手机]'));
    assert(extracted.text.includes('[📷 海面明月与女孩 已发送到手机]'));

    console.log('✅ Local media tests passed!');
}

run();
