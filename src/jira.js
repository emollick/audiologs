// Loads JIRA tickets from a REST API export (JSON), a CSV export, or straight from a JIRA Cloud site,
// and normalizes them into a compact shape the prompts can use.
import { readFileSync } from "node:fs";

/** Flattens Atlassian Document Format (JIRA Cloud v3 rich text) into plain text. */
export function adfToText(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(adfToText).join("");
  const inner = adfToText(node.content);
  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "paragraph":
    case "heading":
    case "blockquote":
    case "codeBlock":
      return inner + "\n";
    case "listItem":
      return "* " + inner.trim() + "\n";
    case "mention":
      return node.attrs?.text ?? "@someone";
    case "emoji":
      return node.attrs?.text ?? "";
    case "inlineCard":
    case "blockCard":
      return node.attrs?.url ?? "";
    default:
      return inner;
  }
}

const text = (v) => (typeof v === "string" ? v : adfToText(v)).trim();

function person(p) {
  if (!p) return null;
  const name = p.displayName ?? p.name ?? "Unknown";
  if (p.accountType === "app") return `${name} (bot)`;
  if (p.active === false) return `${name} (deactivated)`;
  return name;
}

/** Normalizes one issue from the JIRA REST API (v2 or v3). */
export function normalizeIssue(issue) {
  const f = issue.fields ?? {};
  const links = (f.issuelinks ?? [])
    .map((l) => {
      if (l.outwardIssue) return `${l.type?.outward ?? "relates to"} ${l.outwardIssue.key}`;
      if (l.inwardIssue) return `${l.type?.inward ?? "relates to"} ${l.inwardIssue.key}`;
      return null;
    })
    .filter(Boolean);
  return {
    key: issue.key,
    summary: f.summary ?? "",
    type: f.issuetype?.name ?? "Task",
    project: f.project?.name ?? issue.key.split("-")[0],
    status: f.status?.name ?? "",
    resolution: f.resolution?.name ?? null,
    priority: f.priority?.name ?? "",
    assignee: person(f.assignee),
    reporter: person(f.reporter),
    created: f.created ?? null,
    updated: f.updated ?? null,
    due: f.duedate ?? null,
    labels: f.labels ?? [],
    components: (f.components ?? []).map((c) => c.name),
    storyPoints: f.customfield_10016 ?? f.storyPoints ?? null,
    links,
    description: text(f.description ?? ""),
    comments: (f.comment?.comments ?? []).map((c) => ({
      author: person(c.author) ?? "Unknown",
      created: c.created ?? null,
      body: text(c.body ?? ""),
    })),
  };
}

/** Very small CSV parser that handles quoted fields, for JIRA's "Export > CSV (all fields)". */
function parseCSV(src) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ""));
}

/** JIRA CSV exports repeat the "Comment" column once per comment: "date;author;body". */
function csvToIssues(src) {
  const [header, ...rows] = parseCSV(src.replace(/^\uFEFF/, ""));
  const idx = (name) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const commentCols = header.map((h, i) => (h.toLowerCase() === "comment" ? i : -1)).filter((i) => i >= 0);
  const get = (r, name) => {
    const i = idx(name);
    return i >= 0 ? r[i] : undefined;
  };
  return rows.map((r) => ({
    key: get(r, "Issue key"),
    summary: get(r, "Summary") ?? "",
    type: get(r, "Issue Type") ?? "Task",
    project: get(r, "Project name") ?? "",
    status: get(r, "Status") ?? "",
    resolution: get(r, "Resolution") || null,
    priority: get(r, "Priority") ?? "",
    assignee: get(r, "Assignee") || null,
    reporter: get(r, "Reporter") || null,
    created: get(r, "Created") ?? null,
    updated: get(r, "Updated") ?? null,
    due: get(r, "Due date") || null,
    labels: header.map((h, i) => (h === "Labels" && r[i] ? r[i] : null)).filter(Boolean),
    components: header.map((h, i) => (h === "Component/s" && r[i] ? r[i] : null)).filter(Boolean),
    storyPoints: get(r, "Story Points") || get(r, "Custom field (Story Points)") || get(r, "Custom field (Story point estimate)") || null,
    links: [],
    description: get(r, "Description") ?? "",
    comments: commentCols
      .map((i) => r[i])
      .filter(Boolean)
      .map((c) => {
        const [created, author, ...body] = c.split(";");
        return { created, author, body: body.join(";").trim() };
      }),
  }));
}

