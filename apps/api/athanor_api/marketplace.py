"""Public npm catalog and OSV advisory integration for the local marketplace.

The backend stores no credentials or user data. Clients persist a versioned snapshot and
only call refresh when the snapshot is at least 24 hours old.
"""

from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from pydantic import BaseModel, ConfigDict, Field

MARKETPLACE_TOPICS: dict[str, str] = {
    "agent-frameworks": "Agent frameworks and orchestration",
    "mcp-tools": "MCP servers and tool integrations",
    "model-serving": "Model serving and inference runtimes",
    "rag-retrieval": "RAG and retrieval pipelines",
    "vector-databases": "Vector databases and search",
    "fine-tuning": "Fine-tuning and model adaptation",
    "computer-vision": "Computer vision",
    "multimodal-media": "Multimodal, audio, and video",
    "enterprise-integration": "Enterprise integration and data platforms",
    "security-observability": "Security, guardrails, and observability",
}
TOPIC_QUERIES: dict[str, str] = {
    "agent-frameworks": "agent workflow orchestration",
    "mcp-tools": "mcp server model context protocol",
    "model-serving": "llm inference model serving",
    "rag-retrieval": "retrieval augmented generation rag",
    "vector-databases": "vector database embedding search",
    "fine-tuning": "machine learning fine tuning lora",
    "computer-vision": "computer vision image classification",
    "multimodal-media": "multimodal audio video speech",
    "enterprise-integration": "data integration kafka database",
    "security-observability": "security observability tracing",
}


class MarketplaceAdvisory(BaseModel):
    id: str
    aliases: list[str] = Field(default_factory=list)
    summary: str = ""
    severity: str | None = None
    cvss_score: float | None = Field(default=None, alias="cvssScore")
    affected_range: str | None = Field(default=None, alias="affectedRange")
    fixed_versions: list[str] = Field(default_factory=list, alias="fixedVersions")
    url: str
    published_at: str | None = Field(default=None, alias="publishedAt")
    model_config = ConfigDict(populate_by_name=True)


class MarketplaceEntry(BaseModel):
    id: str
    topic: str
    name: str
    description: str
    ecosystem: Literal["npm"] = "npm"
    version: str
    license: str | None = None
    registry_url: str = Field(alias="registryUrl")
    repository_url: str | None = Field(default=None, alias="repositoryUrl")
    downloads_90d: int | None = Field(default=None, alias="downloads90d")
    rating: float | None = None
    rating_source: str | None = Field(default=None, alias="ratingSource")
    rating_count: int | None = Field(default=None, alias="ratingCount")
    advisories: list[MarketplaceAdvisory] = Field(default_factory=list)
    security_status: Literal["checked", "unavailable"] = Field(alias="securityStatus")
    score: float | None = None
    score_completeness: list[str] = Field(default_factory=list, alias="scoreCompleteness")
    checked_at: str = Field(alias="checkedAt")
    model_config = ConfigDict(populate_by_name=True)


class MarketplaceTopic(BaseModel):
    id: str
    label: str


class MarketplaceSnapshot(BaseModel):
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    refreshed_at: str = Field(alias="refreshedAt")
    source: str = "npm registry + OSV.dev"
    entries: list[MarketplaceEntry]
    unavailable_topics: list[str] = Field(default_factory=list, alias="unavailableTopics")
    model_config = ConfigDict(populate_by_name=True)


def _get_json(url: str, *, method: str = "GET", data: dict[str, object] | None = None) -> object:
    payload = json.dumps(data).encode() if data is not None else None
    request = Request(
        url,
        data=payload,
        method=method,
        headers={
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "AthanorIDE-local-marketplace/1.0",
        },
    )
    with urlopen(request, timeout=8) as response:
        return json.loads(response.read(8_000_001))


def _get_downloads(name: str, start: str, end: str) -> int | None:
    try:
        result = _get_json(
            f"https://api.npmjs.org/downloads/range/{start}:{end}/{quote(name, safe='@/')}"
        )
        if isinstance(result, dict):
            return int(result.get("downloads", 0))
    except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
        return None
    return None


def _get_advisory(advisory_id: str) -> dict[str, object] | None:
    result = _get_json(f"https://api.osv.dev/v1/vulns/{quote(advisory_id, safe='')}")
    return result if isinstance(result, dict) else None


def _risk(advisories: list[MarketplaceAdvisory]) -> float:
    if not advisories:
        return 0.0
    scores = [item.cvss_score for item in advisories if item.cvss_score is not None]
    if scores:
        return max(scores) / 10.0
    return 0.65


