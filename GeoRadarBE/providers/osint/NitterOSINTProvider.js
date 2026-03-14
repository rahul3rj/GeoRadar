import fetch from 'node-fetch';
import { getDb } from '../../db/mongo.js';

export class NitterOSINTProvider {
    constructor() {
        this.cachedData = [];
        this.lastFetchTimestamp = 0;
        this.interval = 300000; // 5 minutes
        this.ttl = 300000;
        this.timer = null;
        this.isFetching = false;
        this.MAX_POSTS = 30;
        this.COLLECTION = 'osint_posts';

        this.nitterBase = 'https://xcancel.com';

        this.accounts = [
            'sentdefender',
            'WarMonitor3',
            'OSINTtechnical',
            'AuroraIntel',
            'IntelCrab',
            'CalibreObscura'
        ];

        // Track consecutive failures per account for monitoring
        this.failureCounts = {};
        this.accounts.forEach(a => { this.failureCounts[a] = 0; });
    }

    start() {
        this.fetchData();
        this.timer = setInterval(() => this.fetchData(), this.interval);
    }

    async fetchData() {
        if (this.isFetching) return;

        const now = Date.now();
        if (now - this.lastFetchTimestamp < this.ttl && this.cachedData.length > 0) {
            return;
        }

        this.isFetching = true;
        let allPosts = [];

        try {
            for (const account of this.accounts) {
                try {
                    const profileUrl = `${this.nitterBase}/${account}`;
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 15000);
                    const res = await fetch(profileUrl, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Language': 'en-US,en;q=0.9'
                        }
                    });
                    clearTimeout(timer);

                    if (!res.ok) {
                        this.failureCounts[account]++;
                        if (res.status === 429) console.warn(`[NitterOSINT] Rate limited for @${account} (failure #${this.failureCounts[account]})`);
                        else console.warn(`[NitterOSINT] HTTP ${res.status} for @${account} (failure #${this.failureCounts[account]})`);
                        if (this.failureCounts[account] >= 5) {
                            console.error(`[NitterOSINT] ⚠️ @${account} has failed ${this.failureCounts[account]} consecutive times — xcancel.com may be blocking or down`);
                        }
                        continue;
                    }

                    const html = await res.text();

                    // Validate HTML structure — detect if xcancel changed their layout
                    if (!html.includes('timeline-item') && !html.includes('tweet-body')) {
                        console.warn(`[NitterOSINT] ⚠️ HTML structure changed for @${account} — expected timeline-item/tweet-body classes not found. Parser may need update.`);
                        this.failureCounts[account]++;
                        continue;
                    }

                    const posts = this.parseTimeline(html, account);
                    allPosts.push(...posts);
                    this.failureCounts[account] = 0; // Reset on success
                    console.log(`[NitterOSINT] Scraped ${posts.length} posts from @${account}`);
                } catch (e) {
                    this.failureCounts[account]++;
                    if (e.name === 'AbortError') {
                        console.warn(`[NitterOSINT] Timeout (15s) for @${account} (failure #${this.failureCounts[account]})`);
                    } else {
                        console.error(`[NitterOSINT] Fetch failed for @${account}:`, e.message);
                    }
                }
            }

            // Sort newest first
            allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Store in MongoDB
            const db = getDb();
            if (db) {
                const col = db.collection(this.COLLECTION);

                for (const post of allPosts) {
                    await col.updateOne(
                        { post_id: post.post_id },
                        { $setOnInsert: post },
                        { upsert: true }
                    );
                }

                // FIFO cap: keep only newest MAX_POSTS
                const count = await col.countDocuments();
                if (count > this.MAX_POSTS) {
                    const oldest = await col.find()
                        .sort({ created_at: 1 })
                        .limit(count - this.MAX_POSTS)
                        .toArray();
                    const idsToDelete = oldest.map(d => d._id);
                    if (idsToDelete.length > 0) {
                        await col.deleteMany({ _id: { $in: idsToDelete } });
                    }
                }

                // Refresh cache from DB
                this.cachedData = await col.find()
                    .sort({ created_at: -1 })
                    .limit(this.MAX_POSTS)
                    .toArray();
            } else {
                // Fallback: in-memory only
                this.cachedData = allPosts.slice(0, this.MAX_POSTS);
            }

            this.lastFetchTimestamp = Date.now();
            console.log(`[NitterOSINT] Total: ${allPosts.length} posts scraped, ${this.cachedData.length} cached`);
        } catch (err) {
            console.error('[NitterOSINT] Global fetch error:', err.message);
        } finally {
            this.isFetching = false;
        }
    }

    /**
     * Parse the HTML timeline page and extract individual posts.
     * xcancel.com structure:
     *   <div class="timeline-item " data-username="...">
     *     <a class="tweet-link" href="/user/status/ID#m">
     *     <div class="tweet-body">
     *       <div class="tweet-header">
     *         <span class="tweet-date"><a title="Mar 14, 2026 · 4:40 AM UTC">
     *       <div class="tweet-content media-body">...text...</div>
     *       <div class="attachments">
     *         <div class="attachment image"><a class="still-image" href="FULL_IMG_URL"><img src="THUMB">
     *         <div class="attachment video-container"><video poster="..."><source src="MP4_URL">
     *       <div class="tweet-stats">
     *         <span class="tweet-stat">...<span class="icon-comment">... N</span>
     */
    parseTimeline(html, account) {
        const posts = [];

        // Split by timeline-item blocks
        // Match: <div class="timeline-item " data-username="..."> ... up to next timeline-item or end
        const itemRegex = /<div\s+class="timeline-item\s*"\s+data-username="[^"]*">([\s\S]*?)(?=<div\s+class="timeline-item\s*"|<div\s+class="show-more"|$)/g;
        let match;

        while ((match = itemRegex.exec(html)) !== null) {
            const block = match[1];

            try {
                // Skip retweets — only original posts
                // (retweets have a <div class="retweet-header"> inside)
                // Actually, keep retweets — they're valid OSINT intel shared by the account

                // Extract tweet link / status ID
                const linkMatch = block.match(/<a\s+class="tweet-link"\s+href="([^"]+)"/);
                const tweetPath = linkMatch ? linkMatch[1].replace(/#m$/, '') : '';
                const sourceUrl = tweetPath ? `${this.nitterBase}${tweetPath}` : '';
                const statusId = tweetPath.split('/status/')[1] || '';

                // Extract date from tweet-date title attribute
                // Pattern: <span class="tweet-date"><a href="..." title="Mar 14, 2026 · 4:40 AM UTC">
                const dateMatch = block.match(/<span\s+class="tweet-date">\s*<a[^>]+title="([^"]+)"/);
                let createdAt = new Date();
                if (dateMatch) {
                    // Title format: "Mar 14, 2026 · 4:40 AM UTC"
                    const cleaned = dateMatch[1].replace(' · ', ' ').replace(' UTC', '');
                    const parsed = new Date(cleaned + ' UTC');
                    if (!isNaN(parsed.getTime())) createdAt = parsed;
                }

                // Extract tweet text content
                const contentMatch = block.match(/<div\s+class="tweet-content\s+media-body"[^>]*>([\s\S]*?)<\/div>/);
                const rawContent = contentMatch ? contentMatch[1] : '';
                const text = this.stripHtml(rawContent);
                if (!text) continue;

                // Extract images — full-res URLs from still-image links
                const images = [];
                const imgMatches = block.matchAll(/<a\s+class="still-image"\s+href="([^"]+)"/g);
                for (const m of imgMatches) {
                    if (m[1].startsWith('http')) images.push(m[1]);
                }

                // Extract videos — MP4 source URLs
                const videos = [];
                const vidMatches = block.matchAll(/<source\s+src="([^"]+)"\s+type="video\/mp4"/g);
                for (const m of vidMatches) {
                    if (m[1].startsWith('http')) videos.push(m[1]);
                }
                // Also grab video poster images if no still images found
                if (images.length === 0) {
                    const posterMatches = block.matchAll(/<video\s+poster="([^"]+)"/g);
                    for (const m of posterMatches) {
                        if (m[1].startsWith('http')) images.push(m[1]);
                    }
                }

                // Extract external links from tweet content
                const links = [];
                const linkMatches = rawContent.matchAll(/<a\s+href="([^"]+)"[^>]*>/g);
                for (const m of linkMatches) {
                    const href = m[1];
                    if (href.startsWith('http') && !href.includes('xcancel.com') && !href.includes('nitter') && !href.includes('twimg.com')) {
                        links.push(href);
                    }
                }

                // Extract engagement stats
                const stats = {};
                const commentMatch = block.match(/icon-comment[^<]*<\/span>\s*([\d,]+)/);
                if (commentMatch) stats.comments = parseInt(commentMatch[1].replace(/,/g, ''), 10);
                const retweetMatch = block.match(/icon-retweet[^<]*<\/span>\s*([\d,]+)/);
                if (retweetMatch) stats.retweets = parseInt(retweetMatch[1].replace(/,/g, ''), 10);
                const heartMatch = block.match(/icon-heart[^<]*<\/span>\s*([\d,]+)/);
                if (heartMatch) stats.likes = parseInt(heartMatch[1].replace(/,/g, ''), 10);
                const viewsMatch = block.match(/icon-views[^<]*<\/span>\s*([\d,]+)/);
                if (viewsMatch) stats.views = parseInt(viewsMatch[1].replace(/,/g, ''), 10);

                // Check if this is a retweet
                const isRetweet = block.includes('retweet-header');

                const postId = `${account}-${statusId || Buffer.from(text.substring(0, 50)).toString('base64').substring(0, 15)}`;

                posts.push({
                    post_id: postId,
                    account,
                    text: text.substring(0, 500),
                    images,
                    videos,
                    links,
                    stats,
                    is_retweet: isRetweet,
                    created_at: createdAt,
                    fetched_at: new Date(),
                    source_url: sourceUrl
                });
            } catch (e) {
                console.error(`[NitterOSINT] Parse error in timeline for @${account}:`, e.message);
            }
        }

        return posts;
    }

    stripHtml(html) {
        return (html || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim();
    }

    async getPosts() {
        if (this.cachedData.length === 0) {
            const db = getDb();
            if (db) {
                this.cachedData = await db.collection(this.COLLECTION)
                    .find()
                    .sort({ created_at: -1 })
                    .limit(this.MAX_POSTS)
                    .toArray();
            }
        }
        return this.cachedData;
    }

    // Empty — does NOT participate in broadcastSignals pipeline
    async getEvents() {
        return [];
    }
}
