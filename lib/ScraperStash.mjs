import {SubredditScraper} from './SubredditScraper.mjs'

export const ScraperStash = function(
  {
    linkCache,
    expectedConsecutiveBrokenLinks,
    maxConsecutiveBrokenLinks,
  }
) {
  this._linkCache = linkCache
  this._expectedConsecutiveBrokenLinks = expectedConsecutiveBrokenLinks
  this._maxConsecutiveBrokenLinks = maxConsecutiveBrokenLinks
  this._scraperBySorting = new Map()
}

ScraperStash.prototype.get = function(
  {
    subreddit,
    method,
    period,
  }
) {
  for (const [sorting, scraper] of this._scraperBySorting) {
    if (
      sorting.subreddit === subreddit
      && sorting.method === method
      && sorting.period === period
    ) {
      return scraper
    }
  }
  const scraper = new SubredditScraper({
    subreddit,
    method,
    period,
    linkCache: this._linkCache,
    expectedConsecutiveBrokenLinks: this._expectedConsecutiveBrokenLinks,
    maxConsecutiveBrokenLinks: this._maxConsecutiveBrokenLinks,
  })
  this._scraperBySorting.set({subreddit, method, period}, scraper)
  return scraper
}
