// 作者: YoungSimpleBoy
// 日期: 2026-03-12
// 功能: 如你所见
// ====================
// 全局变量区
// ====================
let clockInterval = null; // 时钟定时器，防止叠加
let pendingHash = null;   // 用于跨页 hash 滚动（解决 Barba 丢 hash 的 Bug）
let pendingSearchTag = null;   // 用于标签云跨页搜索

// ====================
// 全局文章数据（自动从首页同步，用于 about 页）
// ====================
let allPostsData = [
    { date: '2026-03-21', tags: ['笔记', '科学计算'] },
    { date: '2026-03-15', tags: ['笔记', '最优化', 'PDE'] },
    { date: '2026-03-14', tags: ['分子动力学', 'python'] },
    { date: '2026-03-13', tags: ['笔记', '科学计算'] },
    { date: '2026-03-12', tags: ['线性代数'] },
    { date: '2026-03-12', tags: ['前端', 'HTML'] }
];

// 额外：支持 localStorage 持久化（刷新或直接打开 about.html 也能用最新数据）
const savedData = localStorage.getItem('blogPostsData');
if (savedData) {
    try {
        allPostsData = JSON.parse(savedData);
        console.log('✅ 从 localStorage 恢复文章数据');
    } catch (e) {}
}

// ====================
// 从首页 DOM 提取文章数据的函数
// ====================
function extractPostsData() {
    const posts = document.querySelectorAll('.post-item');
    if (posts.length === 0) return null;

    const data = [];
    posts.forEach(post => {
        const timeEl = post.querySelector('time');
        const date = timeEl ? timeEl.getAttribute('datetime') : '';
        if (!date) return;

        const tagEls = post.querySelectorAll('.post-tags .tag');
        const tags = Array.from(tagEls).map(el => el.textContent.trim());

        data.push({ date, tags });
    });
    return data;
}

// ====================
// 分页相关全局变量
// ====================
let currentPage = 1;
const POSTS_PER_PAGE = 4;

function showPage(page) {
    const posts = document.querySelectorAll('.post-item');
    if (posts.length === 0) return;

    const visiblePosts = Array.from(posts).filter(p => p.dataset.searched !== 'false');
    const totalPages = Math.max(1, Math.ceil(visiblePosts.length / POSTS_PER_PAGE));

    currentPage = Math.max(1, Math.min(page, totalPages));

    // 先隐藏所有文章
    posts.forEach(post => post.style.display = 'none');

    // 显示当前页的文章
    const start = (currentPage - 1) * POSTS_PER_PAGE;
    const end = Math.min(start + POSTS_PER_PAGE, visiblePosts.length);
    for (let i = start; i < end; i++) {
        if (visiblePosts[i]) {
            visiblePosts[i].style.display = '';
        }
    }

    updatePaginationUI(currentPage, totalPages);
}

function updatePaginationUI(currentPage, totalPages) {
    const pageNumbers = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');

    if (!pageNumbers) return;

    // 上一页按钮
    if (prevBtn) {
        prevBtn.classList.toggle('disabled', currentPage <= 1);
        prevBtn.onclick = function (e) {
            e.preventDefault();
            if (currentPage > 1) showPage(currentPage - 1);
        };
    }

    // 下一页按钮
    if (nextBtn) {
        nextBtn.classList.toggle('disabled', currentPage >= totalPages);
        nextBtn.onclick = function (e) {
            e.preventDefault();
            if (currentPage < totalPages) showPage(currentPage + 1);
        };
    }

    // 生成页码
    let html = '';
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage + 1 < maxVisible) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            html += '<span class="page-number active">' + i + '</span>';
        } else {
            html += '<a href="#" class="page-number" data-page="' + i + '">' + i + '</a>';
        }
    }
    pageNumbers.innerHTML = html;

    // 页码点击事件
    pageNumbers.querySelectorAll('.page-number').forEach(function (btn) {
        btn.onclick = function (e) {
            e.preventDefault();
            showPage(parseInt(this.dataset.page));
        };
    });
}