/** Loads tickets from a .json (REST search response or array of issues) or .csv file. */
export function loadTicketsFile(file) {
  const src = readFileSync(file, "utf8");
  if (file.toLowerCase().endsWith(".csv")) return csvToIssues(src);
  const data = JSON.parse(src);
  const issues = Array.isArray(data) ? data : data.issues ?? [];
  return issues.map((i) => (i.fields ? normalizeIssue(i) : i));
}

/**
 * Fetches tickets straight from JIRA Cloud with a JQL query.
 * Needs JIRA_BASE_URL (https://your-site.atlassian.net), JIRA_EMAIL and JIRA_API_TOKEN.
 */
export async function fetchTickets(jql, { max = 50 } = {}) {
  const base = process.env.JIRA_BASE_URL?.replace(/\/$/, "");
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!base || !email || !token) {
    throw new Error("Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN to fetch from JIRA, or pass --tickets <file>.");
  }
  const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
  const fields = "summary,issuetype,project,status,resolution,priority,assignee,reporter,created,updated,duedate,labels,components,issuelinks,description,comment,customfield_10016";
  const issues = [];
  let nextPageToken;
  while (issues.length < max) {
    const url = new URL(`${base}/rest/api/3/search/jql`);
    url.searchParams.set("jql", jql);
    url.searchParams.set("fields", fields);
    url.searchParams.set("maxResults", String(Math.min(50, max - issues.length)));
    if (nextPageToken) url.searchParams.set("nextPageToken", nextPageToken);
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) throw new Error(`JIRA search failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    issues.push(...(page.issues ?? []));
    nextPageToken = page.nextPageToken;
    if (!nextPageToken || !page.issues?.length) break;
  }
  return issues.map(normalizeIssue);
}

/** "2026-10-10T10:00:00.000-0400" -> "2026-10-10 10:00" (local time as written in the ticket). */
export function shortDate(d) {
  if (!d) return "?";
  const m = String(d).match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  return m ? [m[1], m[2]].filter(Boolean).join(" ") : String(d);
}

/** Renders a ticket as compact plain text for prompts and in-game terminals. */
export function ticketToText(t, { maxComments = 40 } = {}) {
  const lines = [
    `${t.key}: ${t.summary}`,
    `Type: ${t.type} | Status: ${t.status}${t.resolution ? ` (${t.resolution})` : ""} | Priority: ${t.priority}${t.storyPoints != null ? ` | Story points: ${t.storyPoints}` : ""}`,
    `Assignee: ${t.assignee ?? "Unassigned"} | Reporter: ${t.reporter ?? "Unknown"}`,
    `Created: ${shortDate(t.created)} | Updated: ${shortDate(t.updated)}${t.due ? ` | Due: ${t.due}` : ""}`,
  ];
  if (t.labels?.length) lines.push(`Labels: ${t.labels.join(", ")}`);
  if (t.components?.length) lines.push(`Components: ${t.components.join(", ")}`);
  if (t.links?.length) lines.push(`Links: ${t.links.join("; ")}`);
  if (t.description) lines.push("", "Description:", t.description);
  if (t.comments?.length) {
    lines.push("", `Comments (${t.comments.length}):`);
    for (const c of t.comments.slice(-maxComments)) lines.push(`- [${shortDate(c.created)}] ${c.author}: ${c.body}`);
  }
  return lines.join("\n");
}
