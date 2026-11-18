/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((r) => r.map((c) => {
      const s = c == null ? "" : String(c);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
}

export const PLAYER_CSV_HEADERS = ["name", "gender", "dob", "team_code", "skill", "jersey", "handedness", "phone", "notes"] as const;
export const PLAYER_CSV_TEMPLATE =
  PLAYER_CSV_HEADERS.join(",") + "\r\n" + ["Asha Rao", "F", "2009-04-12", "SMA", "3.5", "7", "R", "+91 98765 43210", ""].join(",") + "\r\n";

export interface PlayerCsvRow {
  name: string;
  gender: "MALE" | "FEMALE";
  dob: string | null;
  teamCode: string | null;
  skill: number | null;
  jersey: string | null;
  handedness: string | null;
  phone: string | null;
  notes: string | null;
}

export interface CsvRowResult {
  row: number;
  ok: boolean;
  errors: string[];
  data?: PlayerCsvRow;
}

export function parsePlayerCsv(text: string, teamCodes: string[]): CsvRowResult[] {
  const rows = parseCsv(text);
  if (!rows.length) return [{ row: 0, ok: false, errors: ["File is empty"] }];
  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (k: string) => header.indexOf(k);
  if (idx("name") < 0 || idx("gender") < 0) return [{ row: 1, ok: false, errors: ["Header must include at least: name, gender"] }];
  const codes = new Set(teamCodes.map((c) => c.toUpperCase()));
  return rows.slice(1).map((r, i) => {
    const get = (k: string) => (idx(k) >= 0 ? (r[idx(k)] ?? "").trim() : "");
    const errors: string[] = [];
    const name = get("name");
    if (!name) errors.push("Name is required");
    const g = get("gender").toUpperCase();
    const gender = ["M", "MALE"].includes(g) ? "MALE" : ["F", "FEMALE"].includes(g) ? "FEMALE" : null;
    if (!gender) errors.push(`Gender must be M or F (got "${get("gender")}")`);
    const dobRaw = get("dob");
    let dob: string | null = null;
    if (dobRaw) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dobRaw) ?? null;
      const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(dobRaw);
      if (m) dob = dobRaw;
      else if (dmy) dob = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
      if (!dob || Number.isNaN(Date.parse(dob))) {
        errors.push(`Invalid date of birth "${dobRaw}" (use YYYY-MM-DD or DD/MM/YYYY)`);
        dob = null;
      }
    }
    const team = get("team_code").toUpperCase() || null;
    if (team && !codes.has(team)) errors.push(`Unknown team code "${team}"`);
    const skillRaw = get("skill");
    const skill = skillRaw ? Number(skillRaw) : null;
    if (skillRaw && (Number.isNaN(skill) || skill! < 0 || skill! > 8)) errors.push(`Invalid skill "${skillRaw}"`);
    const data: PlayerCsvRow = {
      name,
      gender: (gender ?? "MALE") as "MALE" | "FEMALE",
      dob,
      teamCode: team,
      skill,
      jersey: get("jersey") || null,
      handedness: get("handedness") || null,
      phone: get("phone") || null,
      notes: get("notes") || null,
    };
    return { row: i + 2, ok: errors.length === 0, errors, data: errors.length ? undefined : data };
  });
}
