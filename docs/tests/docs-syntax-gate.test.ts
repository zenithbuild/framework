import { describe, expect, test } from "bun:test";
import { findForbiddenMatches } from "../scripts/gates/shared.mjs";

describe("docs syntax gate", () => {
  test("rejects component props that look like native DOM event bindings", () => {
    const hits = findForbiddenMatches("<Button onClick={save}></Button>");

    expect(hits).toContain("component DOM event prop onClick");
  });

  test("allows ordinary component callback props", () => {
    expect(findForbiddenMatches("<Dialog onOpenChange={setOpen}></Dialog>")).toEqual([]);
    expect(findForbiddenMatches("<Button onPress={save}></Button>")).toEqual([]);
    expect(findForbiddenMatches("<Input onValueChange={setValue}></Input>")).toEqual([]);
  });
});
