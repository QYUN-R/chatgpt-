// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 策略模式：定义不同平台的适配器
const providers = {
  chatgpt: {
    match: (url) => url.includes('chatgpt.com') || url.includes('openai.com'),
    name: 'ChatGPT',
    getMessages: () => document.querySelectorAll('[data-message-author-role="user"]'),
    getText: (el) => el.innerText || el.textContent
  },
  gemini: {
    match: (url) => url.includes('gemini.google.com'),
    name: 'Gemini',
    getMessages: () => {
        const s1 = document.querySelectorAll('.user-query');
        if (s1.length > 0) return s1;
        const s2 = document.querySelectorAll('[data-test-id="user-query"]');
        if (s2.length > 0) return s2;
        return document.querySelectorAll('user-query'); 
    },
    getText: (el) => el.innerText || el.textContent
  },
  grok: {
    match: (url) => url.includes('x.com') || url.includes('grok.com'),
    name: 'Grok',
    getMessages: () => {
        // 限制查找范围或优化选择器
        const messages = Array.from(document.querySelectorAll('[data-testid="messageEntry"]'));
        return messages.filter(msg => msg.innerText.length > 0);
    },
    getText: (el) => {
        const textDiv = el.querySelector('[data-testid="tweetText"]');
        return textDiv ? textDiv.innerText : (el.innerText || el.textContent);
    }
  }
};

// 获取当前适配器
function getCurrentProvider() {
  const url = window.location.href;
  for (const key in providers) {
    if (providers[key].match(url)) {
      return providers[key];
    }
  }
  return null;
}

// 使元素可拖拽
function makeDraggable(element, handle) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = element.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    e.preventDefault();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    element.style.left = `${initialLeft + dx}px`;
    element.style.top = `${initialTop + dy}px`;
    element.style.right = 'auto';
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    localStorage.setItem('gpt-nav-pos-top', element.style.top);
    localStorage.setItem('gpt-nav-pos-left', element.style.left);
  }
}

// 切换最小化状态
function toggleMinimize(nav) {
  nav.classList.toggle('minimized');
  const isMinimized = nav.classList.contains('minimized');
  const btn = nav.querySelector('.toggle-btn');
  btn.innerHTML = isMinimized ? '+' : '&minus;';
  localStorage.setItem('gpt-nav-minimized', isMinimized);
}

// 创建或获取导航容器
function getNavContainer(providerName) {
  let nav = document.getElementById('gpt-context-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.id = 'gpt-context-nav';
    nav.innerHTML = `
      <div class="nav-header">
        <h3>${providerName} Map</h3>
        <button class="toggle-btn" title="Toggle Minimize">&minus;</button>
      </div>
      <div id="gpt-nav-list"></div>
    `;
    document.body.appendChild(nav);
    
    const header = nav.querySelector('.nav-header');
    const toggleBtn = nav.querySelector('.toggle-btn');
    makeDraggable(nav, header);
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        toggleMinimize(nav);
    };

    const savedTop = localStorage.getItem('gpt-nav-pos-top');
    const savedLeft = localStorage.getItem('gpt-nav-pos-left');
    const savedMinimized = localStorage.getItem('gpt-nav-minimized') === 'true';

    if (savedTop && savedLeft) {
        nav.style.top = savedTop;
        nav.style.left = savedLeft;
        nav.style.right = 'auto';
    }
    if (savedMinimized) toggleMinimize(nav);
  }
  return document.getElementById('gpt-nav-list');
}

// 状态追踪，避免重复渲染
let lastMsgCount = 0;
let lastUrl = '';

// 核心功能：扫描问题并更新侧边栏
function updateNav() {
  const provider = getCurrentProvider();
  if (!provider) return;

  const currentUrl = window.location.href;
  const userMessages = provider.getMessages();
  const currentCount = userMessages.length;

  // 性能优化：如果消息数量没变且URL没变，不进行昂贵的 DOM 重绘
  if (currentCount === lastMsgCount && currentUrl === lastUrl) {
    return;
  }

  // 更新状态
  lastMsgCount = currentCount;
  lastUrl = currentUrl;

  const navList = getNavContainer(provider.name);
  navList.innerHTML = ''; // 清空重绘

  if (currentCount === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'gpt-nav-item';
    emptyMsg.innerText = 'No context found...';
    navList.appendChild(emptyMsg);
    return;
  }

  Array.from(userMessages).forEach((msg, index) => {
    const textContent = provider.getText(msg);
    if (!textContent) return;

    const summary = textContent.replace(/\s+/g, ' ').trim().substring(0, 40) + (textContent.length > 40 ? '...' : '');

    const item = document.createElement('div');
    item.className = 'gpt-nav-item';
    item.innerText = `${index + 1}. ${summary}`;
    
    item.onclick = () => {
      msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
      msg.style.transition = 'background 0.5s';
      msg.style.boxShadow = '0 0 10px rgba(16, 163, 127, 0.8)'; 
      setTimeout(() => {
        msg.style.boxShadow = 'none';
      }, 1000);
    };

    navList.appendChild(item);
  });
}

// 性能优化：移除高频的 MutationObserver，改为定时轮询 (Polling)
// 原因：AI 生成回复时会产生大量细微的 DOM 变化（打字机效果），会导致 Observer 疯狂触发，造成页面卡死。
// 轮询每 2 秒检查一次长度变化，对性能影响微乎其微。
setInterval(updateNav, 2000);

// 也可以监听 URL 变化（针对单页应用路由跳转）
let lastHref = document.location.href;
const urlObserver = new MutationObserver(() => {
  if (lastHref !== document.location.href) {
    lastHref = document.location.href;
    // URL 变了，强制重置计数，立即更新
    lastMsgCount = -1; 
    updateNav();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true }); // 这里依然需要 observe，但只为了检测 URL 变化通常不需要这么重

// 更好的 URL 变化检测 (Monkey Patch pushState)
const originalPushState = history.pushState;
history.pushState = function(...args) {
    originalPushState.apply(this, args);
    lastMsgCount = -1;
    setTimeout(updateNav, 500);
};

window.addEventListener('popstate', () => {
    lastMsgCount = -1;
    setTimeout(updateNav, 500);
});

// 初始运行
console.log('Context Navigator loaded (Performance Mode).');
setTimeout(updateNav, 2000);
