/**
 * 图片工具共享库 —— 供格式转换 / 压缩 / 变清晰三个工具页使用
 * 全部处理在浏览器本地完成，图片不会上传到任何服务器。
 */
(function () {
  'use strict';
  window.IMG = window.IMG || {};

  /** 字节数人性化显示 */
  IMG.formatBytes = function (n) {
    if (!Number.isFinite(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  /** 加载图片文件 → { img, width, height, size, name, type } */
  IMG.loadImageFile = function (file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('未选择文件'));
      if (!file.type.startsWith('image/')) return reject(new Error('请选择图片文件（PNG / JPEG / WebP 等）'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({
        img, url,
        width: img.naturalWidth,
        height: img.naturalHeight,
        size: file.size,
        name: file.name,
        type: file.type,
      });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片加载失败，文件可能已损坏')); };
      img.src = url;
    });
  };

  /** canvas → Blob（Promise 封装） */
  IMG.canvasToBlob = function (canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('图片编码失败'))),
        mime,
        quality
      );
    });
  };

  /** 触发浏览器下载 */
  IMG.downloadBlob = function (blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  };

  /** 去掉扩展名的文件名 */
  IMG.baseName = function (name) {
    return (name || 'image').replace(/\.[^.]+$/, '');
  };

  /** 拖放区绑定：拖拽 + 点击选择，回调 onFile(File) */
  IMG.setupDrop = function (dropEl, onFile) {
    ['dragenter', 'dragover'].forEach(ev =>
      dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.add('drag'); })
    );
    ['dragleave', 'drop'].forEach(ev =>
      dropEl.addEventListener(ev, (e) => { e.preventDefault(); dropEl.classList.remove('drag'); })
    );
    dropEl.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onFile(f);
    });
  };

  /** MIME → 扩展名 */
  IMG.extOf = function (mime) {
    return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime] || 'bin';
  };
})();