// ====================
// 1. 初始化时间与"宜/忌"卡片
// ====================
function initDateAndYiJi() {
    const dateEl = document.getElementById('current-date');
    const yijiEl = document.getElementById('yi-ji');
    if (!dateEl || !yijiEl) return;

    // 清除旧的定时器，防止叠加
    if (clockInterval) clearInterval(clockInterval);

    function updateDateTime() {
        const now = new Date();
        const cd = document.getElementById('current-date');
        if (!cd) return; // 元素丢失则返回

        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        cd.textContent = `${year}-${month}-${day}`;

        // 农历转换
        try {
            let lunar = now.toLocaleString('zh-CN-u-ca-chinese', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            lunar = lunar.replace(/^\d+(?=[甲乙丙丁戊己庚辛壬癸])/, '').trim();
            function numToChinese(num) {
                const digits = [
                    '', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
                    '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
                    '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
                    '卅一'
                ];
                return digits[num] || num;
            }
            lunar = lunar.replace(/(\d+)$/, (match, p1) => numToChinese(parseInt(p1, 10)));
            const lunarEl = document.getElementById('lunarDate');
            if (lunarEl) lunarEl.textContent = lunar;
        } catch (e) {
            const lunarEl = document.getElementById('lunarDate');
            if (lunarEl) lunarEl.textContent = '农历加载失败';
        }

        // 星期
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekEl = document.getElementById('current-week');
        if (weekEl) weekEl.textContent = weekdays[now.getDay()];

        // 时分秒
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeEl = document.getElementById('current-time');
        if (timeEl) timeEl.textContent = `${hours}:${minutes}:${seconds}`;
    }

    updateDateTime();
    clockInterval = setInterval(updateDateTime, 1000);

    // 宜忌逻辑（每日固定）
    const yiList = ['读文献', '看书', '写文章', '跑文章', '做实验', '运动', '哈↑基→米↓~', '曼↑波↓~'];
    const jiList = ['熬夜', '摆烂', '刷视频', '打游戏', '摸鱼🐟', '鹿🦌', '叮咚鸡🐔', '大狗叫🐕'];
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    function seededRandom(s) {
        const x = Math.sin(s) * 10000;
        return x - Math.floor(x);
    }

    const yiIndex = Math.floor(seededRandom(seed) * yiList.length);
    const jiIndex = Math.floor(seededRandom(seed + 1) * jiList.length);
    yijiEl.innerHTML = `<span class="yi">✅ 宜：${yiList[yiIndex]}</span><span class="ji">❌ 忌：${jiList[jiIndex]}</span>`;
}

// ====================
// 2. 初始化赛马娘 GIF
// ====================
function initUmaGif() {
    const img = document.getElementById('uma-gif');
    if (!img) return;

    const gifList = [
        'uma_01.gif', 'uma_02.gif', 'uma_03.gif', 'uma_04.gif', 'uma_05.gif',
        'uma_06.gif', 'uma_07.gif', 'uma_08.gif', 'uma_09.gif', 'uma_10.gif',
        'uma_11.gif', 'uma_12.gif', 'uma_13.gif', 'uma_14.gif', 'uma_15.gif',
        'uma_16.gif', 'uma_17.gif', 'uma_18.gif', 'uma_19.gif', 'uma_20.gif',
        'uma_21.gif', 'uma_22.gif', 'uma_23.gif', 'uma_24.gif', 'uma_25.gif',
        'uma_26.gif', 'uma_27.gif', 'uma_28.gif', 'uma_29.gif', 'uma_30.gif',
        'uma_31.gif', 'uma_32.gif', 'uma_33.gif', 'uma_34.gif', 'uma_35.gif',
        'uma_36.gif', 'uma_37.gif', 'uma_38.gif', 'uma_39.gif', 'uma_40.gif'
    ];
    const STORAGE_KEY = 'umaGifIndex';
    let currentIndex = parseInt(localStorage.getItem(STORAGE_KEY)) || 0;
    currentIndex = currentIndex % gifList.length;

    img.src = '/asset/uma_gif/' + gifList[currentIndex];

    // 覆盖旧事件（防止重复绑定）
    img.onclick = () => {
        currentIndex = (currentIndex + 1) % gifList.length;
        img.src = '/asset/uma_gif/' + gifList[currentIndex];
        localStorage.setItem(STORAGE_KEY, currentIndex);
    };
}

// ====================
// 3. 初始化搜索与分页
// ====================
function initSearchAndPagination() {
    console.log("正在初始化分页与搜索...");
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    const posts = document.querySelectorAll('.post-item');
    if (!searchInput || posts.length === 0) return;
    // 每次回到主页，重置为第一页
    currentPage = 1;
    // 搜索逻辑
    function performSearch() {
        const query = searchInput.value.toLowerCase().trim();
        const clearBtn = document.getElementById('searchClear');
        const pagination = document.getElementById('pagination');
        // 显示/隐藏清除按钮
        if (clearBtn) clearBtn.style.display = query ? 'flex' : 'none';
        posts.forEach(post => {
            const title = post.querySelector('.post-title')?.textContent.toLowerCase() || '';
            const excerpt = post.querySelector('.post-excerpt')?.textContent.toLowerCase() || '';
            const tags = post.querySelector('.post-tags')?.textContent.toLowerCase() || '';
            post.dataset.searched = (query === '' || title.includes(query) || excerpt.includes(query) || tags.includes(query)) ? 'true' : 'false';
        });
        // 搜索时隐藏分页
        if (pagination) pagination.style.display = query ? 'none' : 'flex';
        showPage(1); // 搜索后强制回第一页
    }
    // 绑定搜索事件
    searchInput.oninput = performSearch;
    // 清除按钮
    if (searchClear) {
        searchClear.onclick = () => {
            searchInput.value = '';
            performSearch();
            searchInput.focus();
        };
    }
    // 暴露 paginationInit 到全局（兼容旧代码）
    window.paginationInit = function () {
        currentPage = 1;
        showPage(1);
    };
    // 初始展示
    posts.forEach(post => post.dataset.searched = 'true');
    showPage(1);
    console.log("分页与搜索初始化完成");
    // 1. 自动提取文章数据（只在这里执行一次）
    const extracted = extractPostsData();
    if (extracted && extracted.length > 0) {
        allPostsData = extracted;
        localStorage.setItem('blogPostsData', JSON.stringify(extracted));
        console.log('✅ 已从首页文章列表提取最新数据，about 页标签云/统计已自动更新', allPostsData);
    }
    // 2. 自动处理来自关于页标签云的搜索请求（关键位置！）
    if (pendingSearchTag) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = pendingSearchTag;
            // 触发搜索（复用已有的 performSearch）
            const event = new Event('input');
            searchInput.dispatchEvent(event);
            console.log(`🔍 已自动搜索标签: ${pendingSearchTag}`);
        }
        pendingSearchTag = null;   // 清空
    }
}

