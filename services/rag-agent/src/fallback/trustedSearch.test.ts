import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWhitelistedUrl } from "../config/trustedSources.js";
import {
  parseGoogleCseResponse,
  resetDdgFallbackWarningForTests,
  searchTrustedSources,
} from "./trustedSearch.js";
import { parseDdgHtmlResults } from "./trustedSearchFallback.js";

describe("parseDdgHtmlResults", () => {
  it("extracts whitelisted domain links from DuckDuckGo HTML", () => {
    const html = `
      <a class="result__a" href="https://www.cdc.gov/nutrition/foo">CDC Nutrition</a>
      <a class="result__a" href="https://example.com/bad">Bad</a>
    `;
    const links = parseDdgHtmlResults(html, "www.cdc.gov");
    assert.equal(links.length, 1);
    assert.match(links[0]!.url, /cdc\.gov/);
  });

  it("returns empty array when markup changes and no result__a anchors match", () => {
    const links = parseDdgHtmlResults("<html><body>No results</body></html>", "www.cdc.gov");
    assert.deepEqual(links, []);
  });
});

describe("parseGoogleCseResponse", () => {
  it("extracts whitelisted URLs and titles from Google CSE JSON", () => {
    const links = parseGoogleCseResponse({
      items: [
        {
          link: "https://www.cdc.gov/nutrition/protein",
          title: "Protein and Healthy Eating",
          snippet: "Guidance on protein intake.",
        },
        {
          link: "https://random-blog.example/article",
          title: "Not whitelisted",
        },
        {
          link: "https://pubmed.ncbi.nlm.nih.gov/999/",
          title: "PubMed duplicate path",
        },
      ],
    });

    assert.equal(links.length, 1);
    assert.equal(links[0]!.url, "https://www.cdc.gov/nutrition/protein");
    assert.equal(links[0]!.title, "Protein and Healthy Eating");
    assert.equal(links[0]!.domain, "www.cdc.gov");
  });
});

describe("isWhitelistedUrl", () => {
  it("accepts NIH and PubMed hosts", () => {
    assert.equal(isWhitelistedUrl("https://pubmed.ncbi.nlm.nih.gov/123/"), true);
    assert.equal(isWhitelistedUrl("https://www.nih.gov/health/foo"), true);
    assert.equal(isWhitelistedUrl("https://random-blog.example/article"), false);
  });
});

describe("searchTrustedSources — Google Custom Search", () => {
  it("uses Google CSE when configured and extracts results", async () => {
    let ddgCalled = false;
    const prevKey = process.env.GOOGLE_SEARCH_API_KEY;
    const prevCx = process.env.GOOGLE_SEARCH_CX;
    process.env.GOOGLE_SEARCH_API_KEY = "test-key";
    process.env.GOOGLE_SEARCH_CX = "test-cx";

    const mockFetch = async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("googleapis.com/customsearch")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                link: "https://www.nih.gov/health-information/protein",
                title: "NIH Protein Guide",
                snippet: "Daily protein recommendations.",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (href.includes("eutils.ncbi.nlm.nih.gov")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    const links = await searchTrustedSources("protein intake", mockFetch as typeof fetch, {
      isGoogleConfigured: () => true,
      searchDdgFallback: async () => {
        ddgCalled = true;
        return [];
      },
    });

    if (prevKey === undefined) delete process.env.GOOGLE_SEARCH_API_KEY;
    else process.env.GOOGLE_SEARCH_API_KEY = prevKey;
    if (prevCx === undefined) delete process.env.GOOGLE_SEARCH_CX;
    else process.env.GOOGLE_SEARCH_CX = prevCx;

    assert.equal(ddgCalled, false);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.url, "https://www.nih.gov/health-information/protein");
    assert.equal(links[0]!.title, "NIH Protein Guide");
  });

  it("returns empty without throwing on Google CSE 429 quota exceeded", async () => {
    const prevKey = process.env.GOOGLE_SEARCH_API_KEY;
    const prevCx = process.env.GOOGLE_SEARCH_CX;
    process.env.GOOGLE_SEARCH_API_KEY = "test-key";
    process.env.GOOGLE_SEARCH_CX = "test-cx";

    const mockFetch = async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("googleapis.com/customsearch")) {
        return new Response(JSON.stringify({ error: { code: 429, message: "Quota exceeded" } }), {
          status: 429,
        });
      }
      if (href.includes("eutils.ncbi.nlm.nih.gov")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: ["12345"] } }), { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    const links = await searchTrustedSources("protein", mockFetch as typeof fetch, {
      isGoogleConfigured: () => true,
    });

    if (prevKey === undefined) delete process.env.GOOGLE_SEARCH_API_KEY;
    else process.env.GOOGLE_SEARCH_API_KEY = prevKey;
    if (prevCx === undefined) delete process.env.GOOGLE_SEARCH_CX;
    else process.env.GOOGLE_SEARCH_CX = prevCx;

    assert.equal(links.length, 1);
    assert.match(links[0]!.url, /pubmed/);
  });
});

describe("searchTrustedSources — DDG fallback when Google not configured", () => {
  it("falls back to DDG path when API key/cx are missing", async () => {
    resetDdgFallbackWarningForTests();
    let ddgCalled = false;

    const mockFetch = async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("eutils.ncbi.nlm.nih.gov")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    const links = await searchTrustedSources("protein intake", mockFetch as typeof fetch, {
      isGoogleConfigured: () => false,
      searchDdgFallback: async () => {
        ddgCalled = true;
        return [
          {
            url: "https://www.cdc.gov/nutrition/foo",
            title: "CDC Nutrition",
            domain: "www.cdc.gov",
          },
        ];
      },
    });

    assert.equal(ddgCalled, true);
    assert.equal(links.length, 1);
    assert.equal(links[0]!.url, "https://www.cdc.gov/nutrition/foo");
  });

  it("returns empty without throwing when DDG HTML is unparseable and PubMed returns nothing", async () => {
    resetDdgFallbackWarningForTests();
    const mockFetch = async (url: string | URL | Request) => {
      const href = typeof url === "string" ? url : url.toString();
      if (href.includes("eutils.ncbi.nlm.nih.gov")) {
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      if (href.includes("duckduckgo.com")) {
        return new Response("<html><body>broken markup</body></html>", { status: 200 });
      }
      return new Response("", { status: 404 });
    };

    const links = await searchTrustedSources("protein intake", mockFetch as typeof fetch, {
      isGoogleConfigured: () => false,
    });

    assert.deepEqual(links, []);
  });
});
