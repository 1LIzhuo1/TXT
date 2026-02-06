interface Env {
  SEARCH_PROVIDER: string;
  SERPAPI_KEY: string;
  GOOGLE_CSE_ID: string;
  GOOGLE_API_KEY: string;
}

type SearchResult = {
  title: string;
  author: string;
  sourceUrl?: string;
  gutenbergId?: string;
};

type ApiResponse = {
  ok: boolean;
  message: string;
  downloadUrl?: string;
  preview?: string;
};

const htmlTemplate = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>小说搜索与TXT下载</title>
  <style>
    body { font-family: "Noto Sans SC", system-ui, sans-serif; margin: 2rem; color: #1b1b1b; }
    h1 { font-size: 1.8rem; margin-bottom: 0.5rem; }
    form { display: grid; gap: 1rem; max-width: 680px; }
    label { font-weight: 600; }
    input, textarea, select, button { font-size: 1rem; padding: 0.6rem; border-radius: 8px; border: 1px solid #ccd3da; }
    button { background: #0b5fff; color: white; border: none; cursor: pointer; }
    button:disabled { background: #9db9ff; cursor: not-allowed; }
    .result { margin-top: 1.5rem; padding: 1rem; border: 1px solid #e1e5ea; border-radius: 8px; background: #fafbfc; }
    .muted { color: #5f6b7a; font-size: 0.95rem; }
    code { background: #eef2f6; padding: 0.1rem 0.3rem; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>小说搜索与TXT下载</h1>
  <p class="muted">填写书名和作者，系统会尝试自动检索公开来源并整理为可下载的TXT格式。如果无法命中，建议填写已知的公开文本链接。</p>
  <form id="search-form">
    <div>
      <label for="title">书名</label>
      <input id="title" name="title" placeholder="例如：三体" required />
    </div>
    <div>
      <label for="author">作者</label>
      <input id="author" name="author" placeholder="例如：刘慈欣" required />
    </div>
    <div>
      <label for="sourceUrl">公开文本链接（可选）</label>
      <input id="sourceUrl" name="sourceUrl" placeholder="https://..." />
      <div class="muted">如果你已知具体章节/整本书的公开文本链接，可直接填写，系统将直接抓取并整理。</div>
    </div>
    <button type="submit">开始搜索并生成TXT</button>
  </form>
  <div id="result" class="result" hidden></div>
  <script>
    const form = document.getElementById('search-form');
    const result = document.getElementById('result');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      result.hidden = false;
      result.textContent = '正在搜索与整理，请稍候...';
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      try {
        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (data.ok) {
          result.innerHTML = `<p>${data.message}</p>` +
            `<p><a href="${data.downloadUrl}" target="_blank">点击下载TXT</a></p>` +
            `<pre style="white-space: pre-wrap;">${data.preview}</pre>`;
        } else {
          result.innerHTML = `<p>${data.message}</p>`;
        }
      } catch (error) {
        result.textContent = '请求失败，请稍后重试。';
      }
    });
  </script>
</body>
</html>`;

const decoder = new TextDecoder();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response(htmlTemplate, {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }

    if (url.pathname === '/api/search' && request.method === 'POST') {
      const body = (await request.json()) as { title?: string; author?: string; sourceUrl?: string };
      const title = (body.title ?? '').trim();
      const author = (body.author ?? '').trim();
      const sourceUrl = (body.sourceUrl ?? '').trim();

      if (!title || !author) {
        return jsonResponse({
          ok: false,
          message: '请填写书名和作者。'
        });
      }

      const results = await searchBook({ title, author, sourceUrl }, env);
      if (!results) {
        return jsonResponse({
          ok: false,
          message: '暂时没有找到可用的公开文本来源，请尝试补充公开链接。'
        });
      }

      const { text, filename } = await fetchBookText(results);
      if (!text) {
        return jsonResponse({
          ok: false,
          message: '抓取到的文本为空，请尝试其他公开链接。'
        });
      }

      const cleaned = normalizeText(text, results.title, results.author);
      const downloadKey = encodeURIComponent(`${results.title}-${results.author}.txt`);
      const downloadUrl = `/api/download?name=${downloadKey}&source=${encodeURIComponent(results.sourceUrl ?? '')}`;

      return jsonResponse({
        ok: true,
        message: `已整理完成：${results.title} - ${results.author}`,
        downloadUrl,
        preview: cleaned.slice(0, 1200)
      });
    }

    if (url.pathname === '/api/download' && request.method === 'GET') {
      const name = url.searchParams.get('name') ?? 'novel.txt';
      const source = url.searchParams.get('source') ?? '';
      if (!source) {
        return new Response('缺少来源链接，无法下载。', { status: 400 });
      }
      const response = await fetch(source, { redirect: 'follow' });
      if (!response.ok) {
        return new Response('下载失败，请检查来源链接。', { status: 502 });
      }
      const rawText = decoder.decode(await response.arrayBuffer());
      const cleaned = normalizeText(rawText, '', '');
      return new Response(cleaned, {
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'content-disposition': `attachment; filename*=UTF-8''${name}`
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function searchBook(
  input: { title: string; author: string; sourceUrl?: string },
  env: Env
): Promise<SearchResult | null> {
  if (input.sourceUrl) {
    return {
      title: input.title,
      author: input.author,
      sourceUrl: input.sourceUrl
    };
  }

  if (env.SEARCH_PROVIDER === 'openlibrary') {
    const query = new URLSearchParams({
      title: input.title,
      author: input.author
    });
    const response = await fetch(`https://openlibrary.org/search.json?${query.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      docs: Array<{ title: string; author_name?: string[]; gutenberg_id?: string[] }>;
    };
    const first = data.docs.find((doc) => doc.gutenberg_id && doc.gutenberg_id.length > 0);
    if (!first) return null;
    const gutenbergId = first.gutenberg_id?.[0];
    if (!gutenbergId) return null;
    return {
      title: first.title,
      author: first.author_name?.[0] ?? input.author,
      gutenbergId,
      sourceUrl: `https://www.gutenberg.org/cache/epub/${gutenbergId}/pg${gutenbergId}.txt`
    };
  }

  if (env.SEARCH_PROVIDER === 'serpapi' && env.SERPAPI_KEY) {
    const query = encodeURIComponent(`${input.title} ${input.author} txt`);
    const response = await fetch(
      `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${env.SERPAPI_KEY}`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { organic_results?: Array<{ link: string; title: string }> };
    const first = data.organic_results?.find((item) => item.link?.endsWith('.txt'));
    if (!first) return null;
    return {
      title: input.title,
      author: input.author,
      sourceUrl: first.link
    };
  }

  if (env.SEARCH_PROVIDER === 'google_cse' && env.GOOGLE_API_KEY && env.GOOGLE_CSE_ID) {
    const query = encodeURIComponent(`${input.title} ${input.author} txt`);
    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CSE_ID}&q=${query}`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { items?: Array<{ link: string; title: string }> };
    const first = data.items?.find((item) => item.link?.endsWith('.txt'));
    if (!first) return null;
    return {
      title: input.title,
      author: input.author,
      sourceUrl: first.link
    };
  }

  return null;
}

async function fetchBookText(result: SearchResult): Promise<{ text: string; filename: string }> {
  if (!result.sourceUrl) {
    return { text: '', filename: 'novel.txt' };
  }
  const response = await fetch(result.sourceUrl, { redirect: 'follow' });
  if (!response.ok) {
    return { text: '', filename: 'novel.txt' };
  }
  const text = decoder.decode(await response.arrayBuffer());
  return { text, filename: `${result.title}-${result.author}.txt` };
}

function normalizeText(text: string, title: string, author: string): string {
  let output = text.replace(/\r/g, '');

  const startMatch = output.match(/\*\*\* START OF[\s\S]*?\*\*\*/i);
  const endMatch = output.match(/\*\*\* END OF[\s\S]*?\*\*\*/i);
  if (startMatch) {
    output = output.slice(startMatch.index! + startMatch[0].length);
  }
  if (endMatch) {
    output = output.slice(0, endMatch.index);
  }

  output = output
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const header = [title, author].filter(Boolean).join(' - ');
  if (header) {
    output = `${header}\n\n${output}`;
  }

  return output;
}

function jsonResponse(payload: ApiResponse): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
