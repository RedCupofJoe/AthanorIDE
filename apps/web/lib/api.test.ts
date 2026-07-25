import { describe, expect, it } from "vitest";

import { getApiBaseUrl } from "./api";

describe("api helpers", () => {
  it("defaults API base URL for local development", () => {
    expect(getApiBaseUrl()).toMatch(/127\.0\.0\.1:8000|localhost:8000/);
  });
});
