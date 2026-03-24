#!/usr/bin/env python3
"""
Convert markdown-exported HTML to blog post, and auto-update index.html.
Usage: python convert.py input.html output.html [--date YYYY-MM-DD] [--category CAT] [--tags TAG1 TAG2 ...] [--excerpt TEXT]
"""

import argparse
import copy
import os
from datetime import datetime
from bs4 import BeautifulSoup

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def extract_excerpt(soup, max_len=200):
    """从文章正文中提取摘要（去掉HTML标签，取第一个有意义的段落）"""
    body = soup.body
    if not body:
        return ""
    for child in body.children:
        if child.name == 'h1':
            continue
        if child.name == 'p':
            text = child.get_text(strip=True)
            if text:
                if len(text) > max_len:
                    text = text[:max_len] + "..."
                return text
    text = body.get_text(strip=True)
    if len(text) > max_len:
        text = text[:max_len] + "..."
    return text


def fix_posts_structure(soup):
    """
    修复文章列表结构：将 <section class="posts"> 内的非文章元素（如 tags-section）移出到该 section 之后，
    确保只保留 <h2 class="section-title">、<div class="search-box"> 和 <article class="post-item">。
    """
    posts_section = soup.find("section", class_="posts")
    if not posts_section:
        return

    allowed_tags = ['h2', 'article', 'div']
    to_move = []
    for child in list(posts_section.children):
        # 如果 child 是 div 但 class 是 search-box，则保留
        if child.name == 'div' and child.get('class') == ['search-box']:
            continue
        # 如果 child 不是允许的标签且不是空白文本（换行等），就移出
        if child.name not in allowed_tags and (child.name is not None or (isinstance(child, str) and child.strip())):
            to_move.append(child)

    if to_move:
        for elem in to_move:
            elem.extract()
        # 将移出的元素按原顺序插入到 posts 之后
        for elem in reversed(to_move):
            posts_section.insert_after(elem)
        print("已修复文章列表结构：将非文章元素移出")
    return posts_section