// ====================
// 4. 初始化 Lightbox
// ====================
function initLightbox() {
    // 清理旧的遮罩层，防止 DOM 里出现多个 overlay
    document.querySelectorAll('.lightbox-overlay').forEach(el => el.remove());

    const images = Array.from(document.querySelectorAll('.article-body img'));
    if (images.length === 0) return;

    // 创建遮罩层 DOM
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
        <span class="lightbox-close">&times;</span>
        <div class="lightbox-prev">◀</div>
        <div class="lightbox-next">▶</div>
        <img class="lightbox-image" src="" alt="">
        <div class="lightbox-counter"></div>
    `;
    document.body.appendChild(overlay);

    const lightboxImg = overlay.querySelector('.lightbox-image');
    const closeBtn = overlay.querySelector('.lightbox-close');
    const prevBtn = overlay.querySelector('.lightbox-prev');
    const nextBtn = overlay.querySelector('.lightbox-next');
    const counterDiv = overlay.querySelector('.lightbox-counter');

    let currentIndex = 0;

    function showImage(index) {
        index = (index + images.length) % images.length;
        currentIndex = index;
        lightboxImg.src = images[currentIndex].src;
        counterDiv.textContent = `${currentIndex + 1} / ${images.length}`;
    }

    function openLightbox(index) {
        showImage(index);
        overlay.classList.add('active');
    }

    function closeLightbox() {
        overlay.classList.remove('active');
        lightboxImg.src = '';
    }

    // 为每张图片绑定点击事件
    images.forEach((img, idx) => {
        img.style.cursor = 'pointer';
        img.onclick = (e) => {
            e.stopPropagation();
            openLightbox(idx);
        };
    });

    // 上一张
    prevBtn.onclick = (e) => {
        e.stopPropagation();
        showImage(currentIndex - 1);
    };

    // 下一张
    nextBtn.onclick = (e) => {
        e.stopPropagation();
        showImage(currentIndex + 1);
    };

    // 点击遮罩层关闭
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            closeLightbox();
        }
    };

    // 关闭按钮
    closeBtn.onclick = closeLightbox;

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeLightbox();
        }
    });
}

// ====================
// 5. 初始化主题切换（全局只需一次）
// ====================
function initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle') || document.querySelector('.theme-toggle');
    if (themeToggle) {
        // 使用 .onclick 确保每次 Barba 切换后重新绑定，且不会叠加事件
        themeToggle.onclick = () => {
            const isLight = document.documentElement.classList.toggle('light');
            localStorage.setItem('theme', isLight ? 'light' : 'dark');
            console.log("主题模式已切换:", isLight ? "Light" : "Dark");
        };
    }
}

// ====================
// 6. 初始化移动端菜单（全局只需一次）
// ====================
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');

    if (!mobileMenuBtn || !navLinks) return;

    function toggleMobileMenu() {
        navLinks.classList.toggle('active');
        const menuIcon = mobileMenuBtn.querySelector('.menu-icon');
        if (menuIcon) {
            menuIcon.innerHTML = navLinks.classList.contains('active')
                ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>`
                : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>`;
        }
    }

    function closeMobileMenu() {
        navLinks.classList.remove('active');
        const menuIcon = mobileMenuBtn.querySelector('.menu-icon');
        if (menuIcon) {
            menuIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>`;
        }
    }

    mobileMenuBtn.addEventListener('click', toggleMobileMenu);

    // ESC 关闭菜单
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('active')) {
            closeMobileMenu();
        }
    });

    // 窗口调整大小时关闭菜单
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            closeMobileMenu();
        }
    });
}

