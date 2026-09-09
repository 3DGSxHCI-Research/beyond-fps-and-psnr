/* =========================================================================
   3DGS x HCI — explorable map of the corpus

   Every view reads from window.SITE_DATA, produced by build_site_data.py from
   the coded screening workbook. Nothing here hard-codes a count: each number on
   screen is computed at render time, so refreshing the data refreshes the site.

   Charts are plain HTML rather than SVG or canvas, drawn with the paper's own
   conventions: a pastel fill with a 1px darker stroke of the same hue, orange
   for the application-oriented stratum and blue for the technical stratum.
   ========================================================================= */

(function () {
"use strict";

var DATA = window.SITE_DATA;
var AUDIT = window.SITE_AUDIT || [];
var PAPERS = DATA.papers;
var T = DATA.totals;
var APP = "application", TECH = "technical";

/* ---------------------------------------------------------------- utils -- */

function $(sel, root) { return (root || document).querySelector(sel); }
function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function plural(n, one, many) { return n === 1 ? one : (many || one + "s"); }

function median(values) {
  var v = values.filter(function (x) { return isFinite(x); })
                .sort(function (a, b) { return a - b; });
  if (!v.length) return null;
  var m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
/* headline N, matching the audit rule: the leading integer of the cell */
function headlineN(paper) {
  var m = String(paper.participants || "").match(/\d+/);
  return m ? parseInt(m[0], 10) : NaN;
}
/* venues the paper's venue figure leaves out: publication series and megajournals */
var CONTAINERS = DATA.container_venues || [];

/* Venue labels, matching figures/fig_venue_included.py so the chart here reads
   like the one in the paper: a hand-written short form where there is one, else
   a trailing acronym, else truncation at 22 characters. */
var VENUE_SHORT = {
  "ACM SIGGRAPH / SIGGRAPH Asia": "SIGGRAPH (+Asia)",
  "IEEE Transactions on Visualization and Computer Graphics": "IEEE TVCG",
  "IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)": "CVPR",
  "Proc. ACM Comput. Graph. Interact. Tech.": "PACMCGIT",
  "IEEE Transactions on Pattern Analysis and Machine Intelligence": "IEEE TPAMI",
  "Conference on Learning Representations, ICLR": "ICLR",
  "Conference on Virtual Reality Continuum and Its Applications in Industry": "VRCAI",
  "Advances in Neural Information Processing Systems": "NeurIPS",
  "International Journal of Computer Vision": "IJCV",
  "International Archives of the Photogrammetry, Remote Sensing and Spatial Information Sciences - ISPRS Archives": "ISPRS Archives"
};
var VENUE_MAX = 22;
function venueLabel(name) {
  if (VENUE_SHORT[name]) return VENUE_SHORT[name];
  var m = /[(]([A-Z][A-Za-z]{1,9})[)]\s*$/.exec(name);
  if (m) return m[1];
  if (name.length > VENUE_MAX) {
    return name.slice(0, VENUE_MAX - 1).replace(/[ ,;:-]+$/, "") + "\u2026";
  }
  return name;
}

/* Top venues, ranked as the paper ranks them: count descending, ties broken
   alphabetically on the full venue name, then the first ten. The tie at four
   papers is why CHI is shown and ICASSP is not. */
function venueRows(limit) {
  var counts = {};
  PAPERS.forEach(function (p) {
    var v = p.venue_short;
    if (!v || CONTAINERS.indexOf(v) !== -1) return;
    if (!counts[v]) counts[v] = { value: v, label: venueLabel(v), app: 0, tech: 0 };
    counts[v][p.stratum === APP ? "app" : "tech"] += 1;
  });
  var list = Object.keys(counts).map(function (k) { return counts[k]; });
  list.sort(function (a, b) {
    return (b.app + b.tech) - (a.app + a.tech) || a.value.localeCompare(b.value);
  });
  return list.slice(0, limit || 10);
}
/* runtime authoring tools whose operation runs against an added geometric layer rather
   than against the primitives, read from the coded geometry_substitute column so the
   site and audit claim C145a agree (the paper's 21 of 25) */
function proxiedTools() {
  return DATA.techniques.filter(function (t) { return t.substitute === "auxiliary layer"; }).length;
}
/* papers with human evidence of Gaussian content that never name the medium (audit C89a) */
function noMediumCount() {
  return PAPERS.filter(function (p) { return p.human_evidence && p.study_platform === "not specified"; }).length;
}
/* application studies in which participants roamed freely (audit C111) */
function roamCount() {
  return PAPERS.filter(function (p) { return p.has_gs_study === "yes" && /^free roaming/.test(p.mobility || ""); }).length;
}
/* studies combining an inferential test, a headset and a different representation (audit C119b) */
function exemplarCount() {
  return PAPERS.filter(function (p) {
    return p.tested && p.in_headset && p.compared_different_representation === "yes";
  }).length;
}
/* a hand-coded yes/no cell with the evidence tail the coder left after it */
function noted(p, field) {
  var v = p[field];
  if (!v) return "";
  return p[field + "_note"] ? v + " \u2014 " + p[field + "_note"] : v;
}
function countBy(rows, field) {
  var m = {};
  rows.forEach(function (p) {
    var v = p[field];
    if (v === "" || v == null) return;
    m[v] = (m[v] || 0) + 1;
  });
  return m;
}

/* the workbook writes contribution types in caps; the page reads better without */
var LABELS = {
  "TECHNICAL": "Technical method",
  "SYSTEM": "System",
  "WORKFLOW/PIPELINE": "Workflow / pipeline",
  "ARTISTIC EXPLORATION": "Artistic exploration",
  "STUDY": "Study",
  "INTERACTION": "Interaction technique",
  "PEDAGOGY": "Pedagogy",
  "CASE/EXPERIENCE REPORT": "Case / experience report",
  "!! not collapsed to vocabulary": "other (cell not collapsed)",
  "/ (no study)": "no study",
  "/ (existing dataset)": "existing dataset"
};
function label(v) { return LABELS[v] || v; }

/* figure and table numbering, reset for each page */
var figN = 0, tblN = 0;
function figNo(name) { figN += 1; return "Figure " + figN + " &middot; " + name; }
function tblNo(name) { tblN += 1; return "Table " + tblN + " &middot; " + name; }

/* --------------------------------------------------------- state & route -- */

var state = { filters: {}, query: "", sort: "year" };

/* sample-size bands, as "lowerBound-upperBound" keys so the chart and the filter
   agree on the arithmetic */
var NBINS = [["1-10", "1 to 9"], ["10-20", "10 to 19"], ["20-50", "20 to 49"],
             ["50-100", "50 to 99"], ["100-1000000000", "100 or more"]];
var NBIN_LABEL = {};
NBINS.forEach(function (b) { NBIN_LABEL[b[0]] = b[1]; });

function filtersActive() {
  for (var f in state.filters) if (state.filters[f] && state.filters[f].length) return true;
  return false;
}
function clearFilters() { state.filters = {}; state.query = ""; }

/* Virtual filters. Some charts count a predicate rather than a coded value: a
   cross-cutting theme, a sample-size band, a named tool. Those charts still have
   to open exactly their own papers, so the predicate travels as a filter whose
   field name starts with "__" and is resolved here instead of by equality. */
var VIRTUAL = {
  __theme: {
    group: "Theme",
    name: function (k) {
      var x = THEMES.filter(function (v) { return v.key === k; })[0];
      return x ? x.label : k;
    },
    test: function (p, k) {
      var x = THEMES.filter(function (v) { return v.key === k; })[0];
      return !!x && p.stratum === APP && x.test(p);
    }
  },
  __nbin: {
    group: "Sample size",
    name: function (k) { return NBIN_LABEL[k] || k; },
    test: function (p, k) {
      var b = k.split("-"), n = headlineN(p);
      return isFinite(n) && n >= Number(b[0]) && n < Number(b[1]);
    }
  },
  __tool_training: {
    group: "Reconstruction tool",
    name: function (k) { return k; },
    test: function (p, k) { return (p.tools_training || []).indexOf(k) !== -1; }
  },
  __tool_rendering: {
    group: "Delivery tool",
    name: function (k) { return k; },
    test: function (p, k) { return (p.tools_rendering || []).indexOf(k) !== -1; }
  }
};

function matches(paper, skipField) {
  for (var field in state.filters) {
    var vals = state.filters[field];
    if (!vals || !vals.length || field === skipField) continue;
    var v = VIRTUAL[field];
    if (v) {
      var any = vals.some(function (k) { return v.test(paper, k); });
      if (!any) return false;
      continue;
    }
    if (vals.indexOf(String(paper[field])) === -1) return false;
  }
  if (state.query) {
    var q = state.query.toLowerCase();
    var hay = (paper.title + " " + paper.authors.join(" ") + " " + paper.venue + " " +
               (paper.abstract || "") + " " + (paper.contribution_summary || "") + " " +
               paper.cluster).toLowerCase();
    if (hay.indexOf(q) === -1) return false;
  }
  return true;
}
function selected(skip) {
  return PAPERS.filter(function (p) { return matches(p, skip); });
}
function toggleFilter(field, value) {
  var vals = state.filters[field] || (state.filters[field] = []);
  var i = vals.indexOf(value);
  if (i === -1) vals.push(value); else vals.splice(i, 1);
  if (!vals.length) delete state.filters[field];
}
function setFilter(field, value) { state.filters[field] = [String(value)]; }
function isOn(field, value) {
  var vals = state.filters[field];
  return !!vals && vals.indexOf(String(value)) !== -1;
}

function go(hash) { location.hash = hash; }
function openCorpus(field, value) {
  clearFilters();
  if (field) setFilter(field, value);
  go("#/corpus");
}

/* A chart drawn over a subset of the corpus has to open that same subset, or the
   paper list shows more papers than the bar counted. Charts pass their subset as
   a scope, e.g. {stratum: "application"}, which travels on the button and is
   applied alongside the clicked value. */
function scopeAttr(scope) {
  if (!scope) return "";
  var parts = [];
  for (var f in scope) if (scope[f] != null) parts.push(f + "|" + scope[f]);
  return parts.length ? ' data-scope="' + esc(parts.join("~")) + '"' : "";
}
function applyScope(el) {
  var s = el.getAttribute("data-scope");
  if (!s) return;
  s.split("~").forEach(function (pair) {
    var kv = pair.split("|");
    if (kv[0]) setFilter(kv[0], kv[1]);
  });
}
function openScoped(el, field, value) {
  clearFilters();
  if (field) setFilter(field, value);
  applyScope(el);
  go("#/corpus");
}

/* --------------------------------------------------------------- charts -- */

var RAMP = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5", "--seq-6", "--seq-7"];

function rampStep(value, max) {
  if (!value) return 0;
  return Math.min(RAMP.length - 1, 1 + Math.floor((value / max) * (RAMP.length - 1.001)));
}

/**
 * Horizontal bars split by stratum. Every row is a button that opens the paper
 * list filtered to that value, so a bar and its papers are the same object.
 */
function bars(opts) {
  var rows = opts.rows;
  var field = opts.field;
  var max = opts.max || Math.max.apply(null, rows.map(function (r) { return r.app + r.tech; }).concat([1]));
  var labelWidth = opts.labelWidth || 200;
  var valueWidth = 34;
  var thin = opts.thin ? " thin" : "";
  var showLegend = opts.legend !== false;
  var wrapy = opts.wrapLabels ? " wrapy" : "";
  var steps = opts.gridSteps || 0;

  var legend = showLegend
    ? '<div class="legend">' +
      '<span><i class="app"></i>application-oriented</span>' +
      '<span><i class="tech"></i>technical</span></div>'
    : "";

  var grid = steps
    ? '<div class="plot-grid" style="left:' + (labelWidth + 16) + "px;right:" +
      (valueWidth + 16) + 'px;background-image:repeating-linear-gradient(to right,' +
      ' var(--rule-grid) 0 1px, transparent 1px ' + (100 / steps) + '%)"></div>'
    : "";

  var body = rows.map(function (r) {
    var total = r.app + r.tech;
    var segs = "";
    if (r.app) segs += '<i class="seg app" style="width:' + ((r.app / max) * 100) + '%"></i>';
    if (r.tech) segs += '<i class="seg tech" style="width:' + ((r.tech / max) * 100) + '%"></i>';
    var tip = esc(label(r.label)) + " &mdash; " + total + " " + plural(total, "paper") +
      (showLegend && r.app && r.tech ? " (" + r.app + " application, " + r.tech + " technical)" : "");
    return '<button class="bar-row" style="grid-template-columns:' + labelWidth + 'px 1fr ' + valueWidth + 'px"' +
      (field ? ' data-field="' + esc(field) + '" data-value="' + esc(r.value) + '"' + scopeAttr(opts.scope) : "") +
      ' data-tip="' + tip + '">' +
      '<span class="bar-label' + wrapy + '">' + esc(label(r.label)) + '</span>' +
      '<span class="bar-track' + thin + '">' + segs + '</span>' +
      '<span class="bar-value">' + total + '</span></button>';
  }).join("");

  var ticks = "";
  if (opts.ticks) {
    var t = [], i;
    for (i = 0; i <= opts.ticks; i++) t.push(Math.round((max / opts.ticks) * i));
    ticks = '<div class="axis-ticks" style="margin-left:' + (labelWidth + 16) + 'px;margin-right:' +
      (valueWidth + 16) + 'px">' + t.map(function (v) { return "<span>" + v + "</span>"; }).join("") + "</div>";
  }

  /* the vertical axis belongs where the bars start, not at the far left of the
     plot: drawn at the label column's right edge so labels sit against it */
  var axisX = labelWidth + 16;
  return legend + '<div class="plot"><div class="plot-inner">' +
    '<div class="plot-axis" style="left:' + axisX + 'px"></div>' + grid + body + "</div>" +
    '<div class="plot-base" style="margin-left:' + axisX + 'px;margin-right:' +
    (valueWidth + 16) + 'px"></div></div>' + ticks;
}

function barRows(rows, field, limit) {
  var counts = {};
  rows.forEach(function (p) {
    var v = p[field];
    if (v === "" || v == null) return;
    var k = String(v);
    if (!counts[k]) counts[k] = { value: k, label: k, app: 0, tech: 0 };
    counts[k][p.stratum === APP ? "app" : "tech"] += 1;
  });
  var list = Object.keys(counts).map(function (k) { return counts[k]; })
    .sort(function (a, b) { return (b.app + b.tech) - (a.app + a.tech); });
  return limit ? list.slice(0, limit) : list;
}

var SEP = "␟";   /* unit separator: cannot occur in a coded value */

/* Fixed orders, copied from the figure scripts so the site's axes read like the
   paper's rather than re-sorting themselves by count. */
var GS_TYPE_ORDER = ["static scene reconstruction", "object reconstruction",
  "editing / stylization / physics", "generative (text/image-to-3D)",
  "head / face avatars", "hand avatars", "full-body avatars & try-on",
  "dynamic / 4D volumetric video"];
var HEAT_ROWS = ["VR/AR headset", "desktop / web", "mobile / tablet", "3D display",
  "multiple platforms", "not reported"];
var HEAT_COLS = ["controllers", "hand tracking", "multimodal", "body / locomotion",
  "gaze / voice / language", "mouse / touch", "haptic / tangible",
  "passive viewing", "not reported"];
var PROVENANCE = [
  ["self-captured only", "self-captured only"],
  ["mixed custom + public", "mixed custom + public"],
  ["public only", "public datasets only"],
  ["synthetic/generated", "synthetic / generated"],
  ["not reported", "not reported"]
];

/* One primary type per paper, ordered by combined total with the vocabulary
   order as the tie-break, exactly as figures/fig_gs_type_stratum.py does. */
function gsTypeRows() {
  var counts = {};
  GS_TYPE_ORDER.forEach(function (v, i) {
    counts[v] = { value: v, label: v, app: 0, tech: 0, ord: i };
  });
  PAPERS.forEach(function (p) {
    var v = p.gs_type_primary;
    if (!v || !counts[v]) return;
    counts[v][p.stratum === APP ? "app" : "tech"] += 1;
  });
  return GS_TYPE_ORDER.map(function (v) { return counts[v]; })
    .filter(function (r) { return r.app + r.tech > 0; })
    .sort(function (a, b) {
      return (b.app + b.tech) - (a.app + a.tech) || a.ord - b.ord;
    });
}

/**
 * Provenance as the paper draws it: one 100%-stacked bar per stratum, segments
 * in a fixed order from "all our own" to "not reported", widths as shares and
 * the printed numbers as counts. Every segment opens its own papers.
 */
function provenanceChart() {
  var strata = [[APP, "application"], [TECH, "technical"]];
  var body = strata.map(function (s) {
    var pool = PAPERS.filter(function (p) { return p.stratum === s[0]; });
    var segs = PROVENANCE.map(function (seg, i) {
      var n = pool.filter(function (p) { return p.dataset_primary === seg[0]; }).length;
      if (!n) return "";
      var tip = esc(seg[1]) + " &mdash; " + n + " of " + pool.length + " " + s[1] +
        " papers (" + pct(n, pool.length) + "%)";
      return '<button class="prov-seg prov-' + i + '" style="width:' +
        ((n / pool.length) * 100) + '%" data-field="dataset_primary" data-value="' +
        esc(seg[0]) + '" data-scope="stratum|' + esc(s[0]) + '" data-tip="' + tip + '">' +
        n + "</button>";
    }).join("");
    return '<div class="prov-row"><span class="prov-cap">' + s[1] +
      " (n = " + pool.length + ")</span>" +
      '<span class="prov-track">' + segs + "</span></div>";
  }).join("");
  var legend = '<div class="legend prov-legend">' + PROVENANCE.map(function (seg, i) {
    return '<span><i class="prov-' + i + '"></i>' + esc(seg[1]) + "</span>";
  }).join("") + "</div>";
  return '<div class="prov">' + body +
    '<div class="prov-axis"><span>0%</span><span>25%</span><span>50%</span>' +
    "<span>75%</span><span>100%</span></div></div>" + legend;
}

/** Cross-tab heatmap. Cells are buttons that open the filtered paper list. */
function heatmap(rows, rowField, colField, colLabel, scope, rowOrder, colOrder) {
  var present = function (order, field) {
    var seen = countBy(rows, field);
    return order.filter(function (v) { return seen[v]; });
  };
  var rowVals = rowOrder ? present(rowOrder, rowField)
    : Object.keys(countBy(rows, rowField))
      .sort(function (a, b) { return countBy(rows, rowField)[b] - countBy(rows, rowField)[a]; });
  var colCounts = countBy(rows, colField);
  var colVals = colOrder ? present(colOrder, colField)
    : Object.keys(colCounts).sort(function (a, b) { return colCounts[b] - colCounts[a]; });

  var grid = {}, max = 1;
  rows.forEach(function (p) {
    var r = String(p[rowField] == null ? "" : p[rowField]);
    var c = String(p[colField] == null ? "" : p[colField]);
    if (!r || !c) return;
    var k = r + SEP + c;
    grid[k] = (grid[k] || 0) + 1;
    if (grid[k] > max) max = grid[k];
  });

  var group = "<colgroup><col class='heat-lab'>" +
    colVals.map(function () { return "<col>"; }).join("") + "<col></colgroup>";
  var head = "<tr><th></th>" + colVals.map(function (c) {
    return '<th class="col"><span>' + esc(label(c)) + "</span></th>";
  }).join("") + '<th class="col heat-n"><span>n</span></th></tr>';

  var body = rowVals.map(function (r) {
    var cells = colVals.map(function (c) {
      var n = grid[r + SEP + c] || 0;
      var step = rampStep(n, max);
      var tip = esc(label(r)) + " &times; " + esc(label(c)) + " &mdash; " + n + " " + plural(n, "paper");
      /* an empty combination has nothing to open, so it is a plain cell rather
         than a button: no pointer, no focus stop, still labelled on hover */
      if (!n) {
        return '<td><span class="cell zero" data-tip="' + tip + '">○</span></td>';
      }
      var style = "background:var(" + RAMP[step] + ");color:" +
        (step >= 5 ? "var(--seq-ink-hi)" : "var(--seq-ink-lo)");
      return '<td><button class="cell" style="' + style + '"' +
        ' data-heat="' + esc(rowField) + "|" + esc(r) + "|" + esc(colField) + "|" + esc(c) + '"' +
        scopeAttr(scope) + ' data-tip="' + tip + '">' + n + "</button></td>";
    }).join("");
    var rowN = colVals.reduce(function (s, c) { return s + (grid[r + SEP + c] || 0); }, 0);
    return '<tr><th class="row" title="' + esc(r) + '">' + esc(label(r)) + "</th>" +
      cells + '<td class="heat-n">' + rowN + "</td></tr>";
  }).join("");

  /* the column totals, as the paper's figure prints them */
  var foot = '<tr><th class="row"></th>' + colVals.map(function (c) {
    var n = rowVals.reduce(function (s, r) { return s + (grid[r + SEP + c] || 0); }, 0);
    return '<td class="heat-n">' + n + "</td>";
  }).join("") + '<td class="heat-n">' +
    rowVals.reduce(function (s, r) {
      return s + colVals.reduce(function (q, c) { return q + (grid[r + SEP + c] || 0); }, 0);
    }, 0) + "</td></tr>";

  var key = '<div class="ramp-key"><span>' + esc(colLabel || colField) + " &rarr;</span>" +
    '<span class="steps">' + RAMP.slice(1).map(function (v) {
      return '<i style="background:var(' + v + ')"></i>';
    }).join("") + "</span>" +
    "<span>1 &ndash; " + max + " papers &middot; ringed cell = combination unexplored" +
    " &middot; hover a cell for its count</span></div>";

  return '<div class="heat-scroll"><table class="heat">' + group + head + body + foot +
    "</table></div>" + key;
}

/* ------------------------------------------------------------ components -- */

function annot(kind, legendText, body) {
  var mark = kind === "todo" ? "‡" : "†";
  return '<div class="annot ' + kind + '"><div class="annot-mark">' + mark + "</div>" +
    '<div class="annot-box"><div class="annot-legend">' + esc(legendText) + "</div>" +
    '<div class="annot-body">' + body + "</div></div></div>";
}

function sectionHead(no, title, caption) {
  return '<div class="figno">' + no + "</div>" +
    '<h2 class="head">' + title + "</h2>" +
    (caption ? '<p class="caption">' + caption + "</p>" : "");
}

/* ------------------------------------------------------------- tooltips -- */

var tipEl = null;

/* A hovered bar or cell is removed from the page when clicking it re-renders
   the view, so its mouseleave never fires and the tooltip would be stranded.
   hideTip() is therefore called on click and again on every render. */
function hideTip() {
  if (tipEl && tipEl.parentNode) tipEl.parentNode.removeChild(tipEl);
}

document.addEventListener("mouseover", function (e) {
  var host = e.target.closest ? e.target.closest("[data-tip]") : null;
  if (!host) return;
  if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tooltip"; }
  tipEl.innerHTML = host.getAttribute("data-tip");
  document.body.appendChild(tipEl);
  function move(ev) {
    var r = tipEl.getBoundingClientRect();
    tipEl.style.left = Math.min(ev.clientX + 14, window.innerWidth - r.width - 10) + "px";
    tipEl.style.top = Math.max(8, ev.clientY - r.height - 12) + "px";
  }
  move(e);
  host.addEventListener("mousemove", move);
  host.addEventListener("mouseleave", function once() {
    host.removeEventListener("mousemove", move);
    host.removeEventListener("mouseleave", once);
    hideTip();
  });
});
document.addEventListener("click", hideTip, true);
window.addEventListener("blur", hideTip);

/* ---------------------------------------------------------- paper index -- */

function authorLine(p) {
  if (!p.authors.length) return "";
  return p.authors.length <= 3 ? p.authors.join(", ") : p.authors[0] + " et al.";
}

function paperRow(p) {
  var tags = [];
  if (p.cluster) tags.push('<span class="tag">' + esc(p.cluster) + "</span>");
  if (p.has_gs_study === "yes" || p.stratum === TECH) {
    var n = headlineN(p);
    tags.push('<span class="tag">user study' + (isFinite(n) ? " N=" + n : "") + "</span>");
  }
  if (p.in_headset) tags.push('<span class="tag">in headset</span>');
  if (p.authoring_locus === "runtime tool (end-user)") tags.push('<span class="tag">runtime authoring</span>');
  if (p.short_form) tags.push('<span class="tag">short form</span>');
  if (p.tested) tags.push('<span class="mark">statistically tested</span>');

  return '<button class="pcard" data-paper="' + esc(p.id) + '">' +
    '<span class="pcard-stratum"><i class="' + (p.stratum === APP ? "app" : "tech") + '"></i>' +
    (p.stratum === APP ? "application" : "technical") + "</span>" +
    "<span>" +
    '<span class="pcard-title">' + esc(p.title) + "</span>" +
    '<span class="pcard-meta">' + esc(authorLine(p)) + " &middot; " +
    esc(p.venue_short || p.venue) + " &middot; " + p.year + "</span>" +
    '<span class="pcard-tags">' + tags.join("") + "</span>" +
    "</span></button>";
}

/* --------------------------------------------------------------- drawer -- */

function field(lab, value) {
  if (!value) return "";
  return '<div class="field"><div class="fl">' + esc(lab) + '</div><div class="fv">' + esc(value) + "</div></div>";
}

function openPaper(id) {
  var p = null, i;
  for (i = 0; i < PAPERS.length; i++) if (PAPERS[i].id === id) { p = PAPERS[i]; break; }
  if (!p) return;

  var tech = null;
  for (i = 0; i < DATA.techniques.length; i++) if (DATA.techniques[i].id === id) tech = DATA.techniques[i];

  var kv = [
    ["Stratum", p.stratum === APP ? "application-oriented" : "technical"],
    ["Contribution type", label(p.category)],
    ["Functional cluster", p.cluster],
    ["Application domain", label(p.domain)],
    ["Deployment maturity", p.maturity],
    ["Target medium", p.platform],
    ["Primary input", p.modality],
    ["Social configuration", p.social],
    ["Role of Gaussian Splatting", p.gs_role],
    ["Representation type", p.gs_type],
    ["Dataset provenance", label(p.dataset)],
    ["Reconstruction tooling", (p.tools_training || []).join(", ")],
    ["Delivery tooling", (p.tools_rendering || []).join(", ")]
  ].filter(function (r) { return r[1]; });

  var ev = [
    ["Human evaluation of Gaussian content", p.has_gs_study || (p.stratum === TECH ? "yes (inclusion rule)" : "")],
    ["Participants", p.participants],
    ["Study medium", label(p.study_platform)],
    ["Experimental design", label(p.design)],
    ["Control condition", p.control],
    ["Compared against a different representation", noted(p, "compared_different_representation")],
    ["Counterbalancing", p.counterbalancing],
    ["Viewpoint freedom", p.mobility],
    ["Sample", p.expert_sample],
    ["Validated instruments", p.instruments],
    ["Qualitative analysis", label(p.qual_method)],
    ["Rating protocol", p.protocol],
    ["Statistically tested", p.tested ? "yes" : "no"]
  ].filter(function (r) { return r[1] && r[1] !== "/ (no study)"; });

  var reporting = [
    ["Age", noted(p, "reports_age")], ["Gender", noted(p, "reports_gender")],
    ["Ethics or consent", noted(p, "reports_ethics")], ["Compensation", noted(p, "reports_compensation")],
    ["Vision screening", noted(p, "reports_vision_screening")],
    ["Nothing beyond N", noted(p, "reports_nothing_beyond_n")]
  ].filter(function (r) { return r[1]; });

  var html =
    '<div class="drawer-inner">' +
    '<button class="drawer-close" data-close aria-label="Close">&times;</button>' +
    '<div class="kicker" style="margin-bottom:14px">' + esc(p.venue_format) + " &middot; " + p.year + "</div>" +
    "<h2>" + esc(p.title) + "</h2>" +
    '<div class="authors">' + esc(p.authors.join(", ")) + "</div>" +
    '<div class="venue">' + esc(p.venue) + "</div>" +
    '<div class="actions">' +
    (p.doi ? '<a class="btn primary" href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">Open paper &#8599;</a>' : "") +
    '<button class="btn" data-bib="' + esc(p.id) + '">Download .bib</button>' +
    (p.doi ? '<button class="btn" data-copy="' + esc(p.doi) + '">Copy DOI</button>' : "") +
    "</div>" +
    (p.doi ? '<div style="font-size:13px;color:var(--ink-faint)" class="mono">doi:' + esc(p.doi) + "</div>" : "") +

    (p.abstract ? '<h3 class="sec">Abstract</h3><div class="abstract">' + esc(p.abstract) + "</div>" : "") +
    (p.contribution_summary ? '<h3 class="sec">What it contributes</h3><div class="abstract">' + esc(p.contribution_summary) + "</div>" : "") +

    '<h3 class="sec">How this paper is coded</h3><dl class="kv">' +
    kv.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(label(r[1])) + "</dd>"; }).join("") + "</dl>" +

    (ev.length ? '<h3 class="sec">Evaluation</h3><dl class="kv">' +
      ev.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>" : "") +

    (reporting.length ? '<h3 class="sec">Participant reporting</h3><dl class="kv">' +
      reporting.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>" : "") +

    (tech ? '<h3 class="sec">Authoring technique</h3>' +
      field("What the user authors", tech.authors_what) +
      field("Input", tech.input) +
      field("What stands in for the missing surface", tech.proxy) : "") +

    ((p.system_description || p.target_task) ? '<h3 class="sec">System</h3>' +
      field("Target task", p.target_task) + field("Description", p.system_description) +
      field("Target users", p.target_users) + field("Hardware", p.hardware) +
      field("Interaction", p.interaction_modality) : "") +

    ((p.capture_pipeline || p.scenes) ? '<h3 class="sec">Capture and data</h3>' +
      field("Capture pipeline", p.capture_pipeline) + field("Capture source", p.capture_source) +
      field("Scenes evaluated", p.scenes) : "") +

    ((p.study_task || p.study_result || p.results) ? '<h3 class="sec">What was measured, and found</h3>' +
      field("Study task", p.study_task) + field("Compared against", p.evaluated_against) +
      field("Custom measures", p.custom_metrics_detail || p.custom_metrics) +
      field("Result", p.study_result || p.results) + field("Participant feedback", p.user_feedback) : "") +

    ((p.accessibility || p.trust_note || p.memory_note || p.language_semantics) ?
      '<h3 class="sec">Cross-cutting themes</h3>' +
      field("Accessibility", p.accessibility) +
      field("Trust", [p.trust, p.trust_note].filter(Boolean).join(" — ")) +
      field("Memory", [p.memory, p.memory_note].filter(Boolean).join(" — ")) +
      field("Language and semantics", [p.language_semantics, p.language_semantics_note].filter(Boolean).join(" — ")) +
      field("Capture as a user task", [p.capture_as_user_task, p.capture_as_user_task_note].filter(Boolean).join(" — ")) : "") +

    ((p.justification || p.limitations || p.future_work) ? '<h3 class="sec">In the authors&rsquo; own words</h3>' +
      field("Why Gaussian Splatting", p.justification) +
      field("Stated limitations", p.limitations) +
      field("Called for next", p.future_work) : "") +

    (p.bibtex ? '<h3 class="sec">BibTeX</h3><pre class="bib">' + esc(p.bibtex) + "</pre>" : "") +
    "</div>";

  var scrim = document.createElement("div");
  scrim.className = "scrim";
  var drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.innerHTML = html;
  document.body.appendChild(scrim);
  document.body.appendChild(drawer);
  document.body.style.overflow = "hidden";

  function close() {
    if (scrim.parentNode) scrim.parentNode.removeChild(scrim);
    if (drawer.parentNode) drawer.parentNode.removeChild(drawer);
    document.body.style.overflow = "";
    if (location.hash.indexOf("#/paper/") === 0) history.back();
  }
  scrim.onclick = close;
  $("[data-close]", drawer).onclick = close;
  document.addEventListener("keydown", function onEsc(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onEsc); }
  });
  var bibBtn = $("[data-bib]", drawer);
  if (bibBtn) bibBtn.onclick = function () { downloadBib(p); };
  var copyBtn = $("[data-copy]", drawer);
  if (copyBtn) copyBtn.onclick = function (e) {
    if (navigator.clipboard) navigator.clipboard.writeText("https://doi.org/" + p.doi);
    e.target.textContent = "Copied";
  };
  drawer.scrollTop = 0;
}

function saveText(text, name) {
  var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
}
function downloadBib(p) { saveText(p.bibtex + "\n", p.id + ".bib"); }
function downloadBibSet(rows, name) {
  saveText(rows.map(function (p) { return p.bibtex; }).join("\n\n") + "\n", name + ".bib");
}

/* =============================================================== VIEWS === */

function viewOverview() {
  var years = barRows(PAPERS, "year").sort(function (a, b) { return a.value - b.value; });
  var venues = venueRows(10);
  var noMedium = noMediumCount();
  var appNs = PAPERS.filter(function (p) { return p.has_gs_study === "yes"; }).map(headlineN).filter(isFinite);
  var appClusters = barRows(PAPERS.filter(function (p) { return p.stratum === APP; }), "cluster");
  var techClusters = barRows(PAPERS.filter(function (p) { return p.stratum === TECH; }), "cluster");

  return '' +
  '<div class="hero">' +
    "<div>" +
      '<div class="kicker">A scoping review, opened up</div>' +
      '<h1 class="title">What do people actually <em>do</em> with Gaussian splats?</h1>' +
      '<p class="lede">3D Gaussian Splatting turns ordinary photographs into photorealistic ' +
      'scenes that render in real time on a consumer headset. This is a map of the ' + T.included +
      ' papers that put a human somewhere in that loop, as a user, a participant or a rater, ' +
      'coded across nineteen dimensions and open to your own questions.</p>' +
    "</div>" +
    '<div class="hero-aside">' +
      '<div class="kicker">Three things the map shows</div>' +
      '<ol class="findings">' +
      "<li><span><b>Immersion motivates the work; the evidence is rarely collected in a headset.</b> " +
        noMedium + " of " + T.human_evidence + " papers with human evidence (" +
        pct(noMedium, T.human_evidence) + "%) never name the presentation medium, and only " +
        T.in_headset_tech + " of " + T.technical + " technical papers put a participant in a headset.</span></li>" +
      "<li><span><b>The interaction surface is not the splat.</b> " + proxiedTools() + " of " +
        T.runtime_authoring + " runtime editing tools operate on proxy geometry rather than on the " +
        "splat, and no included paper contributes a locomotion technique.</span></li>" +
      "<li><span><b>Splats win every headset comparison, on thin evidence.</b> " + T.with_gs_study +
        " of " + T.application + " application papers evaluate Gaussian content with users, at a median of " +
        median(appNs) + " participants, and only " + exemplarCount() +
        " studies combine a comparison, a statistical test and a headset.</span></li>" +
      "</ol>" +
    "</div>" +
  "</div>" +

  '<div class="strip">' +
    stripCell("Corpus", T.included, "included papers, from 4,541 screened records", null, null) +
    stripCell("Stratum", T.application, "application-oriented: systems, workflows, artworks, studies",
              "stratum", APP, "app") +
    stripCell("Stratum", T.technical, "technical: methods where humans rate the output",
              "stratum", TECH, "tech") +
    stripCell("Evidence", T.in_headset_tech + " / " + T.technical,
              "technical papers evaluated in a headset (" + pct(T.in_headset_tech, T.technical) + "%)",
              "__headset_tech", "true") +
  "</div>" +

  '<section class="block">' +
    '<div class="kicker">Start from a question</div>' +
    '<h2 class="head">Five ways into the corpus</h2>' +
    '<p class="caption">Four doorways follow the review&rsquo;s research questions; the fifth ' +
    'turns the whole thing into practical guidance for building something yourself. Inside, ' +
    'every chart is clickable: pick a bar, a cell or a chip and you land in the paper list it stands for.</p>' +
    '<div class="rlist">' +
      rrow("#/rq1", "RQ1", "Where it is used, and what users get",
        "Domains, target media, maturity and the outcomes people actually report: presence, usability, task performance, comfort.",
        T.application + " application papers") +
      rrow("#/rq2", "RQ2", "Building and touching the content",
        "Who authors a splat, with what input, and the proxy geometry most techniques build to stand in for the missing surface.",
        T.authoring + " authoring papers, " + T.runtime_authoring + " runtime tools") +
      rrow("#/rq3", "RQ3", "How well any of it is evidenced",
        "Study designs, samples, media, measures and reporting. Narrow the corpus yourself and watch how fast the well-evidenced set shrinks.",
        T.human_evidence + " papers with human evidence") +
      rrow("#/rq4", "RQ4", "What is missing",
        "Six open directions, each tied to a gap you can see in the data, plus what the papers themselves ask for in their own future-work sections.",
        "the research agenda") +
      rrow("#/build", "Guide", "Building one yourself",
        "Whether the representation fits your task, what to capture, which proxy geometry your interaction needs, and what to report so the result counts as evidence.",
        "six steps for practitioners") +
    "</div>" +
  "</section>" +

  '<section class="block">' +
    sectionHead(figNo("Growth"), "Included papers per year",
      "2026 covers January to August only. No paper from 2023, the year the technique appeared, met the criteria.") +
    bars({ rows: years, field: "year", labelWidth: 52 }) +
  "</section>" +

  '<div class="pair">' +
    "<div>" +
      sectionHead(figNo("Venues"), "Where this work is published",
        "The ten most frequent venues, covering " +
        venues.reduce(function (s, r) { return s + r.app + r.tech; }, 0) + " of " + T.included +
        " included studies. Graphics and VR engineering venues dominate and core HCI venues are " +
        "nearly absent. Publication series and megajournals (Lecture Notes in Computer Science, " +
        "IEEE Access and the like) are containers rather than venues and are left out, as in the " +
        "paper.") +
      bars({ rows: venues, field: "venue_short", labelWidth: 164, thin: true, legend: false }) +
    "</div>" +
    "<div>" +
      sectionHead(figNo("Clusters"), "What the papers build",
        "Every paper sits in exactly one functional cluster. The two strata have separate cluster " +
        "vocabularies, so a cluster belongs to one stratum by construction, exactly as in the " +
        "paper&rsquo;s coded dataset. Application clusters first, then technical.") +
      '<div class="kicker" style="margin-bottom:10px">Application-oriented</div>' +
      bars({ rows: appClusters, field: "cluster", scope: { stratum: APP },
             labelWidth: 186, thin: true, legend: false, wrapLabels: true,
             max: Math.max.apply(null, appClusters.concat(techClusters).map(function (r) { return r.app + r.tech; })) }) +
      '<div class="kicker" style="margin:22px 0 10px">Technical</div>' +
      bars({ rows: techClusters, field: "cluster", scope: { stratum: TECH },
             labelWidth: 186, thin: true, legend: false, wrapLabels: true,
             max: Math.max.apply(null, appClusters.concat(techClusters).map(function (r) { return r.app + r.tech; })) }) +
    "</div>" +
  "</div>" +

  '<div class="strip-actions">' +
    '<a class="btn primary" href="#/corpus">Open the corpus explorer</a>' +
    '<a class="btn" href="data/corpus.bib" download>Download all ' + T.included + " BibTeX entries</a>" +
  "</div>";
}

function stripCell(head, value, note, field, filterValue, swatch) {
  var attrs = field ? ' data-strip="' + esc(field) + "|" + esc(filterValue) + '"' : ' data-strip="|"';
  return '<button class="strip-cell"' + attrs + '>' +
    '<span class="strip-head">' + esc(head) + "</span>" +
    '<span class="strip-value">' + value +
    (swatch ? '<span class="swatch ' + swatch + '"></span>' : "") + "</span>" +
    '<span class="strip-note">' + note + "</span></button>";
}

function rrow(href, tag, title, desc, cta) {
  return '<a class="rrow" href="' + href + '">' +
    '<span class="rrow-tag">' + esc(tag) + "</span>" +
    "<span><span class='rrow-title'>" + esc(title) + "</span>" +
    "<span class='rrow-desc'>" + esc(desc) + "</span></span>" +
    '<span class="rrow-cta">' + esc(cta) + " &rarr;</span></a>";
}

/* ------------------------------------------------------------------ RQ1 -- */

var THEMES = [
  { key: "language", label: "Language and semantics", field: "language_semantics",
    test: function (p) { return p.language_semantics && p.language_semantics !== "none"; } },
  { key: "capture", label: "Capture treated as a user task", field: "capture_as_user_task",
    test: function (p) { return /^yes|^partly/.test(p.capture_as_user_task || ""); } },
  { key: "memory", label: "Memory as a theme", field: "memory",
    test: function (p) { return ["central focus", "addressed"].indexOf(p.memory) !== -1; } },
  { key: "trust", label: "Trust addressed", field: "trust",
    test: function (p) { return ["central focus", "measured", "discussed"].indexOf(p.trust) !== -1; } },
  { key: "accessibility", label: "Accessibility addressed", field: "accessibility",
    test: function (p) { return p.accessibility && !/^not specified$|^none$/i.test(p.accessibility); } }
];

/* One box per theme, each opening its own papers in the paper list. The counts
   are keyword-derived lower bounds over the application stratum, which is why the
   box says "at least". */
function themeBoxes(app) {
  return '<div class="theme-grid">' + THEMES.map(function (th) {
    var n = app.filter(th.test).length;
    return '<button class="theme-box" data-open="__theme|' + esc(th.key) + '">' +
      '<span class="theme-n">' + n + "</span>" +
      '<span class="theme-label">' + esc(th.label) + "</span>" +
      '<span class="theme-cta">of ' + app.length + " application papers &rarr;</span>" +
      "</button>";
  }).join("") + "</div>";
}

function viewRQ1() {
  var app = PAPERS.filter(function (p) { return p.stratum === APP; });
  var headset = app.filter(function (p) { return ["VR HMD", "MR/AR HMD"].indexOf(p.platform) !== -1; }).length;
  var flat = app.filter(function (p) {
    return ["desktop monitor", "web browser", "mobile/tablet"].indexOf(p.platform) !== -1;
  }).length;
  var single = app.filter(function (p) { return p.social === "single-user"; }).length;
  var domains = Object.keys(countBy(app, "domain")).filter(function (d) { return d !== "other"; }).length;
  var proto = app.filter(function (p) { return ["lab prototype", "concept/demo"].indexOf(p.maturity) !== -1; }).length;
  var shipped = app.filter(function (p) { return ["deployed in practice", "commercial product"].indexOf(p.maturity) !== -1; }).length;

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">RQ1 &middot; Application landscape and user value</div>' +
    '<h1 class="title sub">Where 3DGS is used, and what users get</h1>' +
    '<p class="lede">' + domains + ' named domains, ' + app.length + ' systems, and a spread that is wide ' +
    'but shallow: ' + proto + ' prototypes and demos against ' + shipped + ' deployments and products, ' +
    'and ' + pct(single, app.length) + '% of systems built for one person alone.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +

  '<section class="block">' +
    sectionHead(figNo("Domains"), "One primary domain per application paper",
      "Technical papers rarely commit to a deployment sector, so these " + app.length +
      " application papers are the denominator throughout this page.") +
    bars({ rows: barRows(app, "domain"), field: "domain", scope: { stratum: APP },
           labelWidth: 250, thin: true, legend: false, wrapLabels: true,
           gridSteps: 6, ticks: 5 }) +
  "</section>" +

  '<section class="block">' +
    sectionHead(figNo("Input follows the platform"), "Target medium by primary input",
      headset + " of " + app.length + " systems are headset-first; " + flat +
      " target a flat screen. Ringed cells are combinations no included paper has tried.") +
    heatmap(app, "platform_group", "modality_group", "primary input",
            { stratum: APP }, HEAT_ROWS, HEAT_COLS) +
  "</section>" +

  '<div class="pair">' +
    "<div>" +
      sectionHead(figNo("Deployment maturity"), "How far these systems get",
        "Nothing is stopping this from being a field of prototypes.") +
      bars({ rows: barRows(app, "maturity"), field: "maturity", scope: { stratum: APP },
             labelWidth: 150, thin: true, legend: false, wrapLabels: true }) +
    "</div>" +
    "<div>" +
      sectionHead(figNo("Social configuration"), "Who is in the scene",
        single + " of " + app.length + " systems (" + pct(single, app.length) +
        "%) are single-user, even though telepresence is a top-five domain.") +
      bars({ rows: barRows(app, "social"), field: "social", scope: { stratum: APP },
             labelWidth: 150, thin: true, legend: false, wrapLabels: true }) +
    "</div>" +
  "</div>" +

  '<section class="block">' +
    '<div class="kicker">Cross-cutting themes</div>' +
    '<h2 class="head">Five things that cut across every domain</h2>' +
    '<p class="caption">Charted as free text, so these counts are lower bounds on what a full ' +
    're-read would find. Open a theme to read the papers behind it.</p>' +
    themeBoxes(app) +
  "</section>" +

  '<section class="block">' +
    sectionHead(tblNo("Outcomes"), "Where authors report it winning, and where they concede it loses",
      DATA.outcomes.intro) +
    outcomesPanel() +
  "</section>";
}

function outcomesPanel() {
  var byId = {};
  PAPERS.forEach(function (p) { byId[p.id] = p; });
  function sources(keys) {
    return keys.map(function (k) {
      var p = byId[k];
      if (!p) return "";
      var name = p.authors.length ? p.authors[0].split(" ").pop() : k;
      return '<button class="srcbtn" data-paper="' + esc(k) + '">' + esc(name) + " " + p.year + "</button>";
    }).join("");
  }
  function side(title, rows) {
    return '<div class="axis-col"><h4>' + title + "</h4><ul class='outcome'>" +
      rows.map(function (r) {
        return "<li>" + esc(r.text) + sources(r.papers) + "</li>";
      }).join("") + "</ul></div>";
  }
  return DATA.outcomes.axes.map(function (a) {
    return '<div class="axis"><h3>' + esc(a.axis) + "</h3>" +
      '<p class="implication">' + esc(a.implication) + "</p>" +
      '<div class="axis-cols">' + side("Where authors report it winning", a.wins) +
      side("Where authors concede it loses", a.losses) + "</div></div>";
  }).join("") +
  '<div class="axis"><h3>' + esc(DATA.outcomes.metric_divergence.heading) + "</h3>" +
  '<p class="implication" style="max-width:52em">' + esc(DATA.outcomes.metric_divergence.text) +
  sources(DATA.outcomes.metric_divergence.papers) + "</p></div>";
}

/* ------------------------------------------------------------------ RQ2 -- */

function viewRQ2() {
  var authoring = PAPERS.filter(function (p) { return p.authoring_locus; });
  var byId = {};
  PAPERS.forEach(function (p) { byId[p.id] = p; });
  var groups = [];
  DATA.techniques.forEach(function (t) { if (groups.indexOf(t.group) === -1) groups.push(t.group); });

  var rows = groups.map(function (g) {
    var items = DATA.techniques.filter(function (t) { return t.group === g; });
    return '<tr class="grp"><td colspan="5">' + esc(g) + " &middot; " + items.length + "</td></tr>" +
      items.map(function (t) {
        var p = byId[t.id] || {};
        var n = headlineN(p);
        var ev = p.has_gs_study === "yes"
          ? "N=" + (isFinite(n) ? n : "?") + (p.tested ? " †" : "") + (p.in_headset ? " *" : "")
          : "&mdash;";
        return "<tr>" +
          '<td><button class="sys" data-paper="' + esc(t.id) + '">' + esc(t.name) + "</button></td>" +
          "<td>" + esc(t.authors_what) + "</td><td>" + esc(t.input) + "</td>" +
          "<td>" + esc(t.proxy) + "</td>" +
          '<td style="white-space:nowrap">' + ev + "</td></tr>";
      }).join("");
  }).join("");

  var evaluated = DATA.techniques.filter(function (t) {
    return (byId[t.id] || {}).has_gs_study === "yes";
  }).length;

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">RQ2 &middot; Building and interacting with Gaussian content</div>' +
    '<h1 class="title sub">The interaction surface is not the splat</h1>' +
    '<p class="lede">' + T.authoring + ' papers let a person create or change Gaussian content. ' +
    'Only ' + T.runtime_authoring + ' do it through an interface built for an end user, and in ' +
    proxiedTools() + ' of them what the hand actually touches is a layer of proxy geometry ' +
    'standing in for the surface the representation does not have.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +

  '<section class="block">' +
    sectionHead(figNo("Authoring loci"), T.authoring + " authoring papers, four loci",
      "Only the first group answers what an <em>end user</em> can do to a splat.") +
    bars({ rows: barRows(authoring, "authoring_locus"), field: "authoring_locus",
           labelWidth: 230, thin: true, legend: false, wrapLabels: true }) +
  "</section>" +

  '<section class="block">' +
    sectionHead(tblNo("The proxy layer"),
      T.runtime_authoring + " runtime authoring tools, and what each puts under the user&rsquo;s hand",
      "The fourth column is the answer to RQ2. The proxy is chosen by the <em>act</em>, not by " +
      "the scene: physics gets cages and particle fields, grabbing gets a sphere or a box, " +
      "cutting gets a signed-distance field, and selection alone can run on the primitives " +
      "themselves. Evidence column: &dagger; statistically tested, * evaluated in a headset. " +
      evaluated + " of " + T.runtime_authoring + " report any human evaluation.") +
    '<div class="tablewrap"><table class="data"><thead><tr>' +
      '<th style="width:11%">System</th><th style="width:26%">What the user authors</th>' +
      '<th style="width:13%">Input</th><th style="width:36%">What stands in for the missing surface</th>' +
      '<th style="width:9%">Evidence</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
    '<p class="pullquote">No included paper contributes a locomotion technique for splat scenes, ' +
    'even though ' + roamCount() + ' of the ' + T.with_gs_study + ' application studies let participants ' +
    'roam through one. Navigation is the one act with no proxy tradition, and no technique.</p>' +
  "</section>" +

  '<div class="pair">' +
    "<div>" +
      sectionHead(figNo("Representation type"), "What kind of Gaussian model each paper builds",
        "One primary type per paper, as in the paper's figure. The two strata invert each other: " +
        "applications reconstruct real places, technical work edits, generates and animates.") +
      bars({ rows: gsTypeRows(), field: "gs_type_primary", labelWidth: 210, thin: true,
             wrapLabels: true }) +
    "</div>" +
    "<div>" +
      sectionHead(figNo("Dataset provenance"), "Where the evaluated scenes come from",
        "Shares of each stratum, with counts printed in the segments. Applications capture their " +
        "own; technical work evaluates on the same handful of public scenes.") +
      provenanceChart() +
    "</div>" +
  "</div>" +

  '<section class="block">' +
    '<div class="kicker">Tooling</div>' +
    '<h2 class="head">An off-the-shelf ecosystem</h2>' +
    '<p class="caption">Counted live from the charted capture-pipeline and platform prose, and ' +
    'split by what the tool is for. A paper that never names its tooling cannot be counted, so ' +
    'these are lower bounds. The split matters: the reconstruction side is a research ecosystem, ' +
    'the delivery side is one game engine, reached in roughly a quarter of cases through a single ' +
    'community plugin, which is why the VR-specific rendering fixes published in the technical ' +
    'stratum rarely reach the viewers applications actually ship.</p>' +
    '<div class="pair" style="margin-top:0">' +
      "<div>" +
        sectionHead(figNo("Reconstruction and training"), "What a team used to make the splat",
          "Click a tool to open the papers that name it.") +
        toolBars(DATA.tools.training, "training") +
      "</div>" +
      "<div>" +
        sectionHead(figNo("Delivery and rendering"), "What they used to show it",
          "Click a tool to open the papers that name it.") +
        toolBars(DATA.tools.rendering, "rendering") +
      "</div>" +
    "</div>" +
  "</section>";
}

function toolBars(list, kind) {
  var rows = list.map(function (t) {
    return { value: t.name, label: t.name, app: t.app, tech: t.tech };
  });
  return bars({ rows: rows, field: "__tool_" + kind, labelWidth: 200, thin: true,
               legend: true, wrapLabels: true });
}

/* ------------------------------------------------------------------ RQ3 -- */

var FUNNEL = [
  { label: "Every included paper", sub: "the whole corpus",
    field: null, test: function () { return true; } },
  { label: "Reports its own human evaluation of Gaussian content",
    sub: "excludes the application papers whose human study was not about the Gaussian content; the technical stratum qualifies by inclusion rule",
    field: "human_evidence", value: "true", test: function (p) { return p.human_evidence; } },
  { label: "Ran in a VR or AR headset",
    sub: "the medium nearly all of this work is motivated by",
    field: "in_headset", value: "true", test: function (p) { return p.in_headset; } },
  { label: "Applied an inferential test",
    sub: "a named test, confidence interval or effect size",
    field: "tested", value: "true", test: function (p) { return p.tested; } },
  { label: "Compared against a genuinely different representation",
    sub: "a mesh, a NeRF, a point cloud, video or a CAD model, not a Gaussian variant. Charted for the application stratum only",
    field: "compared_different_representation", value: "yes",
    test: function (p) { return p.compared_different_representation === "yes"; } },
  { label: "Used a validated instrument",
    sub: "SUS, NASA-TLX, IPQ, SSQ and the like, rather than an ad hoc scale",
    field: "validated_instrument", value: "true", test: function (p) { return p.validated_instrument; } }
];

function viewRQ3() {
  var withEvidence = PAPERS.filter(function (p) { return p.human_evidence; });
  var appStudies = PAPERS.filter(function (p) { return p.has_gs_study === "yes"; });
  var appNs = appStudies.map(headlineN).filter(isFinite);
  var techNs = PAPERS.filter(function (p) { return p.stratum === TECH; }).map(headlineN).filter(isFinite);

  var validatedAll = PAPERS.filter(function (p) { return p.validated_instrument; }).length;
  var crossRep = PAPERS.filter(function (p) {
    return FUNNEL.slice(0, 5).every(function (s) { return s.test(p); });
  }).length;
  var active = window.__funnelDepth == null ? FUNNEL.length - 1 : window.__funnelDepth;
  var steps = FUNNEL.map(function (step, i) {
    /* two different numbers, and the difference between them is the point:
       how many papers meet this one condition, and how many still stand once
       every condition above it has also been applied */
    var alone = PAPERS.filter(step.test).length;
    var n = PAPERS.filter(function (p) {
      return FUNNEL.slice(0, i + 1).every(function (s) { return s.test(p); });
    }).length;
    var aloneNote = i === 0 ? "" :
      '<span class="funnel-alone">' + alone + " meet this on its own</span>";
    return '<button class="funnel-step' + (i <= active ? "" : " off") + '" data-funnel="' + i + '">' +
      '<span class="funnel-q">' + esc(step.label) + "<small>" + esc(step.sub) + "</small>" +
      aloneNote + "</span>" +
      '<span class="funnel-track"><i style="width:' + ((n / T.included) * 100) + '%"></i></span>' +
      '<span class="funnel-n">' + n + "</span></button>";
  }).join("");

  var finalSet = PAPERS.filter(function (p) {
    return FUNNEL.slice(0, active + 1).every(function (s) { return s.test(p); });
  });

  var sizeRows = NBINS.map(function (b) {
    var lo = Number(b[0].split("-")[0]), hi = Number(b[0].split("-")[1]);
    return { value: b[0], label: b[1],
             app: appNs.filter(function (n) { return n >= lo && n < hi; }).length,
             tech: techNs.filter(function (n) { return n >= lo && n < hi; }).length };
  });

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">RQ3 &middot; Empirical maturity and gaps</div>' +
    '<h1 class="title sub">Immersively motivated, flatly evidenced</h1>' +
    '<p class="lede">Papers justify Gaussian Splatting through presence and immersion, then ' +
    'evaluate it with unstandardised rating scales, on an unnamed medium, in three quarters of the ' +
    'technical stratum. This page lets you stack the requirements yourself and see what survives.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +

  '<section class="block">' +
    sectionHead(figNo("The evidence funnel"), "Add a requirement, watch the corpus shrink",
      "Each row is a condition a reader might reasonably ask of evidence that this " +
      "representation helps a user, and <b>the rows are cumulative</b>: the bar and the " +
      "large number count the papers that meet this condition <em>and every condition " +
      "above it</em>. The small number is how many meet that one condition on its own. " +
      "The gap between the two is the finding. " + validatedAll + " papers use a validated " +
      "instrument, for instance, but only a handful of those also tested in a headset " +
      "against a different representation. Click any row to stop the chain there.") +
    '<div class="funnel">' + steps + "</div>" +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-top:18px">' +
      '<span style="font-size:15px;color:var(--ink-body)"><b style="font-size:19px">' +
      finalSet.length + "</b> " + plural(finalSet.length, "paper") + " clear " + (active + 1) +
      " " + plural(active + 1, "requirement") + ".</span>" +
      '<button class="btn" id="funnel-show">Show these papers</button>' +
      '<button class="btn" id="funnel-bib">Download their BibTeX</button>' +
    "</div>" +
    '<p class="pullquote">Stopping at &ldquo;compared against a genuinely different ' +
    'representation&rdquo; leaves ' + crossRep + ' papers. That is the whole of the statistically tested, ' +
    'in-headset, cross-representation evidence that this representation helps a user, and it is ' +
    'the number the paper reports. The site derives it here from the coded columns rather than ' +
    'restating it.</p>' +
  "</section>" +

  '<div class="pair">' +
    "<div>" +
      sectionHead(figNo("Sample sizes"), "How many people each stratum asks",
        "Median " + median(appNs) + " in the application stratum (n = " + appNs.length +
        " reporting), " + median(techNs) + " in the technical stratum (n = " + techNs.length +
        "). The strata are measuring different things with the same word.") +
      bars({ rows: sizeRows, field: "__nbin", labelWidth: 120, thin: true }) +
    "</div>" +
    "<div>" +
      sectionHead(figNo("Assessment medium"), "Where the human evidence was collected",
        "Across all " + T.included + " papers.") +
      bars({ rows: barRows(PAPERS.filter(function (p) {
               return p.study_platform && p.study_platform !== "/ (no study)";
             }), "study_platform"), field: "study_platform", labelWidth: 180, thin: true,
             wrapLabels: true }) +
    "</div>" +
  "</div>" +

  '<section class="block">' +
    '<div class="kicker">Practice</div>' +
    '<h2 class="head">How the ' + appStudies.length + " application studies were run</h2>" +
    '<div class="quad" style="margin-top:26px">' +
      quadChart("Experimental design", "Whether anything was compared",
        barRows(appStudies, "design"), "design", { has_gs_study: "yes" }) +
      quadChart("Viewpoint freedom", "The artifacts that distinguish splats are view-dependent",
        barRows(appStudies, "mobility"), "mobility", { has_gs_study: "yes" }) +
      quadChart("Who was recruited", "Systems target professionals, studies recruit students",
        barRows(appStudies, "expert_sample"), "expert_sample", { has_gs_study: "yes" }) +
      quadChart("Qualitative analysis", "Interviews collected, method named",
        barRows(appStudies, "qual_method"), "qual_method", { has_gs_study: "yes" }) +
    "</div>" +
  "</section>" +

  '<section class="block">' +
    sectionHead(figNo("Rating protocols"), "What the technical stratum calls a study",
      "Broadcast-grade subjective protocols exist and are used by a handful of papers. Most of " +
      "the stratum rates on an ad hoc scale.") +
    bars({ rows: barRows(PAPERS, "protocol"), field: "protocol", labelWidth: 280, thin: true,
           legend: false, wrapLabels: true }) +
  "</section>" +

  '<section class="block">' +
    sectionHead(tblNo("Participant reporting"),
      "What the " + withEvidence.length + " papers with human evidence say about their participants",
      "An attribute counts as reported only where it is named in a clause that does not negate " +
      "it, so a cell reading &ldquo;no age or gender is reported&rdquo; counts as neither. " +
      "&ldquo;Nothing beyond N&rdquo; means no participant information except a count. Click any " +
      "row to read the papers that do report it.") +
    reportingTable() +
  "</section>";
}

function quadChart(title, head, rows, field, scope) {
  return "<div>" +
    sectionHead(figNo(title), esc(head), "") +
    bars({ rows: rows, field: field, scope: scope, labelWidth: 132, thin: true,
           legend: false, wrapLabels: true }) + "</div>";
}

function reportingTable() {
  var app = PAPERS.filter(function (p) { return p.stratum === APP && p.has_gs_study === "yes"; });
  var tech = PAPERS.filter(function (p) { return p.stratum === TECH; });
  var attrs = [
    ["Age (any form)", "reports_age"], ["Gender", "reports_gender"],
    ["Ethics approval or consent", "reports_ethics"], ["Compensation", "reports_compensation"],
    ["Vision screening", "reports_vision_screening"], ["Nothing beyond N", "reports_nothing_beyond_n"]
  ];
  var rows = attrs.map(function (a) {
    var na = app.filter(function (p) { return p[a[1]] === "yes"; }).length;
    var nt = tech.filter(function (p) { return p[a[1]] === "yes"; }).length;
    return '<tr><td><button class="sys" data-open="' + a[1] + '|yes">' + esc(a[0]) + "</button></td>" +
      "<td>" + na + " (" + pct(na, app.length) + "%)</td>" +
      "<td>" + nt + " (" + pct(nt, tech.length) + "%)</td>" +
      "<td>" + (na + nt) + " (" + pct(na + nt, app.length + tech.length) + "%)</td></tr>";
  }).join("");
  return '<div class="tablewrap"><table class="data" style="min-width:560px"><thead><tr>' +
    "<th>Reported</th><th>Application (n = " + app.length + ")</th>" +
    "<th>Technical (n = " + tech.length + ")</th>" +
    "<th>Total (n = " + (app.length + tech.length) + ")</th></tr></thead><tbody>" +
    rows + "</tbody></table></div>";
}

/* ------------------------------------------------------------------ RQ4 -- */

function viewRQ4() {
  var app = PAPERS.filter(function (p) { return p.stratum === APP; });
  var studies = PAPERS.filter(function (p) { return p.has_gs_study === "yes"; });
  var single = app.filter(function (p) { return p.social === "single-user"; }).length;
  var singleStudy = studies.filter(function (p) { return p.social === "single-user"; }).length;
  var deployed = app.filter(function (p) {
    return ["deployed in practice", "commercial product", "pilot with target users"].indexOf(p.maturity) !== -1;
  }).length;
  var proto = app.filter(function (p) {
    return ["lab prototype", "concept/demo"].indexOf(p.maturity) !== -1;
  }).length;
  var expert = studies.filter(function (p) { return p.expert_sample === "yes"; }).length;
  var interaction = PAPERS.filter(function (p) { return p.category === "INTERACTION"; }).length;
  var byId = {};
  PAPERS.forEach(function (p) { byId[p.id] = p; });
  var unevaluated = DATA.techniques.filter(function (t) {
    return byId[t.id] && byId[t.id].has_gs_study !== "yes";
  }).length;
  var noMedium = noMediumCount();
  var crossRepTested = exemplarCount();

  var participatory = studies.filter(function (p) {
    return /^yes|^partly/.test(p.participatory_design || "");
  }).length;
  var trust = app.filter(function (p) {
    return p.trust && p.trust !== "not addressed";
  }).length;

  /* The paper's Research Agenda, Subsection 6.7, in its own words. Counts are
     interpolated from the coded columns so the page cannot drift from the
     workbook, but the sentences around them are the paper's. */
  var items = [
    ["In-headset perceptual evaluation and Gaussian-specific quality instruments",
     "PSNR, SSIM and LPIPS remain the benchmarks for technical optimisation, and this corpus " +
     "shows where they stop. A validated, immersion-native quality and experience instrument " +
     "is the missing piece. Building it needs graphics and HCI researchers at the same table, " +
     "since one side owns the artifacts and the other the psychometrics.",
     "<b>" + T.in_headset_tech + "</b> of " + T.technical + " technical papers put a participant in a headset",
     "in_headset|false"],
    ["Standardised reporting floors",
     "The variance in reported display devices, frame rates, capture setups and participant " +
     "details is what a three-year-old field looks like, not a methodological deficit. A " +
     "lightweight reporting floor, covering participant count and recruitment, presentation " +
     "medium and device, viewpoint freedom, design, statistical treatment and study " +
     "limitations, would make studies comparable across venues at the cost of a paragraph. " +
     "The " + crossRepTested + " studies that already meet it show the format exists.",
     "<b>" + noMedium + "</b> papers with human evidence never name the presentation medium",
     "study_platform|not specified"],
    ["Interaction techniques and the proxy layer",
     "The runtime editing tools establish feasibility, and " + unevaluated + " of the " +
     T.runtime_authoring + " have not yet met a user. Evaluating them with target user groups " +
     "is the next step. The proxy layer they build and the unclaimed navigation problem belong " +
     "to the same direction.",
     "<b>" + interaction + "</b> papers contribute a reusable interaction technique",
     "category|INTERACTION"],
    ["Collaborative and multi-user spaces",
     "Single-user systems dominate because rendering, memory and bandwidth on consumer " +
     "headsets constrain shared scenes. As avatar methods mature and telepresence grows, the " +
     "question moves from what one person can do in a capture to what two or more can do " +
     "there together.",
     "<b>" + single + "</b> of " + app.length + " systems and <b>" + singleStudy + "</b> of " +
       studies.length + " studies are single-user",
     "social|single-user"],
    ["Deployment, participation and longitudinal value",
     "Lab prototypes map the boundaries of a new medium, and " + proto + " of " + app.length +
     " application systems are still there. Longitudinal and in-the-wild deployments would " +
     "show whether the usability ratings of first sessions persist beyond first contact. " +
     "Participatory and co-design methods, present in " + participatory + " of " +
     studies.length + " studies, would let the intended user communities shape the systems " +
     "built for them.",
     "<b>" + proto + "</b> prototypes and concept demos against <b>" + deployed +
       "</b> pilots, deployments and products",
     "maturity|lab prototype"],
    ["Target populations, accessibility and sociotechnical trust",
     expert + " studies recruited the practitioners the systems are for, because clinicians, " +
     "educators and field technicians are hard to reach. As 3DGS applications approach " +
     "deployment in those domains, evaluation with them decides real-world utility. " +
     "Photorealistic reconstructions also represent real people and authentic places, so " +
     "provenance, consent and trust, addressed in " + trust + " of " + app.length + " papers, " +
     "are HCI questions this community is placed to answer.",
     "<b>" + expert + "</b> of " + studies.length + " studies recruited a genuinely expert sample",
     "expert_sample|yes"]
  ];

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">RQ4 &middot; Research agenda</div>' +
    '<h1 class="title sub">Six directions the included corpus leaves open</h1>' +
    '<p class="lede">The empty regions of the coded map and the field&rsquo;s own calls together ' +
    'yield six directions, ordered roughly by the strength of the evidence for each. Each one ' +
    'already has worked examples in the corpus, and this map is built to find them: filtered by ' +
    'direction it becomes a reading list.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +

  '<section class="block"><div class="agenda">' +
    items.map(function (it, i) {
      return '<div class="agenda-item"><div class="agenda-num">' + (i + 1) + "</div><div>" +
        "<h4>" + esc(it[0]) + "</h4><p>" + esc(it[1]) + "</p>" +
        '<div class="agenda-ev">' + it[2] +
        ' &middot; <button class="linkish" data-open="' + esc(it[3]) + '">see the papers</button>' +
        "</div></div></div>";
    }).join("") +
  "</div></section>";
}

/* --------------------------------------------------------- build guide -- */

/* What each technique puts under the hand, in one clause a builder can act on.
   The precise charted sentence stays in the Authoring table; this is the same
   fact said plainly. Keyed by technique id so an unlisted row falls back to the
   coded kind rather than showing nothing. */
var PROXY_SHORT = {
  lee2026humanintheloa: "nothing extra: labels are carried on the splats themselves",
  watanabe2025sketchrodgs: "a polyline mesh threaded through the splat centres",
  yu2025clip: "a bounding box in world space",
  waldow2025dimsplat: "a cuboid, intersected from two camera views",
  yin2026mixed: "converted out to a point cloud, then registered to a CAD model",
  gao2025towards: "a nearest-neighbour seam, then point sampling across it",
  schutz2025splatshop: "nothing extra: the splats are the handles",
  pandey2025painting: "a position and a normal fitted where the cursor lands",
  shen2025gaussianshop: "nothing extra for picking; drawn point clouds only for generating",
  tong2026clipgsvr: "no geometry: opacity faded by distance to a cutting plane",
  lanvin2026intrinsic: "a plane fitted to the splats you drag across",
  zhang20263dinkgen: "nothing: the whole object regenerates on every change",
  tsai2025dreamcraft: "depth layers for the backdrop, meshes for the movable objects",
  vachha2025dreamcrafter: "a mesh hidden inside each object",
  jambon2026excellgen: "a voxel grid that carries the structure",
  hu2025thing2realit: "a sphere collider around each object",
  jiang2024VR: "a tetrahedral cage per object, 10k to 30k vertices",
  luo2025vrdoh: "a particle field, plus simple shapes for the hands and tools",
  mao2026livegs: "meshes for soft bodies, voxels for rigid ones",
  fan2026motion: "a learned hierarchy of splat groups",
  taniguchi2024gaussmr: "a signed-distance field derived from the splats",
  bui2026XROIGS: "a watertight collision mesh per object",
  ai2026nli4volvis: "one trained model per component, carrying normals for lighting",
  deng2025omnimap: "a voxel grid alongside the splats",
  ishigami2026annotation: "an invisible mesh aligned to the splat"
};

/* One line of advice per act, synthesised from the group's techniques. */
var PROXY_NEED = {
  "Selecting and segmenting":
    "A volume to test against, or nothing at all. A box or a cuboid is enough to pick a " +
    "region; only extracting a thin structure needs real geometry.",
  "Cleaning up, painting and slicing":
    "A local surface estimate. Painting and retexturing need a position and a normal where " +
    "the cursor lands. Slicing needs no geometry, only opacity faded by distance to a plane.",
  "Generating and stylizing":
    "Usually a mesh, because the generated object leaves Gaussian space before the user " +
    "ever touches it. Budget for the conversion, not for the splat.",
  "Manipulating and deforming":
    "A simulation body: a cage, a particle field or a collision mesh, sized well below the " +
    "splat count so the solver keeps up.",
  "Querying and authoring at view time":
    "A structure to address rather than to touch. A voxel grid, a per-component model or an " +
    "invisible co-registered mesh gives the query something to name."
};

function proxyAdvice() {
  var byId = {};
  PAPERS.forEach(function (p) { byId[p.id] = p; });
  var groups = [];
  DATA.techniques.forEach(function (t) { if (groups.indexOf(t.group) === -1) groups.push(t.group); });
  return groups.map(function (g) {
    var items = DATA.techniques.filter(function (t) { return t.group === g; });
    var evaluated = items.filter(function (t) { return (byId[t.id] || {}).has_gs_study === "yes"; }).length;
    var direct = items.filter(function (t) { return t.substitute !== "auxiliary layer"; }).length;
    var mix = direct
      ? items.length - direct + " of " + items.length + " build a layer, " + direct +
        " work on the splats as they are"
      : "all " + items.length + " build a layer";
    return "<tr><td><b style='color:var(--ink)'>" + esc(g) + "</b><br>" +
      "<span style='font-size:13px;color:var(--ink-faint)'>" + mix + " &middot; " +
      evaluated + " of " + items.length + " met a user</span></td>" +
      "<td>" + esc(PROXY_NEED[g] || "") + "</td>" +
      "<td>" + items.map(function (t) {
        var short = PROXY_SHORT[t.id] || t.substitute;
        return "<div style='margin-bottom:7px'>" +
          '<button class="sys" data-paper="' + esc(t.id) + '">' + esc(t.name) + "</button> " +
          "<span style='color:var(--ink-faint)'>" + esc(short) + "</span></div>";
      }).join("") + "</td></tr>";
  }).join("");
}

function viewBuild() {
  var app = PAPERS.filter(function (p) { return p.stratum === APP; });
  var studies = PAPERS.filter(function (p) { return p.has_gs_study === "yes"; });
  var headset = app.filter(function (p) { return ["VR HMD", "MR/AR HMD"].indexOf(p.platform) !== -1; }).length;
  var selfCapture = app.filter(function (p) {
    return ["self-captured only", "mixed custom + public"].indexOf(p.dataset) !== -1;
  }).length;
  var captureTask = app.filter(function (p) { return /^yes|^partly/.test(p.capture_as_user_task || ""); }).length;
  var validated = studies.filter(function (p) { return p.validated_instrument; }).length;
  var exemplars = PAPERS.filter(function (p) {
    return p.tested && p.in_headset && p.compared_different_representation === "yes";
  });
  var noHardware = app.filter(function (p) { return !p.hardware; }).length;
  /* audit C169a: the charted limitations cell records that the paper acknowledges no
     limitation of its own human study */
  var noLimit = PAPERS.filter(function (p) {
    return p.stratum === TECH && /not acknowledged|no limitation|unstated study limitation|no dedicated limitations section|does not state (?:any )?limitation/i.test(p.limitations || "");
  }).length;

  var checklist = [
    ["Participants", "count, recruitment route, and whether they are the people the system is for",
     studies.filter(function (p) { return p.reports_nothing_beyond_n === "yes"; }).length +
     " of " + studies.length + " application studies report nothing beyond a count"],
    ["Presentation medium", "headset, desktop, web or pre-rendered video",
     noMediumCount() + " papers with human evidence never say"],
    ["Display hardware and frame rate", "headset model, GPU, measured frame rate, splat count",
     noHardware + " of " + app.length + " application papers name no hardware at all"],
    ["Viewpoint freedom", "could participants leave the capture path, or were views fixed?",
     studies.filter(function (p) { return !p.mobility; }).length + " of " + studies.length + " leave it unstated"],
    ["Design and comparison", "conditions, what the baseline was, order control",
     studies.filter(function (p) { return p.compared_different_representation !== "yes"; }).length +
     " of " + studies.length + " never compare against a different representation"],
    ["Statistical treatment", "the test, the effect size, the dispersion",
     studies.filter(function (p) { return !p.tested; }).length + " of " + studies.length +
     " report no inferential test"],
    ["Study limitations", "of the study, not only of the method",
     noLimit + " of " + T.technical + " technical papers acknowledge none for their own study"]
  ];

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">For practitioners</div>' +
    '<h1 class="title sub">Building something for humans with Gaussian splats</h1>' +
    '<p class="lede">Everything below is drawn from what ' + T.included + ' papers actually did, ' +
    'including what they conceded did not work. It is a shortcut through decisions the corpus has ' +
    'already made expensively: whether to use 3DGS at all, what to capture, what to put under the ' +
    'user&rsquo;s hand, and what to report so the result counts as evidence.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +

  '<section class="block">' +
    '<div class="kicker">Step 1</div>' +
    '<h2 class="head">Decide whether the representation fits the task</h2>' +
    '<p class="caption">The corpus converges on three reasons to adopt 3DGS: photorealism in the ' +
    'service of presence, real-time rendering, and cheap consumer-grade capture. It concedes ' +
    'losses on a different set of axes. The wins and the losses are not on the same axes, so this ' +
    'is a genuine trade, not a maturity gap that time closes. Every line below is an outcome an ' +
    'author states, and links to the paper that reported it.</p>' +
    outcomesPanel() +
  "</section>" +

  '<section class="block">' +
    '<div class="kicker">Step 2</div>' +
    '<h2 class="head">Budget for capture, because it decides what users will see</h2>' +
    '<p class="prose" style="font-size:15.5px">' + selfCapture + " of " + app.length +
    ' application papers capture at least some of their own data, and the corpus proves on itself ' +
    'that the capture route changes the measured experience. A construction study tested four ' +
    'routes and found circling the space best, another found photographs beat video frames because ' +
    'motion blur limits feature matching, and one team had to replace badly reconstructed water and ' +
    'sky with game-engine assets before presence rose significantly.</p>' +
    '<p class="prose" style="font-size:15.5px;margin-top:14px">Only ' + captureTask +
    ' papers treat capture as a user task in its own right. If your users will capture, you are in ' +
    'nearly open territory, and those few papers already measure workload during guided capture, ' +
    'the physical demand of walking a room while scanning it, and where retries concentrate ' +
    'across workflow stages.</p>' +
    '<p class="pullquote">Report capture device, image count, coverage protocol, reconstruction ' +
    'tool and training configuration. Only about a third of application papers state an input ' +
    'image count, at a median of 250 images, and no convention sits behind the figures.</p>' +
  "</section>" +

  '<section class="block">' +
    '<div class="kicker">Step 3</div>' +
    '<h2 class="head">Pick the proxy geometry your interaction needs</h2>' +
    '<p class="caption">This is the most directly reusable thing in the corpus. Gaussian ' +
    'primitives carry no surface, so most techniques that let a person touch, cut, deform or ' +
    'simulate the content build an auxiliary geometric layer for the purpose, and the layer is ' +
    'chosen by the <em>act</em>, not by the scene. Find your act in the first column, read what ' +
    'it will cost you in the second, and open the prior art in the third.</p>' +
    '<div class="tablewrap"><table class="data"><thead><tr>' +
      '<th style="width:22%">If the act is&hellip;</th>' +
      '<th style="width:34%">&hellip;you will need</th>' +
      '<th style="width:44%">What each prior system used</th>' +
      "</tr></thead><tbody>" + proxyAdvice() + "</tbody></table></div>" +
    '<p class="pullquote">Two consequences worth designing around. The proxy&rsquo;s resolution, ' +
    'latency and mismatch with the visible surface are real interaction variables that no paper in ' +
    'the corpus measures, so you will be inventing that evaluation. And if your act is ' +
    '<b>navigation</b>, there is no prior art in the included corpus: no included paper contributes ' +
    'a locomotion technique for splat scenes.</p>' +
  "</section>" +

  '<section class="block">' +
    '<div class="kicker">Step 4</div>' +
    '<h2 class="head">Choose your tooling with the delivery target in mind</h2>' +
    '<p class="caption">' + headset + " of " + app.length + ' systems are headset-first, and ' +
    'hardware repeatedly turns out to be a silent independent variable: a fire-drill trainer run ' +
    'on two headsets scored higher on every indicator on the newer one, the same scenes ran at ' +
    '50 to 80 fps in a laptop browser and 25 to 45 on a standalone headset, and in two studies ' +
    'the conditions carrying the Gaussian environment ran at roughly half the frame rate of what ' +
    'they were compared against.</p>' +
    '<div class="chips" style="margin-bottom:8px">' +
      '<button class="chip" data-open="platform|VR HMD">' +
        app.filter(function (p) { return p.platform === "VR HMD"; }).length + " target a VR headset</button>" +
      '<button class="chip" data-open="platform|web browser">' +
        app.filter(function (p) { return p.platform === "web browser"; }).length + " ship in the browser</button>" +
      '<button class="chip" data-open="platform|not specified">' +
        app.filter(function (p) { return p.platform === "not specified"; }).length + " never say</button>" +
    "</div>" +
    '<div class="pair" style="margin-top:34px">' +
      "<div>" +
        sectionHead(figNo("Reconstruction and training"), "What teams used to make the splat",
          "Click a tool to open the papers that name it.") +
        toolBars(DATA.tools.training, "training") +
      "</div>" +
      "<div>" +
        sectionHead(figNo("Delivery and rendering"), "What they used to show it",
          "Click a tool to open the papers that name it.") +
        toolBars(DATA.tools.rendering, "rendering") +
      "</div>" +
    "</div>" +
  "</section>" +

  '<section class="block">' +
    '<div class="kicker">Step 5</div>' +
    '<h2 class="head">Evaluate it so the result counts as evidence</h2>' +
    '<p class="caption">Only ' + validated + " of the " + studies.length + ' application studies ' +
    'use a validated instrument, and usability scores cluster so tightly in the excellent band ' +
    'that first-contact novelty and genuine usability are hard to tell apart. Reach for an ' +
    'existing instrument before writing your own Likert battery, and treat a single-session ' +
    'usability score as a weak claim.</p>' +
    '<h2 class="head small">' + tblNo("A reporting floor") + "</h2>" +
    '<p class="caption">Seven lines that cost a paragraph and make your study poolable with ' +
    'anyone else&rsquo;s. The right column is how often the corpus currently omits it.</p>' +
    '<div class="tablewrap"><table class="data" style="min-width:640px"><tbody>' +
      checklist.map(function (r) {
        return "<tr><td style='width:24%'><b style='color:var(--ink)'>" + esc(r[0]) + "</b></td>" +
          "<td style='width:44%'>" + esc(r[1]) + "</td>" +
          "<td style='width:32%;color:var(--ink-muted)'>" + esc(r[2]) + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
  "</section>" +

  '<section class="block">' +
    '<div class="kicker">Step 6</div>' +
    '<h2 class="head">Copy someone who already did it well</h2>' +
    '<p class="caption">' + exemplars.length + " " + plural(exemplars.length, "paper") +
    " in the corpus " + (exemplars.length === 1 ? "combines" : "combine") + " an in-headset study, " +
    "a comparison against a genuinely different representation, and an inferential test. They are " +
    "the shortest path to a defensible study design in this area.</p>" +
    '<div class="plist">' + exemplars.map(paperRow).join("") + "</div>" +
    '<p class="pullquote">A second track worth imitating sits in the technical stratum: papers ' +
    'applying broadcast-grade subjective protocols with vision screening and proper outlier ' +
    'handling. Filter the corpus by rating protocol to find them.</p>' +
  "</section>";
}

/* -------------------------------------------------------------- explorer -- */

/* Facets are grouped the way the pages are: what the paper is, where it is used
   (RQ1), how it is built (RQ2), and how it was evaluated (RQ3). */
var FACET_GROUPS = [
  ["What the paper is", [
    ["stratum", "Stratum"],
    ["category", "Contribution type"],
    ["cluster", "Functional cluster"],
    ["year", "Year"],
    ["venue_format", "Publication form"]
  ]],
  ["Where it is used  ·  RQ1", [
    ["domain", "Application domain"],
    ["platform", "Target medium"],
    ["modality", "Primary input"],
    ["social", "Social configuration"],
    ["maturity", "Deployment maturity"]
  ]],
  ["How it is built  ·  RQ2", [
    ["gs_type", "Representation type"],
    ["gs_role", "Role of Gaussian Splatting"],
    ["dataset", "Dataset provenance"],
    ["authoring_locus", "Authoring locus"]
  ]],
  ["How it was evaluated  ·  RQ3", [
    ["study_platform", "Study medium"],
    ["expert_sample", "Who was recruited"],
    ["mobility", "Viewpoint freedom"],
    ["protocol", "Rating protocol"]
  ]]
];
var FACETS = [];
FACET_GROUPS.forEach(function (g) {
  g[1].forEach(function (f) { FACETS.push(f); });
});
var FLAGS = [
  ["human_evidence", "true", "Has its own human evidence"],
  ["has_gs_study", "yes", "Application study of Gaussian content"],
  ["in_headset", "true", "Evaluated in a headset"],
  ["tested", "true", "Statistically tested"],
  ["compared_different_representation", "yes", "Compared against a different representation"],
  ["validated_instrument", "true", "Used a validated instrument"],
  ["short_form", "true", "Short-form publication"]
];

function viewCorpus() {
  var rows = selected();

  var facetIndex = 0;
  function renderFacet(pair) {
    var field = pair[0], name = pair[1];
    var i = facetIndex++;
    var pool = selected(field);
    var counts = countBy(pool, field);
    var chosen = state.filters[field] || [];
    var known = (DATA.facets[field] || []).map(function (d) { return d.value; });
    chosen.forEach(function (v) { if (known.indexOf(v) === -1) known.push(v); });
    var list = known.map(function (v) { return { v: v, n: counts[v] || 0 }; })
      .sort(function (a, b) { return b.n - a.n || a.v.localeCompare(b.v); });
    var opts = list.map(function (o) {
      return '<button class="fopt' + (o.n ? "" : " zero") + '" aria-pressed="' +
        (chosen.indexOf(o.v) !== -1) + '" data-facet="' + esc(field) + '" data-value="' + esc(o.v) + '">' +
        '<span class="fopt-label">' + (chosen.indexOf(o.v) !== -1 ? "✓ " : "") +
        esc(label(o.v)) + "</span>" +
        '<span class="n">' + o.n + "</span></button>";
    }).join("");
    var allOn = chosen.length === list.length && list.length > 0;
    var bulk = '<div style="display:flex;gap:12px;padding:2px 0 8px">' +
      '<button class="linkish" style="font-size:12.5px" data-bulk="all|' + esc(field) + '">' +
      (allOn ? "clear all" : "select all") + "</button>" +
      (chosen.length ? '<button class="linkish" style="font-size:12.5px" data-bulk="none|' +
        esc(field) + '">deselect ' + chosen.length + "</button>" : "") + "</div>";
    return "<details class='facet'" + (i < 3 || chosen.length ? " open" : "") + ">" +
      "<summary>" + esc(name) + (chosen.length ? " (" + chosen.length + ")" : "") + "</summary>" +
      '<div class="facet-body">' + bulk + opts + "</div></details>";
  }
  var facetHtml = FACET_GROUPS.map(function (g) {
    return '<div class="facet-group">' + esc(g[0]) + "</div>" +
      g[1].map(renderFacet).join("");
  }).join("");

  var flagChosen = 0;
  var flagHtml = FLAGS.map(function (f) {
    var on = isOn(f[0], f[1]);
    if (on) flagChosen += 1;
    var n = selected(f[0]).filter(function (p) { return String(p[f[0]]) === f[1]; }).length;
    return '<button class="fopt" aria-pressed="' + on + '" data-facet="' + esc(f[0]) +
      '" data-value="' + esc(f[1]) + '"><span class="fopt-label">' + (on ? "✓ " : "") +
      esc(f[2]) + '</span><span class="n">' + n + "</span></button>";
  }).join("");
  var flagBulk = flagChosen ? '<div style="display:flex;gap:12px;padding:2px 0 8px">' +
    '<button class="linkish" style="font-size:12.5px" data-bulk="flags|">deselect ' +
    flagChosen + "</button></div>" : "";

  var active = [];
  Object.keys(state.filters).forEach(function (f) {
    var meta = FACETS.filter(function (x) { return x[0] === f; })[0];
    var virt = VIRTUAL[f];
    state.filters[f].forEach(function (v) {
      var flag = FLAGS.filter(function (x) { return x[0] === f && x[1] === v; })[0];
      var text = virt ? virt.group + ": " + virt.name(v)
        : flag ? flag[2] : (meta ? meta[1] + ": " : "") + label(v);
      active.push('<button class="chip" data-remove="' + esc(f) + "|" + esc(v) + '">' +
        esc(text) + " &times;</button>");
    });
  });
  if (state.query) {
    active.push('<button class="chip" data-remove="__q|">&ldquo;' + esc(state.query) + "&rdquo; &times;</button>");
  }

  var sorted = rows.slice().sort(function (a, b) {
    if (state.sort === "title") return a.title.localeCompare(b.title);
    if (state.sort === "venue") return (a.venue_short || "").localeCompare(b.venue_short || "");
    return b.year - a.year || a.title.localeCompare(b.title);
  });

  var nActive = 0;
  Object.keys(state.filters).forEach(function (f) { nActive += state.filters[f].length; });

  return '<div class="explorer">' +
    '<details class="facets" id="facet-shell">' +
      '<summary class="facets-toggle">Filters' +
      (nActive ? " (" + nActive + " active)" : "") + "</summary>" +
      '<input class="search" id="q" type="search" placeholder="Search title, author, abstract&hellip;" value="' +
      esc(state.query) + '">' +
      '<div class="facet-group">Strength of evidence</div>' +
      "<details class='facet' open><summary>Evidence filters</summary>" +
      '<div class="facet-body">' + flagBulk + flagHtml + "</div></details>" +
      facetHtml +
    "</details>" +
    "<div>" +
      '<div class="result-head">' +
        '<span class="count">' + sorted.length + '</span><span class="of">of ' + T.included + " papers</span>" +
        (filtersActive() || state.query ? '<button class="linkish" id="reset">clear all filters</button>' : "") +
        '<span class="result-tools">' +
          '<select id="sort" class="ctrl">' +
          '<option value="year"' + (state.sort === "year" ? " selected" : "") + ">newest first</option>" +
          '<option value="title"' + (state.sort === "title" ? " selected" : "") + ">by title</option>" +
          '<option value="venue"' + (state.sort === "venue" ? " selected" : "") + ">by venue</option>" +
          "</select>" +
          '<button class="btn" id="dl">Download .bib</button>' +
        "</span>" +
      "</div>" +
      (active.length ? '<div class="active-filters">' + active.join("") + "</div>" : "") +
      (sorted.length
        ? '<div class="plist">' + sorted.map(paperRow).join("") + "</div>"
        : '<p class="pullquote" style="margin-top:24px">No paper matches this combination. That ' +
          "is itself a finding. Try removing one filter.</p>") +
    "</div></div>";
}

/* ---------------------------------------------------------------- matrix -- */

function viewMatrix() {
  var rowField = window.__mRow || "cluster";
  var colField = window.__mCol || "platform";
  var scope = window.__mScope || "all";
  var pool = scope === "all" ? PAPERS : PAPERS.filter(function (p) { return p.stratum === scope; });

  function sel(id, current) {
    return '<select id="' + id + '" class="ctrl">' + FACETS.map(function (f) {
      return '<option value="' + f[0] + '"' + (f[0] === current ? " selected" : "") + ">" + esc(f[1]) + "</option>";
    }).join("") + "</select>";
  }
  var colName = (FACETS.filter(function (f) { return f[0] === colField; })[0] || [])[1];

  return '' +
  '<div class="hero solo">' +
    '<div class="kicker">Cross-tab</div>' +
    '<h1 class="title sub">Ask your own question of the corpus</h1>' +
    '<p class="lede">Cross any two coded dimensions. Darker means more papers, and a ringed cell ' +
    'is a combination no included paper reports. Click any cell that holds papers to read them.</p>' +
    '<div class="rule-under"></div>' +
  "</div>" +
  '<section class="block">' +
    '<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:26px">' +
      '<span style="font-size:14px;color:var(--ink-muted)">rows</span>' + sel("m-row", rowField) +
      '<span style="font-size:14px;color:var(--ink-muted)">columns</span>' + sel("m-col", colField) +
      '<span style="font-size:14px;color:var(--ink-muted)">papers</span>' +
      '<select id="m-scope" class="ctrl">' +
      '<option value="all"' + (scope === "all" ? " selected" : "") + ">all " + T.included + "</option>" +
      '<option value="application"' + (scope === APP ? " selected" : "") + ">application only (" + T.application + ")</option>" +
      '<option value="technical"' + (scope === TECH ? " selected" : "") + ">technical only (" + T.technical + ")</option>" +
      "</select>" +
    "</div>" +
    heatmap(pool, rowField, colField, colName) +
    '<p class="pullquote">Empty cells are the point of this view. The paper&rsquo;s central RQ2 ' +
    'finding, that no included paper contributes a locomotion technique, is an empty region of exactly ' +
    'this kind.</p>' +
  "</section>";
}


/* ================================================================ ROUTER == */

var ROUTES = {
  "": viewOverview, "/": viewOverview,
  "/rq1": viewRQ1, "/rq2": viewRQ2, "/rq3": viewRQ3, "/rq4": viewRQ4,
  "/build": viewBuild, "/corpus": viewCorpus, "/matrix": viewMatrix
};

var lastHash = null;

function render() {
  var hash = location.hash.replace(/^#/, "") || "/";
  var sameRoute = hash === lastHash;
  var keepY = sameRoute ? window.pageYOffset : 0;
  if (hash.indexOf("/paper/") === 0) {
    if (!$("#app").firstChild) {
      figN = tblN = 0;
      $("#app").innerHTML = viewCorpus();
      wire();
    }
    if (!$(".drawer")) openPaper(hash.slice(7));
    return;
  }
  hideTip();
  figN = 0; tblN = 0;
  var view = ROUTES[hash] || viewOverview;
  var app = $("#app");
  app.className = "wrap" + (hash === "/corpus" ? " wide" : "");
  app.innerHTML = view();
  var current = "Overview";
  all("#nav a").forEach(function (a) {
    if (a.getAttribute("href") === "#" + hash) {
      a.setAttribute("aria-current", "page");
      current = a.textContent.trim();
    } else {
      a.removeAttribute("aria-current");
    }
  });
  var currentLabel = $("#nav-current");
  if (currentLabel) currentLabel.textContent = current;
  closeNav();
  lastHash = hash;
  wire();
  /* a filter or a funnel row re-renders the page it is on: stay where the
     reader was. Any change of page starts at the top, including the paper list,
     which is usually reached by clicking a chart far down a long page. */
  if (sameRoute) window.scrollTo(0, keepY);
  else window.scrollTo(0, 0);
}

/* The cross-tab can reach 25 rows by 25 columns, so the table is laid out
   fluidly and never scrolls. Below about 18px a cell cannot hold its number,
   so the digits are dropped and the colour carries the magnitude; the count is
   still on hover and on click. */
function fitHeatmaps() {
  all("table.heat").forEach(function (t) {
    var base = t.className.replace(/\s*compact/g, "");
    var cell = t.querySelector(".cell");
    /* measure against the uncompacted layout, then write only on a real change */
    if (t.className !== base) t.className = base;
    var want = cell && cell.getBoundingClientRect().width < 18 ? base + " compact" : base;
    if (t.className !== want) t.className = want;
  });
}

function wire() {
  all("[data-field]").forEach(function (el) {
    el.onclick = function () {
      openScoped(el, el.getAttribute("data-field"), el.getAttribute("data-value"));
    };
  });
  all("[data-strip]").forEach(function (el) {
    el.onclick = function () {
      var parts = el.getAttribute("data-strip").split("|");
      if (parts[0] === "__headset_tech") {
        clearFilters(); setFilter("stratum", TECH); setFilter("in_headset", "true"); go("#/corpus");
      } else if (parts[0]) {
        openCorpus(parts[0], parts[1]);
      } else {
        openCorpus(null, null);
      }
    };
  });
  all("[data-heat]").forEach(function (el) {
    el.onclick = function () {
      var p = el.getAttribute("data-heat").split("|");
      clearFilters(); setFilter(p[0], p[1]); setFilter(p[2], p[3]);
      applyScope(el);
      go("#/corpus");
    };
  });
  all("[data-paper]").forEach(function (el) {
    el.onclick = function () { openPaper(el.getAttribute("data-paper")); };
  });
  all("[data-open]").forEach(function (el) {
    el.onclick = function () {
      var p = el.getAttribute("data-open").split("|");
      openScoped(el, p[0], p[1]);
    };
  });
  all("[data-facet]").forEach(function (el) {
    el.onclick = function () {
      toggleFilter(el.getAttribute("data-facet"), el.getAttribute("data-value"));
      render();
    };
  });
  all("[data-bulk]").forEach(function (el) {
    el.onclick = function (e) {
      e.preventDefault();
      var p = el.getAttribute("data-bulk").split("|");
      if (p[0] === "flags") {
        FLAGS.forEach(function (f) { delete state.filters[f[0]]; });
      } else if (p[0] === "none") {
        delete state.filters[p[1]];
      } else {
        var field = p[1];
        var known = (DATA.facets[field] || []).map(function (d) { return d.value; });
        state.filters[field] = (state.filters[field] || []).length === known.length ? [] : known.slice();
        if (!state.filters[field].length) delete state.filters[field];
      }
      render();
    };
  });
  all("[data-remove]").forEach(function (el) {
    el.onclick = function () {
      var p = el.getAttribute("data-remove").split("|");
      if (p[0] === "__q") state.query = ""; else toggleFilter(p[0], p[1]);
      render();
    };
  });

  var q = $("#q");
  if (q) {
    var timer;
    q.oninput = function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var pos = q.selectionStart;
        state.query = q.value.trim();
        render();
        var nq = $("#q");
        if (nq) { nq.focus(); try { nq.setSelectionRange(pos, pos); } catch (e) {} }
      }, 220);
    };
  }
  var reset = $("#reset");
  if (reset) reset.onclick = function () { clearFilters(); render(); };
  var sort = $("#sort");
  if (sort) sort.onchange = function () { state.sort = sort.value; render(); };
  var dl = $("#dl");
  if (dl) dl.onclick = function () { downloadBibSet(selected(), "3dgs-hci-selection"); };

  all("[data-funnel]").forEach(function (el) {
    el.onclick = function () { window.__funnelDepth = +el.getAttribute("data-funnel"); render(); };
  });
  var fShow = $("#funnel-show");
  if (fShow) fShow.onclick = function () {
    var depth = window.__funnelDepth == null ? FUNNEL.length - 1 : window.__funnelDepth;
    clearFilters();
    FUNNEL.slice(1, depth + 1).forEach(function (s) { if (s.field) setFilter(s.field, s.value); });
    go("#/corpus");
  };
  var fBib = $("#funnel-bib");
  if (fBib) fBib.onclick = function () {
    var depth = window.__funnelDepth == null ? FUNNEL.length - 1 : window.__funnelDepth;
    downloadBibSet(PAPERS.filter(function (p) {
      return FUNNEL.slice(0, depth + 1).every(function (s) { return s.test(p); });
    }), "3dgs-hci-evidence");
  };

  var mr = $("#m-row"), mc = $("#m-col"), ms = $("#m-scope");
  if (mr) mr.onchange = function () { window.__mRow = mr.value; render(); };
  if (mc) mc.onchange = function () { window.__mCol = mc.value; render(); };
  if (ms) ms.onchange = function () { window.__mScope = ms.value; render(); };

  fitHeatmaps();

  var shell = $("#facet-shell");
  if (shell) {
    if (window.innerWidth > 1000) shell.open = true;
    else if (window.__facetsOpen) shell.open = true;
    shell.addEventListener("toggle", function () {
      if (window.innerWidth <= 1000) window.__facetsOpen = shell.open;
    });
  }

  var aq = $("#audit-q");
  if (aq) aq.oninput = function () {
    var term = aq.value.toLowerCase();
    all("table.data tbody tr").forEach(function (tr) {
      var key = tr.getAttribute("data-audit");
      if (key != null) tr.style.display = !term || key.indexOf(term) !== -1 ? "" : "none";
    });
  };
}

/* Narrow-screen navigation. The eight tabs do not fit below about 1160px, so
   the row collapses into a disclosure whose label is the current section. */

function navIsOpen() {
  var header = $("header.top");
  return !!header && header.className.indexOf("nav-open") !== -1;
}

/* Must be a no-op when the menu is already closed. It runs on every click in
   the document, and writing to the sticky header forces a style and layout
   update, which Chrome takes as a cue to dismiss an open <select> popup: the
   dropdown would open on mousedown and vanish on the click that followed. */
function closeNav() {
  if (!navIsOpen()) return;
  var header = $("header.top");
  var btn = $("#nav-toggle");
  header.className = header.className.replace(/\s*nav-open/g, "");
  if (btn) btn.setAttribute("aria-expanded", "false");
}
function toggleNav() {
  var header = $("header.top");
  var btn = $("#nav-toggle");
  if (!header) return;
  var open = header.className.indexOf("nav-open") === -1;
  header.className = open ? header.className + " nav-open"
                          : header.className.replace(/\s*nav-open/, "");
  if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
}

(function initNav() {
  var btn = $("#nav-toggle");
  if (btn) btn.onclick = function (e) { e.stopPropagation(); toggleNav(); };
  /* a tap anywhere else, or Escape, dismisses it; choosing a link is handled
     by render(), which closes the panel on every route change */
  document.addEventListener("click", function (e) {
    if (!navIsOpen()) return;
    var inHeader = e.target.closest ? e.target.closest("header.top") : null;
    if (!inHeader) closeNav();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeNav();
  });
  window.addEventListener("resize", closeNav);
  var fitTimer;
  window.addEventListener("resize", function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(fitHeatmaps, 120);
  });
})();

/* Theme. Light is the default and is what a first-time visitor sees; the
   choice is remembered per browser. The no-flash bootstrap in index.html has
   already applied any stored preference before this script runs. */
var THEME_KEY = "splatscope-theme";

function setTheme(mode) {
  var root = document.documentElement;
  var btn = $("#theme");
  if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  if (btn) {
    btn.textContent = mode === "dark" ? "Light" : "Dark";
    btn.setAttribute("aria-pressed", mode === "dark" ? "true" : "false");
    btn.title = mode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  }
  try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* private mode */ }
}

(function initTheme() {
  var stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* private mode */ }
  setTheme(stored === "dark" ? "dark" : "light");
  var btn = $("#theme");
  if (btn) btn.onclick = function () {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark"
      ? "light" : "dark");
  };
})();

window.addEventListener("hashchange", render);
render();

})();