def update_index(index_path, article_info):
    """
    将新文章添加到主页文章列表（直接插入到最前面，紧跟在 <h2 class="section-title"> 之后）
    article_info: dict with keys: link, title, date, category, tags, excerpt
    """
    with open(index_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    # 修复结构并获取文章列表容器
    posts_section = fix_posts_structure(soup)
    if not posts_section:
        print("警告：未找到文章列表容器，请检查index.html结构")
        return

    # 检查是否已存在相同链接
    existing_links = posts_section.find_all("a", href=article_info["link"])
    if existing_links:
        print("文章链接已存在于主页，跳过添加")
        return

    # 构建新的文章条目
    article_tag = soup.new_tag("article", **{"class": "post-item"})

    # meta部分
    meta_div = soup.new_tag("div", **{"class": "post-meta"})
    time_tag = soup.new_tag("time", datetime=article_info["date"])
    time_tag.string = article_info["date"]
    meta_div.append(time_tag)
    category_span = soup.new_tag("span", **{"class": "post-category"})
    category_span.string = article_info["category"]
    meta_div.append(category_span)
    article_tag.append(meta_div)

    # 标题部分
    h3 = soup.new_tag("h3", **{"class": "post-title"})
    a = soup.new_tag("a", href=article_info["link"])
    a.string = article_info["title"]
    h3.append(a)
    article_tag.append(h3)

    # 摘要
    excerpt_p = soup.new_tag("p", **{"class": "post-excerpt"})
    excerpt_p.string = article_info["excerpt"]
    article_tag.append(excerpt_p)

    # 标签
    tags_div = soup.new_tag("div", **{"class": "post-tags"})
    for tag in article_info["tags"]:
        tag_a = soup.new_tag("a", href="#tags", **{"class": "tag"})
        tag_a.string = tag
        tags_div.append(tag_a)
    article_tag.append(tags_div)

    children = list(posts_section.children)

    # 找到标题节点（<h2 class="section-title">全部文章</h2>）的索引
    title_index = None
    for i, child in enumerate(children):
        if child.name == 'h2' and child.get('class') == ['section-title']:
            title_index = i
            break

    # 找到搜索框节点（<div class="search-box">）的索引
    search_box_index = None
    for i, child in enumerate(children):
        if child.name == 'div' and child.get('class') == ['search-box']:
            search_box_index = i
            break

    # 确定插入位置：优先使用搜索框后面，否则使用标题后面
    insert_index = search_box_index if search_box_index is not None else title_index

    if insert_index is not None:
        # 重新构建节点列表
        new_children = []

        # 1. 保留插入位置之前的所有节点
        new_children.extend(children[:insert_index + 1])

        # 2. 添加一个换行和缩进
        new_children.append(soup.new_string("\n        "))

        # 3. 添加新文章
        new_children.append(article_tag)

        # 4. 再添加一个换行和缩进
        new_children.append(soup.new_string("\n        "))

        # 5. 添加插入位置之后原有的所有节点
        new_children.extend(children[insert_index + 1:])

        # 清空原容器并填充新节点列表
        posts_section.clear()
        for child in new_children:
            posts_section.append(child)
    else:
        # 如果没有标题（意外情况），直接追加到末尾
        posts_section.append(article_tag)

    # 保存index.html
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(str(soup))

    print(f"已更新主页：{index_path}")


def convert(input_file, output_file, date=None, category="数学", tags=None, excerpt=None):
    if tags is None:
        tags = ["三维几何", "旋转变换", "镜像变换"]

    # 读取原始HTML（含LaTeX）
    with open(input_file, "r", encoding="utf-8") as f:
        src_soup = BeautifulSoup(f, "html.parser")

    # 提取文章标题（第一个h1）
    h1 = src_soup.find("h1")
    title = h1.get_text(strip=True) if h1 else "无标题"

    # 提取摘要（如果未提供则自动提取）
    if excerpt is None:
        excerpt = extract_excerpt(src_soup)

    # 读取模板（hello-world.html，假设与脚本同目录）
    template_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "posts/hello-world.html")
    with open(template_path, "r", encoding="utf-8") as f:
        tpl_soup = BeautifulSoup(f, "html.parser")

    # 保留KaTeX相关资源（复制链接和脚本）
    head = tpl_soup.head
    for link in src_soup.find_all("link", href=lambda x: x and "katex" in x):
        if not head.find("link", href=link["href"]):
            head.append(copy.copy(link))
    for script in src_soup.find_all("script", src=lambda x: x and "katex" in x):
        if not head.find("script", src=script["src"]):
            head.append(copy.copy(script))

    # 更新页面标题
    title_tag = tpl_soup.find("title")
    if title_tag:
        title_tag.string = f"{title} - YoungSimpleBoy 的博客"

    # 更新文章大标题
    article_title = tpl_soup.find("h1", class_="article-title")
    if article_title:
        article_title.string = title

    # 更新元数据
    time_tag = tpl_soup.find("time")
    if time_tag:
        date_str = date if date else datetime.now().strftime("%Y-%m-%d")
        time_tag["datetime"] = date_str
        time_tag.string = date_str

    category_tag = tpl_soup.find("span", class_="article-category")
    if category_tag:
        category_tag.string = category

    tags_container = tpl_soup.find("div", class_="article-tags")
    if tags_container:
        tags_container.clear()
        for t in tags:
            span = tpl_soup.new_tag("span", **{"class": "tag"})
            span.string = t
            tags_container.append(span)

    # 提取正文内容（跳过第一个h1，保留KaTeX脚本）
    body_children = list(src_soup.body.children)
    content_nodes = []
    script_nodes = []
    skipped_h1 = False

    for child in body_children:
        if not skipped_h1 and child.name == "h1":
            skipped_h1 = True
            continue
        # ==================== 新增：独立公式自动居中 ====================
        if child.name == "mjx-container":
            # 判断是否为独立一行公式（最常见情况：被 <p> 单独包裹）
            parent = child.parent
            is_block = False

            if parent and parent.name == "p":
                # 如果 <p> 里只有这个 mjx-container（或只有很少文字），视为独立公式
                if len(parent.find_all(recursive=False)) == 1:
                    is_block = True
            if is_block:
                wrapper = tpl_soup.new_tag("div", style="text-align: center; margin: 1.5em 0;")
                wrapper.append(copy.copy(child))
                content_nodes.append(wrapper)
            else:
                # 内联公式直接复制
                content_nodes.append(copy.copy(child))
            continue
        # 原来的 KaTeX script 处理
        if child.name == "script" and child.get("src") and "katex" in child.get("src"):
            script_nodes.append(copy.copy(child))
        elif child.name == "script":
            script_nodes.append(copy.copy(child))
        else:
            if isinstance(child, str):
                content_nodes.append(child)
            else:
                content_nodes.append(copy.copy(child))

    article_body = tpl_soup.find("div", class_="article-body")
    if article_body:
        article_body.clear()
        for node in content_nodes:
            article_body.append(node)

    for script in script_nodes:
        tpl_soup.body.append(script)

    # 添加主题切换按钮和脚本（如果模板中没有）
    nav_links = tpl_soup.find("ul", class_="nav-links")
    if nav_links and not nav_links.find("button", class_="theme-toggle"):
        li = tpl_soup.new_tag("li")
        btn = tpl_soup.new_tag("button", **{"class": "theme-toggle", "aria-label": "切换主题"})
        sun_svg = '''
        <svg class="sun-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        '''
        moon_svg = '''
        <svg class="moon-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
        '''
        btn.append(BeautifulSoup(sun_svg, "html.parser"))
        btn.append(BeautifulSoup(moon_svg, "html.parser"))
        li.append(btn)
        nav_links.append(li)

    # 给body添加id以便回到顶部功能
    if tpl_soup.body:
        tpl_soup.body["id"] = "top"

    # 修改导航栏中的"标签"链接为"回到顶部"
    for link in nav_links.find_all("a", class_="nav-link"):
        if link.get("href") and "#tags" in link.get("href"):
            link["href"] = "#top"
            link.string = "回到顶部"
    
    # 添加"关于"链接（如果不存在）
    about_exists = any(a.get("href") == "about.html" for a in nav_links.find_all("a", class_="nav-link"))
    if not about_exists:
        about_li = tpl_soup.new_tag("li")
        about_a = tpl_soup.new_tag("a", href="about.html", **{"class": "nav-link"})
        about_a.string = "关于"
        about_li.append(about_a)
        # 插入到"文章"和"搜索"之间
        links = nav_links.find_all("a", class_="nav-link")
        insert_pos = None
        for i, a in enumerate(links):
            if a.get("href") == "#top" or (a.get("href") and "posts" in a.get("href")):
                insert_pos = i + 1
                break
        if insert_pos:
            nav_links.insert(insert_pos, about_li)
        else:
            nav_links.append(about_li)

    # 主题切换脚本
    theme_script = tpl_soup.new_tag("script")
    theme_script.string = '''
    (function() {
        const toggle = document.querySelector('.theme-toggle');
        if (toggle) {
            toggle.addEventListener('click', () => {
                document.body.classList.toggle('light');
                localStorage.setItem('theme', document.body.classList.contains('light') ? 'light' : 'dark');
            });
            const saved = localStorage.getItem('theme');
            if (saved === 'light') {
                document.body.classList.add('light');
            }
        }
    })();
    '''
    tpl_soup.body.append(theme_script)

    # 写入输出文件
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(str(tpl_soup))

    print(f"转换完成：{output_file}")

    # 更新主页
    index_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "index.html")
    if os.path.exists(index_path):
        article_info = {
            "link": output_file.replace("\\", "/"),  # 相对路径（例如 posts/xxx.html）
            "title": title,
            "date": date_str,
            "category": category,
            "tags": tags,
            "excerpt": excerpt
        }
        update_index(index_path, article_info)
    else:
        print("警告：未找到index.html，跳过主页更新")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert markdown HTML to blog style and update index")
    parser.add_argument("input", help="Input HTML file (exported from markdown)")
    parser.add_argument("output", help="Output HTML file (relative path like posts/xxx.html)")
    parser.add_argument("--date", help="Post date (YYYY-MM-DD), default today")
    parser.add_argument("--category", default="综合", help="Article category")
    parser.add_argument("--tags", nargs="+", default=["笔记"], help="Article tags")
    parser.add_argument("--excerpt", help="Article excerpt (auto-generated if not provided)")
    args = parser.parse_args()

    convert(args.input, args.output, args.date, args.category, args.tags, args.excerpt)