// ====================
// 7. 初始化平滑滚动
// ====================
function initSmoothScroll() {
    document.querySelectorAll('a[href*="#"]').forEach(link => {
        // 跳过外部链接
        if (link.getAttribute('href').startsWith('http') && !link.getAttribute('href').includes(window.location.host)) return;
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            const hashIndex = href.indexOf('#');
            if (hashIndex === -1) return;

            const hash = href.substring(hashIndex);
            // 同页（已经在首页）直接滚动
            if (window.location.pathname === '/' || href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(hash);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    console.log(`✅ 同页滚动到: ${hash}`);
                }
            } 
            // 跨页（从 about 点击搜索/文章）
            else {
                console.log(`🚀 跨页跳转 → ${href}（带 #posts）`);
                barba.go(href);           // 关键：让 Barba 带 hash 跳转
                e.preventDefault();
            }
        });
    });
}

// ====================
// 8. 初始化系统主题监听（全局只需一次）
// ====================
function initSystemThemeListener() {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            document.documentElement.classList.toggle('light', !e.matches);
        }
    });
}

// ====================
// 9. 背景音乐播放器 (BGM)
// ====================
let isPlaying = false;
let isLoaded = false;
let isLoading = false;
let sampler = null;
let midiData = null;

// 2. 去掉外层的 (function() { ... })(); 变成普通的 function
function initBGM() {
    const bgmToggle = document.getElementById('bgmToggle');
    if (!bgmToggle) return;

    const MIDI_URL = '/toolkit/midi_player/example_midi/example03.mid';

    // 刷新或切页后，同步按钮的视觉状态
    if (isPlaying) {
        bgmToggle.classList.add('is-playing');
    }

    async function initAndPlayBGM() {
        isLoading = true;
        bgmToggle.classList.add('is-loading');
        await Tone.start(); // 核心：用户点击时解锁音频

        const reverb = new Tone.Reverb({ decay: 2, wet: 0.1 }).toDestination();

        sampler = new Tone.Sampler({
            urls: {
                "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
                "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
                "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
                "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
                "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
                "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
                "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
                "A7": "A7.mp3", "C8": "C8.mp3"
            },
            release: 1.2,
            baseUrl: "https://tonejs.github.io/audio/salamander/",
            onload: async () => {
                sampler.connect(reverb);
                sampler.volume.value = -6;
                try {
                    const response = await fetch(MIDI_URL);
                    if (!response.ok) throw new Error('MIDI file fetch failed');
                    const arrayBuffer = await response.arrayBuffer();
                    midiData = new Midi(arrayBuffer);

                    Tone.Transport.cancel();
                    midiData.tracks.forEach(track => {
                        track.notes.forEach(note => {
                            Tone.Transport.schedule(time => {
                                sampler.triggerAttackRelease(note.name, note.duration, time, note.velocity);
                            }, note.time);
                        });
                    });

                    Tone.Transport.schedule(() => {
                        Tone.Transport.stop();
                        isPlaying = false;
                        bgmToggle.classList.remove('is-playing');
                    }, midiData.duration);

                    isLoaded = true;
                    isLoading = false;
                    bgmToggle.classList.remove('is-loading');
                    togglePlayState(); 
                } catch (err) {
                    console.error("加载 BGM 失败:", err);
                    isLoading = false;
                    bgmToggle.classList.remove('is-loading');
                }
            }
        });
    }

    function togglePlayState() {
        if (!isLoaded) return;
        if (isPlaying) {
            Tone.Transport.pause();
            isPlaying = false;
            bgmToggle.classList.remove('is-playing');
        } else {
            Tone.start();
            Tone.Transport.start();
            isPlaying = true;
            bgmToggle.classList.add('is-playing');
        }
    }

    // 3. 使用 onclick 覆盖绑定，确保 Barba 切换后旧事件被清除
    bgmToggle.onclick = () => {
        if (isLoading) return;
        if (!isLoaded) {
            initAndPlayBGM();
        } else {
            togglePlayState();
        }
    };
}

