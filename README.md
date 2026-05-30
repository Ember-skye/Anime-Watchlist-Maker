# Anime-Watchlist-Maker
It’s a single-page **Anime Watchlist Maker** app built with plain HTML, CSS, and JavaScript.

The app lets users search AniList for anime, view details like cover art, score, episodes, duration, genres, description, trailer/banner, and AniList link, then save personal watchlist entries with status, watched episode progress, score, and notes.

Main features:
- **Discovery page** with AniList search and anime detail view.
- **Suggested for You** section using saved-list genres to fetch recommendations.
- **My List page** with search, status filter, sorting, continue-watching cards, full anime library, stats, and top favorites.
- **Local persistence** using `localStorage`.
- **Import/export** watchlist JSON.
- **Favorites** system capped at 10 top anime, with favorite toggles directly on saved anime cards.
- **Responsive UI** with adaptive anime card grids and scrollable saved-anime library.

Key files:
- `index.html`: page structure and controls.
- `styles.css`: dark neon responsive UI, cards, grids, dashboard, scroll areas.
- `script.js`: AniList API calls, localStorage watchlist/favorites, rendering, filters, stats, recommendations, import/export.
