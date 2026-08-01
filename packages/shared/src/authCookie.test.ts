import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTH_TOKEN_COOKIE,
  AUTH_TOKEN_MAX_AGE_SECONDS,
  buildAuthTokenCookie,
  buildClearAuthTokenCookie,
  readAuthTokenFromCookieString,
} from "./authCookie";

describe("authCookie", () => {
  it("reads token from cookie header", () => {
    const token = "eyJhbGciOiJIUzI1NiJ9.payload.sig";
    const header = `preferredLanguage=he; ${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}; other=1`;
    assert.equal(readAuthTokenFromCookieString(header), token);
  });

  it("returns null when missing", () => {
    assert.equal(readAuthTokenFromCookieString("preferredLanguage=en"), null);
    assert.equal(readAuthTokenFromCookieString(""), null);
    assert.equal(readAuthTokenFromCookieString(null), null);
  });

  it("builds set and clear cookie strings with path=/ and SameSite=Lax", () => {
    const set = buildAuthTokenCookie("abc.def.ghi");
    assert.match(set, new RegExp(`^${AUTH_TOKEN_COOKIE}=`));
    assert.match(set, /path=\//);
    assert.match(set, /SameSite=Lax/);
    assert.match(set, new RegExp(`max-age=${AUTH_TOKEN_MAX_AGE_SECONDS}`));
    assert.equal(readAuthTokenFromCookieString(set.split(";")[0]), "abc.def.ghi");

    const clear = buildClearAuthTokenCookie();
    assert.match(clear, new RegExp(`^${AUTH_TOKEN_COOKIE}=;`));
    assert.match(clear, /max-age=0/);
  });
});