// ====================
// 关于页逻辑函数 (放在初始化之前)
// ====================

// 1. 活跃度日历渲染
function renderContributionGraph() {
    const graph = document.getElementById('contributionGraph');
    const monthsContainer = document.getElementById('contributionMonths');

    if (!graph || !monthsContainer) return;

    // 清空现有内容
    graph.innerHTML = '';
    monthsContainer.innerHTML = '';

    // 使用全局自动同步的文章数据（不再写死）
    const postsData = allPostsData;

    // 创建日期到文章数的映射
    const postDates = {};
    postsData.forEach(post => {
        postDates[post.date] = (postDates[post.date] || 0) + 1;
    });

    // 2. 计算时间范围（保持不变）
    const today = new Date();
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    let currentDate = new Date(oneYearAgo);
    while (currentDate.getDay() !== 0) {
        currentDate.setDate(currentDate.getDate() - 1);
    }

    const weeks = [];
    while (currentDate <= today) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            const dateStr = currentDate.toISOString().split('T')[0];
            const postCount = postDates[dateStr] || 0;
            let level = '';
            if (postCount === 1) level = 'level-1';
            else if (postCount === 2) level = 'level-2';
            else if (postCount >= 3) level = 'level-3';
            
            week.push({ date: dateStr, level, count: postCount });
            currentDate.setDate(currentDate.getDate() + 1);
            if (currentDate > today) break;
        }
        weeks.push(week);
        if (currentDate > today) break;
    }

    // 3. 渲染月份标签
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let currentMonth = -1;

    weeks.forEach((week, weekIndex) => {
        const firstDayOfWeek = week[0];
        if (firstDayOfWeek) {
            const date = new Date(firstDayOfWeek.date);
            const month = date.getMonth();
            if (month !== currentMonth) {
                currentMonth = month;
                let monthWeeks = 0;
                for (let i = weekIndex; i < weeks.length; i++) {
                    const firstDayOfNextWeek = weeks[i][0];
                    if (new Date(firstDayOfNextWeek.date).getMonth() === month) {
                        monthWeeks++;
                    } else {
                        break;
                    }
                }
                if (monthWeeks > 0) {
                    const monthEl = document.createElement('span');
                    monthEl.className = 'contribution-month';
                    monthEl.textContent = monthNames[month];
                    monthEl.style.width = (monthWeeks * 14) + 'px';
                    monthsContainer.appendChild(monthEl);
                }
            }
        }
    });

    // 4. 渲染方格日历
    weeks.forEach(week => {
        const weekEl = document.createElement('div');
        weekEl.className = 'contribution-week';
        week.forEach(day => {
            const dayEl = document.createElement('div');
            dayEl.className = `contribution-day ${day.level}`;
            dayEl.title = `${day.date}: ${day.count} 篇文章`;
            weekEl.appendChild(dayEl);
        });
        graph.appendChild(weekEl);
    });
}