def _affected_versions(
    detail: dict[str, object], package_name: str
) -> tuple[str | None, list[str]]:
    ranges: list[str] = []
    fixed: set[str] = set()
    affected = detail.get("affected", [])
    if not isinstance(affected, list):
        return None, []
    for affected_record in affected:
        if not isinstance(affected_record, dict):
            continue
        package = affected_record.get("package")
        if (
            not isinstance(package, dict)
            or package.get("ecosystem") != "npm"
            or package.get("name") != package_name
        ):
            continue
        version_ranges = affected_record.get("ranges", [])
        if not isinstance(version_ranges, list):
            continue
        for version_range in version_ranges:
            events = version_range.get("events", []) if isinstance(version_range, dict) else []
            if not isinstance(events, list):
                continue
            start: str | None = None
            for event in events:
                if not isinstance(event, dict):
                    continue
                if isinstance(event.get("introduced"), str):
                    start = event["introduced"]
                elif isinstance(event.get("fixed"), str):
                    fixed.add(event["fixed"])
                    if start is not None:
                        ranges.append(f">={start}, <{event['fixed']}")
                        start = None
                elif isinstance(event.get("last_affected"), str):
                    ranges.append(f">={start or '0'}, <={event['last_affected']}")
                    start = None
            if start is not None:
                ranges.append(f">={start}")
    return (" OR ".join(ranges) or None, sorted(fixed))


def _rank(entries: list[MarketplaceEntry]) -> list[MarketplaceEntry]:
    downloads = [item.downloads_90d for item in entries if item.downloads_90d is not None]
    max_log = max((math.log1p(value) for value in downloads), default=0.0)
    for item in entries:
        components: list[tuple[float, float]] = []
        if item.downloads_90d is not None:
            value = math.log1p(item.downloads_90d) / max_log if max_log else 0.0
            components.append((0.40, value))
        if item.rating is not None:
            components.append((0.30, max(0.0, min(1.0, item.rating / 5.0))))
        if item.security_status == "checked":
            components.append((0.30, 1.0 - _risk(item.advisories)))
        total_weight = sum(weight for weight, _ in components)
        item.score_completeness = [
            name
            for name, available in (
                ("downloads90d", item.downloads_90d is not None),
                ("rating", item.rating is not None),
                ("cveRisk", item.security_status == "checked"),
            )
            if available
        ]
        item.score = (
            round(sum(weight * value for weight, value in components) / total_weight, 4)
            if total_weight
            else None
        )
    return sorted(entries, key=lambda item: (item.score is not None, item.score or 0), reverse=True)


