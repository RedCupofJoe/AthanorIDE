# Open-source marketplace

The marketplace is a local-first view over public npm registry search and OSV.dev advisory
data. It has ten topic groups aligned with the current node catalog. The first provider
implementation discovers up to 100 npm packages per topic, requests trailing 90-day
downloads, then checks each exact package version through OSV's batch API. Advisory detail
includes identifiers, aliases, reported severity, affected/fixed version information, and
the source URL when provided.

## Refresh and offline use

The browser stores a schema-versioned snapshot in IndexedDB. If IndexedDB is unavailable,
the app attempts a localStorage fallback. On app launch, Athanor checks the snapshot age and
requests an update when it is missing or at least 24 hours old. While the app stays open it
checks again every 24 hours. Refresh failures leave the prior snapshot visible. Refresh is
also available manually on `/marketplace`.

Updating requires the local FastAPI service and an internet connection to the npm registry,
npm downloads API, and OSV.dev. No model, token, or external account is required. The API
does not persist the catalog; the browser snapshot is the offline cache.

## Ranking and data quality

The intended weights are 40% trailing 90-day downloads, 30% community rating, and 30%
version-specific advisory risk. Available components are normalized when data is missing.
The npm provider does not publish consumer review ratings through its search API, so rating
is shown as unavailable and is excluded from scoring; registry quality is not mislabeled as
a user rating. Download or advisory lookup failures are also marked unavailable rather than
treated as zero. Advisory findings apply only to the listed package version at its check
time; a clean lookup does not establish that a package is safe.

The first provider is npm-only. Python package, model-hub, source-hosting, and other
ecosystems need source adapters before their projects can appear. Topic search results are
public registry matches, not security endorsements, and the registry may return fewer than
100 suitable results in a topic.

## API

- `GET /api/v1/marketplace/topics` returns the local topic definitions.
- `POST /api/v1/marketplace/refresh` refreshes candidate metadata and advisory matches.

The refresh service uses bounded worker threads and request timeouts. It can take longer
than local graph validation because each package's downloads are fetched from the public
npm statistics endpoint. If the API is unavailable, browsing the last browser-cached
snapshot remains local.
