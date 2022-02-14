import * as Option from './types/Option.mjs'
import * as Outcome from './types/Outcome.mjs'

export const SubredditCrawler = function(
  {
    subreddit,
    method,
    period,
  }
) {
  this._subreddit = subreddit
  this._method = method
  this._period = period
  this._articles = []
  this._listing = []
  this._after = ''
}

SubredditCrawler.prototype.getArticle = async function(index) {
  while (index >= this._articles.length) {
    const nextArticleIndex = this._articles.length
    const asyncScrapeNextArticle = async () => {
      if (nextArticleIndex > 0) {
        const scrapingLastArticle = await this._articles[nextArticleIndex - 1]
        if (scrapingLastArticle.isFailure()) {
          return Outcome.Failure()
        }
      }
      return this._scrapeNewArticle()
    }
    this._articles.push(asyncScrapeNextArticle())
  }
  return this._articles[index]
}

SubredditCrawler.prototype._scrapeNewArticle = async function() {
  if (!this._listing.length) {
    const listingFetching = await this._fetchNewListing()
    if (listingFetching.isFailure()) {
      return Outcome.Failure()
    }
  }
  const listingItem = this._listing.shift()
  const article = {
    permalink: `https://www.reddit.com${listingItem.permalink}`,
    url: listingItem.url,
    subreddit: listingItem.subreddit,
    title: listingItem.title,
    date: new Date(listingItem.created_utc * 1000),
    author: listingItem.author,
    flair: listingItem.author_flair_text,
    upvotes: listingItem.ups,
    awards: listingItem.total_awards_received
      ? Option.Some(listingItem.total_awards_received)
      : Option.None(),
    thumbnail: listingItem.thumbnail,
  }
  article._type = this._determineArticleType(article.url)
  if (article._type === 'vreddit') {
    article._vredditSrc = listingItem.media.reddit_video.fallback_url
  }
  return Outcome.Success(article)
}

SubredditCrawler.prototype._fetchNewListing = async function() {
  let request_failed = false
  const url = `https://www.reddit.com` +
    `/r/${this._subreddit}/${this._method}.json` +
    `?after=${this._after}&limit=100&t=${this._period}`
  const response = await fetch(url).catch(_ => request_failed = true)
  if (request_failed || !response.ok) {
    return Outcome.Failure()
  }
  const newListing = (await response.json()).data.children
  this._listing = newListing.map(child => child.data)
    .filter(data => this._isValidArticleType(data.url))
    .filter(data => data.media || !this._isOfArticleType(data.url, 'vreddit'))
  if (!this._listing.length) {
    return Outcome.Failure()
  }
  this._after = newListing[newListing.length - 1].data.name
  return Outcome.Success()
}

SubredditCrawler.prototype._urlRegexsByArticleType = new Map()
SubredditCrawler.prototype._urlRegexsByArticleType.set(
  'image',
  [/\.jpg$/, /\.jpeg$/, /\.png$/, /\.gif$/],
)
SubredditCrawler.prototype._urlRegexsByArticleType.set(
  'imgur-gifv',
  [/\.gifv$/],
)
SubredditCrawler.prototype._urlRegexsByArticleType.set(
  'vreddit',
  [/\/\/v\.redd\.it\//],
)
SubredditCrawler.prototype._urlRegexsByArticleType.set(
  'gfycat',
  [/gfycat\.com\/[A-Za-z]+$/, /gfycat\.com\/gifs\/detail\/[A-Za-z]+$/],
)
SubredditCrawler.prototype._urlRegexsByArticleType.set(
  'redgifs',
  [/redgifs\.com\/watch\/[A-Za-z]+$/],
)

SubredditCrawler.prototype._isValidArticleType = function(url) {
  return [...this._urlRegexsByArticleType.values()].flat()
    .some(regex => regex.test(url))
}

SubredditCrawler.prototype._isOfArticleType = function(url, articleType) {
  return this._urlRegexsByArticleType.get(articleType)
    .some(regex => regex.test(url))
}

SubredditCrawler.prototype._determineArticleType = function(url) {
  for (const [articleType, urlRegexs] of this._urlRegexsByArticleType) {
    if (urlRegexs.some(regex => regex.test(url))) {
      return articleType
    }
  }
}