def refresh_marketplace() -> MarketplaceSnapshot:
    """Fetch up to 100 npm candidates per topic and enrich exact package versions with OSV."""

    now = datetime.now(UTC)
    start = (now.date() - timedelta(days=90)).isoformat()
    end = now.date().isoformat()
    checked_at = now.isoformat()
    unavailable: list[str] = []
    raw_candidates: list[tuple[str, dict[str, object], dict[str, object]]] = []
    for topic, query in TOPIC_QUERIES.items():
        try:
            response = _get_json(
                "https://registry.npmjs.org/-/v1/search?" + urlencode({"text": query, "size": 100})
            )
            objects = response.get("objects", []) if isinstance(response, dict) else []
            for record in objects:
                if not isinstance(record, dict):
                    continue
                package = record.get("package")
                score = record.get("score")
                if (
                    isinstance(package, dict)
                    and isinstance(score, dict)
                    and isinstance(package.get("name"), str)
                    and isinstance(package.get("version"), str)
                ):
                    raw_candidates.append((topic, package, score))
        except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
            unavailable.append(topic)

    # De-duplicate requests when search terms return the same npm package.
    unique_names = list(
        dict.fromkeys(
            str(package["name"])
            for _, package, _ in raw_candidates
            if isinstance(package.get("name"), str)
        )
    )
    downloads: dict[str, int | None] = {}
    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="athanor-market") as pool:
        download_futures = {
            pool.submit(_get_downloads, name, start, end): name for name in unique_names
        }
        for download_future in as_completed(download_futures):
            downloads[download_futures[download_future]] = download_future.result()

    query_items = []
    for _topic, package, _ in raw_candidates:
        name, version = package.get("name"), package.get("version")
        if isinstance(name, str) and isinstance(version, str):
            query_items.append({"package": {"ecosystem": "npm", "name": name}, "version": version})
    vulnerabilities: list[list[dict[str, object]]] = [[] for _ in query_items]
    security_checked = [False for _ in query_items]
    for offset in range(0, len(query_items), 1000):
        batch = query_items[offset : offset + 1000]
        try:
            result = _get_json(
                "https://api.osv.dev/v1/querybatch", method="POST", data={"queries": batch}
            )
            if isinstance(result, dict) and isinstance(result.get("results"), list):
                for local_index, result_item in enumerate(result["results"]):
                    security_checked[offset + local_index] = True
                    if isinstance(result_item, dict) and isinstance(result_item.get("vulns"), list):
                        vulnerabilities[offset + local_index] = [
                            v for v in result_item["vulns"] if isinstance(v, dict)
                        ]
        except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
            pass

    advisory_ids = list(
        dict.fromkeys(
            str(vulnerability["id"])
            for matches in vulnerabilities
            for vulnerability in matches
            if isinstance(vulnerability.get("id"), str)
        )
    )
    details: dict[str, dict[str, object]] = {}
    with ThreadPoolExecutor(max_workers=8, thread_name_prefix="athanor-osv") as pool:
        advisory_futures = {
            pool.submit(_get_advisory, advisory_id): advisory_id for advisory_id in advisory_ids
        }
        for advisory_future in as_completed(advisory_futures):
            try:
                result = advisory_future.result()
                if result is not None:
                    details[advisory_futures[advisory_future]] = result
            except (HTTPError, URLError, TimeoutError, ValueError, TypeError):
                continue

    items_by_topic: dict[str, list[MarketplaceEntry]] = {topic: [] for topic in TOPIC_QUERIES}
    for index, (topic, package, _score) in enumerate(raw_candidates):
        name, version = package.get("name"), package.get("version")
        if not isinstance(name, str) or not isinstance(version, str):
            continue
        advisories = []
        for reference in vulnerabilities[index] if index < len(vulnerabilities) else []:
            advisory_id = reference.get("id")
            detail = details.get(str(advisory_id), {})
            aliases = detail.get("aliases", [])
            severity_records = detail.get("severity", [])
            severity = None
            cvss = None
            if isinstance(severity_records, list) and severity_records:
                first = severity_records[0]
                if isinstance(first, dict):
                    severity = str(first.get("type", "")) or None
                    try:
                        vector = str(first.get("score", ""))
                        cvss = float(vector) if vector.replace(".", "", 1).isdigit() else None
                    except ValueError:
                        cvss = None
            database_specific = detail.get("database_specific", {})
            if isinstance(database_specific, dict) and isinstance(
                database_specific.get("severity"), str
            ):
                severity = str(database_specific["severity"])
            affected_range, fixed = _affected_versions(detail, name)
            published = detail.get("published")
            published_at = published if isinstance(published, str) else None
            advisories.append(
                MarketplaceAdvisory(
                    id=str(advisory_id),
                    aliases=[str(alias) for alias in aliases if isinstance(alias, str)]
                    if isinstance(aliases, list)
                    else [],
                    summary=str(detail.get("summary", "")),
                    severity=severity,
                    cvssScore=cvss,
                    affectedRange=affected_range,
                    fixedVersions=fixed,
                    url=f"https://osv.dev/vulnerability/{quote(str(advisory_id), safe='')}",
                    publishedAt=published_at,
                )
            )
        links = package.get("links")
        repository_url = links.get("repository") if isinstance(links, dict) else None
        package_license = package.get("license")
        entry = MarketplaceEntry(
            id=f"npm:{name}",
            topic=topic,
            name=name,
            description=str(package.get("description", "")),
            version=version,
            license=package_license if isinstance(package_license, str) else None,
            registryUrl=f"https://www.npmjs.com/package/{quote(name, safe='@/')}",
            repositoryUrl=repository_url if isinstance(repository_url, str) else None,
            downloads90d=downloads.get(name),
            rating=None,
            ratingSource=None,
            ratingCount=None,
            advisories=advisories,
            securityStatus="checked"
            if index < len(security_checked) and security_checked[index]
            else "unavailable",
            checkedAt=checked_at,
        )
        # npm's quality score is deliberately not passed off as a user rating.
        items_by_topic[topic].append(entry)

    entries: list[MarketplaceEntry] = []
    for _topic, topic_entries in items_by_topic.items():
        entries.extend(_rank(topic_entries[:100]))
    return MarketplaceSnapshot(
        refreshedAt=checked_at, entries=entries, unavailableTopics=unavailable
    )
