import { describe, expect, it } from "vitest";
import { parseCsv, parsePlayerCsv, toCsv } from "./csv";

describe("csv", () => {
  it("parses quotes and CRLF", () => {
    expect(parseCsv('a,"b,c","d""e"\r\n1,2,3\r\n')).toEqual([["a", "b,c", 'd"e'], ["1", "2", "3"]]);
  });
  it("round trips", () => {
    const rows = [["x", 'he said "hi"', "a,b"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it("reports row-by-row player errors", () => {
    const res = parsePlayerCsv("name,gender,dob,team_code\nAsha,F,2009-04-12,SMA\n,X,13/13/2020,ZZZ\nRavi,m,05/06/1990,", ["SMA"]);
    expect(res[0].ok).toBe(true);
    expect(res[1].ok).toBe(false);
    expect(res[1].errors.length).toBe(4);
    expect(res[2].ok).toBe(true);
    expect(res[2].data?.dob).toBe("1990-06-05");
  });
});