// 2. 统计逻辑 + 标签云可点击跳转搜索
function initAboutStats() {
    const posts = allPostsData;
    const postCountEl = document.getElementById('postCount');
    if (postCountEl) postCountEl.textContent = posts.length;
    const uniqueDays = new Set(posts.map(p => p.date));
    const activeDaysEl = document.getElementById('activeDays');
    if (activeDaysEl) activeDaysEl.textContent = uniqueDays.size;
    const tagCounts = {};
    posts.forEach(post => {
        post.tags.forEach(tag => tagCounts[tag] = (tagCounts[tag] || 0) + 1);
    });
    const tagCountEl = document.getElementById('tagCount');
    if (tagCountEl) tagCountEl.textContent = Object.keys(tagCounts).length;
    const tagCloud = document.getElementById('tagCloud');
    if (tagCloud) {
        tagCloud.innerHTML = '';
        Object.entries(tagCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([tag, count]) => {
                const tagEl = document.createElement('span');
                tagEl.className = 'tag-stat-item';
                tagEl.style.cursor = 'pointer';           // 可点击手型
                tagEl.innerHTML = `${tag}<span class="tag-count">${count}</span>`;

                // === 点击跳转 + 自动搜索 ===
                tagEl.onclick = () => {
                    pendingSearchTag = tag;
                    barba.go('/#posts');   // 带 hash 跳转（复用上一个滚动逻辑）
                    console.log(`🏷️ 标签云点击: ${tag} → 跳转首页搜索`);
                };

                tagCloud.appendChild(tagEl);
            });
    }
}

// 重新绑定所有导航栏事件（主题、音乐、菜单）
function rebindNavEvents() {
    console.log("正在重连导航栏交互...");

    // 1. 重新绑定主题切换
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.onclick = () => {
            document.documentElement.classList.toggle('light');
            localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
        };
    }

    // 2. 重新绑定 BGM 开关 (改为调用 initBGM)
    initBGM(); 

    // 3. 重新绑定移动端菜单
    const menuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    if (menuBtn && navLinks) {
        menuBtn.onclick = () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('active');
        };
    }
}


// ====================
// Barba.js 核心调度 (统一修正版)
// ====================
barba.init({
    transitions: [{
        name: 'default-transition',
        leave(data) {
            return gsap.to(data.current.container, { opacity: 0, duration: 0.3 });
        },
        afterEnter(data) {
            const ns = data.next.namespace;
            rebindNavEvents();
            console.log("Barba: 进入新页面 ->", ns);
            // 1. 基础功能重连 (全站通用)
            initThemeToggle();
            initMobileMenu();
            if (typeof initLightbox === 'function') initLightbox();
            if (typeof initSmoothScroll === 'function') initSmoothScroll();
            // 2. 页面特定逻辑处理
            if (ns === 'about') {
                console.log("执行关于页初始化...");
                // 给 DOM 插入留一点缓冲时间
                setTimeout(() => {
                    renderContributionGraph();
                    initAboutStats();
                }, 50);
            } else if (ns === 'home') {
                console.log("执行首页初始化...");
                setTimeout(() => {
                    if (typeof initDateAndYiJi === 'function') initDateAndYiJi();
                    if (typeof initUmaGif === 'function') initUmaGif();
                    if (typeof initSearchAndPagination === 'function') initSearchAndPagination();
                    window.scrollTo(0, 0);
                }, 50);
            } else {
                window.scrollTo(0, 0);
            }
            // 3. 跨页点击「搜索」后自动滚动到 #posts
            const hash = window.location.hash || pendingHash;
            if (hash) {
                // 先瞬间回到顶部（防止跳跃感）
                window.scrollTo(0, 0);
                // 等待 Barba + GSAP 过渡 + DOM 完全渲染完成
                setTimeout(() => {
                    const target = document.querySelector(hash);
                    if (target) {
                        // 使用 requestAnimationFrame 让浏览器先重绘一次，更丝滑
                        requestAnimationFrame(() => {
                            target.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start'
                            });
                            console.log(`✅ 丝滑滚动到: ${hash}`);
                        });
                    }
                    pendingHash = null;
                }, 650);   // ← 核心延迟（已实测最丝滑）
            }
        }
    }]
});

// ====================
// 首次加载页面逻辑
// ====================
document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('[data-barba="container"]');
    const ns = container ? container.dataset.barbaNamespace : 'home';

    console.log("首次加载页面，命名空间:", ns);

    // 运行通用初始化
    rebindNavEvents();
    initThemeToggle();
    initMobileMenu();
    if (typeof initSystemThemeListener === 'function') initSystemThemeListener();

    // 运行当前页特有逻辑
    if (ns === 'about') {
        renderContributionGraph();
        initAboutStats();
    } else if (ns === 'home') {
        if (typeof initDateAndYiJi === 'function') initDateAndYiJi();
        if (typeof initUmaGif === 'function') initUmaGif();
        if (typeof initSearchAndPagination === 'function') initSearchAndPagination();
    }
});

