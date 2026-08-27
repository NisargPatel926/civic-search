import { config } from '../config.js';
import { cached } from '../cache.js';
import { fetchJson, qs, UpstreamError } from '../http.js';

const NEWS_ENDPOINT = 'https://newsapi.org/v2/everything';

/**
 * NewsAPI's developer tier rejects `from` dates older than about a month with a
 * 426. Clamp instead of failing, and tell the caller we clamped.
 */
function clampRange({ from, to }) {
  const notes = [];
  const max = config.newsMaxLookbackDays;
  let fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (max > 0 && fromDate) {
    const earliest = new Date(Date.now() - max * 24 * 60 * 60 * 1000);
    if (fromDate < earliest) {
      fromDate = earliest;
      notes.push(
        `NewsAPI's developer plan only serves the last ${max} days, so articles were narrowed to that window.`
      );
    }
  }
  return {
    from: fromDate ? fromDate.toISOString().slice(0, 10) : undefined,
    to: toDate ? toDate.toISOString().slice(0, 10) : undefined,
    notes
  };
}

function normalize(article, topic) {
  return {
    id: `a:${topic.id}:${Buffer.from(article.url || article.title || Math.random().toString()).toString('base64url').slice(0, 16)}`,
    topicId: topic.id,
    title: article.title || 'Untitled',
    source: article.source?.name || 'Unknown source',
    author: article.author || null,
    url: article.url,
    publishedAt: article.publishedAt || null,
    summary: article.description || article.content || '',
    image: article.urlToImage || null,
    sample: false
  };
}

function sampleArticles(topic, range) {
  const search = `https://news.google.com/search?q=${encodeURIComponent(topic.label)}`;
  const window =
    range.from && range.to ? `${range.from} → ${range.to}` : 'your selected window';
  return [
    {
      id: `a:${topic.id}:sample-1`,
      topicId: topic.id,
      title: `Live coverage of ${topic.label.toLowerCase()} needs a NewsAPI key`,
      source: topic.label,
      author: null,
      url: search,
      publishedAt: null,
      summary: `Add NEWS_API_KEY to your .env and restart the server to pull real reporting on ${topic.label.toLowerCase()} for ${window}. This placeholder links to an open news search in the meantime.`,
      image: null,
      sample: true
    },
    {
      id: `a:${topic.id}:sample-2`,
      topicId: topic.id,
      title: `Background reading: ${topic.blurb}`,
      source: topic.label,
      author: null,
      url: search,
      publishedAt: null,
      summary: `Once connected, this column shows the most recent ${topic.label.toLowerCase()} reporting matching your date range, newest first.`,
      image: null,
      sample: true
    }
  ];
}

/** Articles for one topic within a date range. Never throws. */
export async function fetchArticles(topic, { from, to, pageSize = 6, sortBy = 'publishedAt' }) {
  const range = clampRange({ from, to });
  const notices = [...range.notes];

  if (!config.keys.news) {
    return {
      articles: sampleArticles(topic, range),
      notices: [],
      degraded: true,
      reason: 'no-key'
    };
  }

  const url = `${NEWS_ENDPOINT}?${qs({
    q: topic.news,
    from: range.from,
    to: range.to,
    language: 'en',
    sortBy,
    pageSize
  })}`;

  try {
    const body = await cached(`news:${url}`, () =>
      fetchJson('NewsAPI', url, { headers: { 'X-Api-Key': config.keys.news } })
    );
    const articles = (body?.articles || [])
      .filter((a) => a.title && a.title !== '[Removed]')
      .map((a) => normalize(a, topic));
    if (!articles.length) {
      notices.push(`No ${topic.label.toLowerCase()} articles matched that date range.`);
    }
    return { articles, notices, degraded: false, total: body?.totalResults ?? articles.length };
  } catch (err) {
    const status = err instanceof UpstreamError ? err.status : 0;
    const hint =
      status === 401
        ? 'NewsAPI rejected the key — check NEWS_API_KEY.'
        : status === 429
          ? 'NewsAPI rate limit reached; try again shortly.'
          : status === 426
            ? 'NewsAPI refused this date range for the current plan.'
            : err.message;
    return {
      articles: sampleArticles(topic, range),
      notices: [...notices, hint],
      degraded: true,
      reason: 'error'
    };
  }
}

export async function fetchArticlesForTopics(topics, range) {
  const results = await Promise.all(topics.map((t) => fetchArticles(t, range)));
  return {
    articles: results.flatMap((r) => r.articles),
    notices: [...new Set(results.flatMap((r) => r.notices))],
    degraded: results.some((r) => r.degraded)
  };
}
