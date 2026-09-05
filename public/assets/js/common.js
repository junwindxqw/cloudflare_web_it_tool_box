/**
 * Web IT Tool Box — 公共脚本（无任何第三方依赖）
 *
 * 职责：
 * 1. 主题管理：head 内同步执行，在首次绘制前应用浅色 / 深色主题（避免闪烁），
 *    默认跟随系统偏好，手动切换后记忆到 localStorage。
 * 2. 顶栏增强：注入主题切换按钮；工具页注入「全部工具」下拉导航。
 */

(function () {
  'use strict';

  var THEME_KEY = 'witb-theme';

  /* ---------- 工具清单（与主页卡片保持一致） ---------- */
  var TOOLS = [
    { href: '/tools/timestamp/',      icon: '🕐',  name: '时间戳转换',    cat: '开发' },
    { href: '/tools/json/',           icon: '{ }', name: 'JSON 格式化',   cat: '开发' },
    { href: '/tools/base64/',         icon: '🔐',  name: 'Base64 编解码', cat: '开发' },
    { href: '/tools/url/',            icon: '🔗',  name: 'URL 编解码',    cat: '开发' },
    { href: '/tools/secret/',         icon: '🗝️', name: '私密内容分享',  cat: '开发' },
    { href: '/tools/hash/',           icon: '#',   name: '哈希计算',      cat: '开发' },
    { href: '/tools/uuid/',           icon: '🆔',  name: 'UUID 生成器',   cat: '开发' },
    { href: '/tools/jwt/',            icon: '🎫',  name: 'JWT 解析',      cat: '开发' },
    { href: '/tools/html-entity/',    icon: '&;',  name: 'HTML 实体',     cat: '开发' },
    { href: '/tools/diff/',           icon: '🆚',  name: '文本对比',      cat: '开发' },
    { href: '/tools/markdown/',       icon: '📝',  name: 'Markdown 预览', cat: '开发' },
    { href: '/tools/base/',           icon: '🔟',  name: '进制转换',      cat: '开发' },
    { href: '/tools/unicode/',        icon: '🔤',  name: 'Unicode 转换',  cat: '开发' },
    { href: '/tools/password/',       icon: '🔑',  name: '密码生成',      cat: '开发' },
    { href: '/tools/url-parse/',      icon: '🧩',  name: 'URL 解析器',    cat: '开发' },
    { href: '/tools/color/',          icon: '🎨',  name: '颜色转换',      cat: '设计' },
    { href: '/tools/image-convert/',  icon: '🔄',  name: '图片格式转换',  cat: '设计' },
    { href: '/tools/image-compress/', icon: '🗜️', name: '图片压缩',      cat: '设计' },
    { href: '/tools/image-sharpen/',  icon: '✨',  name: '图片变清晰',    cat: '设计' },
    { href: '/tools/image-upscale/',  icon: '🪄',  name: 'AI 图像增强',   cat: '设计' },
    { href: '/tools/gradient/',       icon: '🌈',  name: 'CSS 渐变生成',  cat: '设计' },
    { href: '/tools/shadow/',         icon: '🔳',  name: 'CSS 盒阴影',    cat: '设计' },
    { href: '/tools/px-rem/',         icon: '📏',  name: 'PX ⇄ REM',      cat: '设计' },
    { href: '/tools/image-crop/',     icon: '✂️',  name: '图片裁剪',      cat: '设计' },
    { href: '/tools/image-resize/',   icon: '📐',  name: '图片改尺寸',    cat: '设计' },
    { href: '/tools/image-watermark/', icon: '💧', name: '图片加水印',    cat: '设计' },
    { href: '/tools/image-to-base64/', icon: '🖼️', name: '图片转 Base64', cat: '设计' },
    { href: '/tools/favicon/',        icon: '⭐',  name: 'Favicon 生成',  cat: '设计' },
    { href: '/tools/palette/',        icon: '🖌️', name: '配色方案',      cat: '设计' },
    { href: '/tools/easing/',         icon: '📈',  name: '缓动曲线预览',  cat: '设计' },
    { href: '/tools/cron/',           icon: '⏰',  name: 'Cron 解析',     cat: '运维' },
    { href: '/tools/ip-calc/',        icon: '🌐',  name: 'IP 子网计算',   cat: '运维' },
    { href: '/tools/chmod/',          icon: '🔒',  name: 'chmod 权限',    cat: '运维' },
    { href: '/tools/http-status/',    icon: '🚦',  name: 'HTTP 状态码',   cat: '运维' },
    { href: '/tools/ports/',          icon: '🚪',  name: '常用端口',      cat: '运维' },
    { href: '/tools/unit-storage/',   icon: '💾',  name: '存储单位换算',  cat: '运维' },
    { href: '/tools/git-cheatsheet/', icon: '🌿',  name: 'Git 命令速查',  cat: '运维' },
    { href: '/tools/linux-cheatsheet/', icon: '🐧', name: 'Linux 命令速查', cat: '运维' },
    { href: '/tools/world-clock/',    icon: '🌍',  name: '世界时钟',      cat: '运维' },
    { href: '/tools/text-sort/',      icon: '🧹',  name: '文本去重排序',  cat: '运维' },
    { href: '/tools/dns-lookup/',     icon: '🛰️', name: 'DNS 查询',      cat: '运维' },
    { href: '/tools/regex/',          icon: '🔍',  name: '正则测试',      cat: '测试' },
    { href: '/tools/api/',            icon: '📡',  name: 'API 调试',      cat: '测试' },
    { href: '/tools/mock-data/',      icon: '🎭',  name: '测试数据生成',  cat: '测试' },
    { href: '/tools/lorem/',          icon: '📄',  name: '假文生成',      cat: '测试' },
    { href: '/tools/csv-json/',       icon: '📊',  name: 'CSV ⇄ JSON',    cat: '测试' },
    { href: '/tools/char-count/',     icon: '🔢',  name: '字数统计',      cat: '测试' },
    { href: '/tools/regex-sheet/',    icon: '📖',  name: '正则速查',      cat: '测试' },
    { href: '/tools/user-agent/',     icon: '🕵️', name: 'UA 解析',       cat: '测试' },
    { href: '/tools/curl2fetch/',     icon: '🌀',  name: 'cURL 转代码',   cat: '测试' },
    { href: '/tools/json2ts/',        icon: '🔷',  name: 'JSON 转 TS',    cat: '测试' },
    { href: '/tools/placeholder/',    icon: '🏞️', name: '占位图生成',    cat: '测试' },
    { href: '/tools/idcard/',         icon: '🪪',  name: '身份证校验',    cat: '测试' }
  ];

  /* ---------- 主题：首屏前立即应用 ---------- */
  function savedTheme() {
    try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }

  function systemDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme; // 'light' | 'dark'

    var btn = document.querySelector('.theme-toggle');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? '切换为浅色模式' : '切换为深色模式';
      btn.setAttribute('aria-label', btn.title);
    }

    // 同步移动端浏览器地址栏颜色（无则创建）
    var meta = document.querySelector('meta[name="theme-color"]:not([media])');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      (document.head || document.documentElement).appendChild(meta);
    }
    meta.setAttribute('content', theme === 'dark' ? '#0f1420' : '#f5f7fb');
  }

  applyTheme(savedTheme() || (systemDark() ? 'dark' : 'light'));

  // 未手动选择时实时跟随系统切换
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSystemChange = function (e) {
      if (!savedTheme()) applyTheme(e.matches ? 'dark' : 'light');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 隐私模式等场景忽略 */ }
    applyTheme(next);
  }

  /* ---------- 顶栏增强（DOM 就绪后执行） ---------- */
  function catClass(cat) {
    return { '开发': 'dev', '设计': 'design', '运维': 'ops', '测试': 'qa' }[cat] || 'dev';
  }

  function enhanceHeader() {
    var inner = document.querySelector('.site-header .header-inner');
    if (!inner) return;

    // 主题切换按钮（所有页面）
    var themeBtn = document.createElement('button');
    themeBtn.type = 'button';
    themeBtn.className = 'icon-btn theme-toggle';
    themeBtn.addEventListener('click', toggleTheme);
    inner.appendChild(themeBtn);
    applyTheme(document.documentElement.dataset.theme);

    // 「全部工具」下拉导航（仅工具页：以「返回工具箱」链接为标志）
    var back = inner.querySelector('.header-nav[href="/"]');
    if (!back) return;

    var wrap = document.createElement('div');
    wrap.className = 'tools-menu';

    var menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'header-nav tools-menu-btn';
    menuBtn.setAttribute('aria-haspopup', 'true');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.innerHTML = '🧰 <span class="btn-text">全部工具</span><span class="caret">▾</span>';

    var panel = document.createElement('div');
    panel.className = 'tools-menu-panel';
    panel.hidden = true;

    var list = document.createElement('div');
    list.className = 'tools-menu-grid';
    var currentPath = location.pathname.replace(/\/+$/, '') || '/';
    TOOLS.forEach(function (t) {
      var a = document.createElement('a');
      a.href = t.href;
      a.className = 'tools-menu-item';
      if (currentPath === t.href.replace(/\/+$/, '')) a.classList.add('current');
      a.innerHTML =
        '<span class="icon-tile cat-' + catClass(t.cat) + '">' + t.icon + '</span>' +
        '<span class="mi-name">' + t.name + '</span>' +
        '<span class="mi-cat">' + t.cat + '</span>';
      list.appendChild(a);
    });
    panel.appendChild(list);

    wrap.appendChild(menuBtn);
    wrap.appendChild(panel);
    back.insertAdjacentElement('afterend', wrap);

    function setOpen(open) {
      panel.hidden = !open;
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menuBtn.classList.toggle('open', open);
    }

    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(panel.hidden);
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !wrap.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        setOpen(false);
        menuBtn.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceHeader);
  } else {
    enhanceHeader();
  }
})();
