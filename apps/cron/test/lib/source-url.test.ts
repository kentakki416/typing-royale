import { describe, expect, it } from "vitest"

import { buildSourceUrl } from "../../src/lib/source-url"

describe("buildSourceUrl", () => {
  describe("正常系", () => {
    it("owner / repo / SHA / path / 行範囲を含む permalink を生成する", () => {
      const url = buildSourceUrl("colinhacks", "zod", "abc123", "src/parse.ts", 123, 145)
      expect(url).toBe("https://github.com/colinhacks/zod/blob/abc123/src/parse.ts#L123-L145")
    })

    it("1 行のみの関数でも L1-L1 形式になる", () => {
      const url = buildSourceUrl("octocat", "hello", "deadbeef", "index.js", 1, 1)
      expect(url).toBe("https://github.com/octocat/hello/blob/deadbeef/index.js#L1-L1")
    })

    it("path にネストしたディレクトリが含まれていても URL エンコードしない", () => {
      const url = buildSourceUrl("a", "b", "c", "packages/db/src/index.ts", 10, 20)
      expect(url).toBe("https://github.com/a/b/blob/c/packages/db/src/index.ts#L10-L20")
    })
  })
})
