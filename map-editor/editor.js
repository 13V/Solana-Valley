/* ============================================================================
 * Sprout Valley — Map Editor
 * Plain ES, no modules, no libraries. Loaded via <script src="editor.js">.
 * Everything is wrapped in one IIFE that boots on DOMContentLoaded.
 * ==========================================================================*/
(function () {
  "use strict";

  /* Boot once the DOM exists (script is at end of <body>, but be safe). */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function boot() {
    /* ======================================================================
     * SHORTHANDS / DOM REFS
     * ====================================================================*/
    var $ = function (id) { return document.getElementById(id); };

    var TILE = 16; // source tile size in px (overridden by manifest if present)

    // Top bar
    var toolButtons = Array.prototype.slice.call(document.querySelectorAll(".tool[data-tool]"));
    var elUndo = $("undo"), elRedo = $("redo");
    var elZoomOut = $("zoomOut"), elZoomIn = $("zoomIn"), elZoomFit = $("zoomFit");
    var elZoomLabel = $("zoomLabel");
    var elToggleGrid = $("toggleGrid");
    var elNewMap = $("newMap"), elResizeMap = $("resizeMap");
    var elSaveProj = $("saveProj"), elLoadProj = $("loadProj"), elExportPng = $("exportPng");
    var elFileInput = $("fileInput");

    // Left rail
    var elAddLayer = $("addLayer"), elLayerList = $("layerList");
    var elBrushPreview = $("brushPreview"), elBrushName = $("brushName");
    var elBrushSize = $("brushSize"), elClearBrush = $("clearBrush");
    var elMapW = $("mapW"), elMapH = $("mapH"), elBgCheck = $("bgCheck");
    var elStatusLine = $("statusLine");

    // Center
    var elStage = $("stage"), elGrid = $("grid"), elLoader = $("loader"), elCoords = $("coords");

    // Right sidebar
    var elTileSearch = $("tileSearch"), elTileCount = $("tileCount");
    var elCollapseAll = $("collapseAll"), elTileList = $("tileList");

    // Sheet modal
    var elSheetModal = $("sheetModal"), elSheetTitle = $("sheetTitle"), elSheetClose = $("sheetClose");
    var elSheetCanvas = $("sheetCanvas"), elSheetOverlay = $("sheetOverlay");
    var elSheetSel = $("sheetSel"), elSheetUse = $("sheetUse");

    // Toast
    var elToast = $("toast");

    var gctx = elGrid ? elGrid.getContext("2d") : null;
    var bpctx = elBrushPreview ? elBrushPreview.getContext("2d") : null;

    /* ======================================================================
     * GLOBAL STATE
     * ====================================================================*/
    var manifest = null;            // raw manifest
    var sheets = [];                // manifest.sheets
    var sheetById = Object.create(null);
    var nonEmptyBySheet = Object.create(null); // sheetId -> Set(cellIndex)

    var imgCache = new Map();       // sheetId -> HTMLImageElement
    var imgLoaded = new Map();      // sheetId -> bool
    var dirty = true;               // re-render the map this frame?

    var ready = false;              // manifest loaded & UI built

    // Camera
    var zoom = 2;                   // screen px per source px
    var panX = 40, panY = 40;       // screen px of map origin (cell 0,0 top-left)

    // Map model
    var map = newMap(40, 30);

    // Brush: null | {kind:"tile",s,i} | {kind:"stamp",s,x,y,w,h}
    var brush = null;

    // Tool
    var tool = "paint";

    // Grid lines visible (matches #toggleGrid having is-on at start)
    var gridOn = elToggleGrid ? elToggleGrid.classList.contains("is-on") : true;

    // History
    var undoStack = [];
    var redoStack = [];

    // Hover / interaction
    var hoverCell = null;           // {x,y} or null
    var spaceHeld = false;
    var dragMode = null;            // "paint" | "erase" | "pan" | "rect" | null
    var rectStart = null;           // {x,y} cell where rect drag began
    var rectEnd = null;             // {x,y} current rect cell
    var activePointerId = null;
    var strokeChanges = null;       // accumulator during a paint/erase stroke
    var strokeTouched = null;       // Set of keys already recorded this stroke
    var lastPanScreen = null;       // {x,y} last pointer screen pos during pan

    // Lazy swatch rendering
    var swatchObserver = null;      // IntersectionObserver for .sheet
    var builtSheets = Object.create(null); // sheetId -> bool (swatches built)
    var swatchCanvases = Object.create(null); // sheetId -> [ {i, canvas} ]

    // Sheet modal selection state
    var modalSheet = null;          // sheet object currently open
    var modalScale = 1;
    var modalSel = null;            // {x,y,w,h} in cells, or null
    var modalDragStart = null;

    // Debounce timers
    var searchTimer = null;
    var autosaveTimer = null;

    var AUTOSAVE_KEY = "sproutMapAutosave";

    /* ======================================================================
     * MODEL HELPERS
     * ====================================================================*/
    function newMap(w, h) {
      return {
        w: w, h: h,
        layers: [ newLayer("Ground") ],
        active: 0,
        bg: elBgCheck ? !!elBgCheck.checked : true
      };
    }
    function newLayer(name) {
      return { name: name, visible: true, cells: new Map() };
    }
    function cellKey(x, y) { return x + "," + y; }
    function activeLayer() {
      if (!map.layers.length) return null;
      if (map.active < 0 || map.active >= map.layers.length) map.active = 0;
      return map.layers[map.active];
    }
    function inBounds(x, y) { return x >= 0 && y >= 0 && x < map.w && y < map.h; }

    /* ======================================================================
     * IMAGE LOADING (lazy, cached)
     * ====================================================================*/
    function getImg(sheet) {
      if (!sheet) return null;
      var id = sheet.id;
      var img = imgCache.get(id);
      if (img) return img;
      img = new Image();
      imgLoaded.set(id, false);
      img.addEventListener("load", function () {
        imgLoaded.set(id, true);
        dirty = true;                  // re-render map now that art exists
        redrawSheetSwatches(id);       // refresh any built swatches for this sheet
      });
      img.addEventListener("error", function () {
        // Mark as "resolved but failed" so we don't spin forever waiting on it.
        imgLoaded.set(id, false);
      });
      try { img.src = sheet.file; } catch (e) { /* ignore bad path */ }
      imgCache.set(id, img);
      return img;
    }
    function isImgReady(id) {
      var img = imgCache.get(id);
      return !!(img && img.complete && img.naturalWidth > 0);
    }

    /* ======================================================================
     * COORDINATE HELPERS
     * ====================================================================*/
    // Screen (client) coords -> cell coords (floored). May be out of bounds.
    function screenToCell(ev) {
      if (!elStage) return { x: 0, y: 0 };
      var r = elStage.getBoundingClientRect();
      var px = ev.clientX - r.left; // screen px within stage
      var py = ev.clientY - r.top;
      var cs = TILE * zoom;          // cell size on screen
      if (cs <= 0) return { x: 0, y: 0 };
      var cx = Math.floor((px - panX) / cs);
      var cy = Math.floor((py - panY) / cs);
      return { x: cx, y: cy };
    }
    // Cell coords -> top-left screen px within stage.
    function cellToScreen(cx, cy) {
      var cs = TILE * zoom;
      return { x: panX + cx * cs, y: panY + cy * cs };
    }

    /* ======================================================================
     * RENDERING — sized to #stage, DPR-aware, rAF loop, redraw only on dirty
     * ====================================================================*/
    function resizeCanvas() {
      if (!elGrid || !elStage) return;
      var dpr = window.devicePixelRatio || 1;
      var w = Math.max(1, Math.floor(elStage.clientWidth));
      var h = Math.max(1, Math.floor(elStage.clientHeight));
      elGrid.width = Math.floor(w * dpr);
      elGrid.height = Math.floor(h * dpr);
      // CSS size is 100% via stylesheet; nothing else to set here.
      dirty = true;
    }

    function render() {
      if (!gctx || !elGrid) return;
      var dpr = window.devicePixelRatio || 1;
      var cw = elGrid.width, ch = elGrid.height;

      gctx.setTransform(1, 0, 0, 1, 0, 0);
      gctx.clearRect(0, 0, cw, ch);
      gctx.scale(dpr, dpr);          // work in CSS pixels from here on
      gctx.imageSmoothingEnabled = false;

      var cssW = cw / dpr, cssH = ch / dpr;
      var cs = TILE * zoom;          // cell size on screen (CSS px)

      // Map rect in screen space.
      var mapLeft = panX, mapTop = panY;
      var mapRight = panX + map.w * cs, mapBottom = panY + map.h * cs;

      // Checkerboard ONLY over the map rectangle (two greys).
      if (map.bg) {
        drawCheckerboard(mapLeft, mapTop, cs);
      }

      // Visible cell range (cull).
      var minX = Math.max(0, Math.floor((0 - panX) / cs));
      var minY = Math.max(0, Math.floor((0 - panY) / cs));
      var maxX = Math.min(map.w - 1, Math.ceil((cssW - panX) / cs));
      var maxY = Math.min(map.h - 1, Math.ceil((cssH - panY) / cs));

      // Layers bottom -> top.
      if (minX <= maxX && minY <= maxY) {
        for (var li = 0; li < map.layers.length; li++) {
          var layer = map.layers[li];
          if (!layer.visible) continue;
          drawLayerRange(layer, minX, minY, maxX, maxY, cs);
        }
      }

      // Grid lines + map border.
      drawGridAndBorder(mapLeft, mapTop, mapRight, mapBottom, cs, minX, minY, maxX, maxY);

      // Hover ghost / rect preview.
      drawHoverGhost(cs);
    }

    function drawCheckerboard(left, top, cs) {
      var c1 = "#1e211b", c2 = "#23271f";
      for (var y = 0; y < map.h; y++) {
        for (var x = 0; x < map.w; x++) {
          gctx.fillStyle = ((x + y) & 1) ? c1 : c2;
          gctx.fillRect(left + x * cs, top + y * cs, cs, cs);
        }
      }
    }

    function drawLayerRange(layer, minX, minY, maxX, maxY, cs) {
      // Iterate the cells in the visible range. For dense maps the Map can be
      // larger than the viewport, so we scan the viewport rect (bounded) and
      // look each cell up — that keeps cost tied to what's on screen.
      for (var y = minY; y <= maxY; y++) {
        for (var x = minX; x <= maxX; x++) {
          var v = layer.cells.get(cellKey(x, y));
          if (!v) continue;
          var sheet = sheetById[v.s];
          if (!sheet) continue;
          if (!isImgReady(sheet.id)) { getImg(sheet); continue; } // request + skip
          var img = imgCache.get(sheet.id);
          var sx = (v.i % sheet.cols) * TILE;
          var sy = Math.floor(v.i / sheet.cols) * TILE;
          var sp = cellToScreen(x, y);
          try {
            gctx.drawImage(img, sx, sy, TILE, TILE, sp.x, sp.y, cs, cs);
          } catch (e) { /* image became invalid mid-draw; ignore */ }
        }
      }
    }

    function drawGridAndBorder(left, top, right, bottom, cs, minX, minY, maxX, maxY) {
      if (gridOn && minX <= maxX && minY <= maxY) {
        gctx.strokeStyle = "rgba(255,255,255,.06)";
        gctx.lineWidth = 1;
        gctx.beginPath();
        // Vertical lines.
        for (var x = minX; x <= maxX + 1; x++) {
          var sx = Math.round(left + x * cs) + 0.5;
          gctx.moveTo(sx, Math.max(top, 0));
          gctx.lineTo(sx, Math.min(bottom, bottom));
        }
        // Horizontal lines.
        for (var y = minY; y <= maxY + 1; y++) {
          var sy = Math.round(top + y * cs) + 0.5;
          gctx.moveTo(Math.max(left, 0), sy);
          gctx.lineTo(right, sy);
        }
        gctx.stroke();
      }
      // Brighter border around the whole map.
      gctx.strokeStyle = "rgba(165,214,106,.55)";
      gctx.lineWidth = 1;
      gctx.strokeRect(Math.round(left) + 0.5, Math.round(top) + 0.5,
        Math.round(right - left), Math.round(bottom - top));
    }

    function drawHoverGhost(cs) {
      // During a rect drag, show the rectangle outline + ghost fill.
      if (dragMode === "rect" && rectStart && rectEnd) {
        var rx0 = Math.min(rectStart.x, rectEnd.x);
        var ry0 = Math.min(rectStart.y, rectEnd.y);
        var rx1 = Math.max(rectStart.x, rectEnd.x);
        var ry1 = Math.max(rectStart.y, rectEnd.y);
        rx0 = Math.max(0, rx0); ry0 = Math.max(0, ry0);
        rx1 = Math.min(map.w - 1, rx1); ry1 = Math.min(map.h - 1, ry1);
        if (rx0 <= rx1 && ry0 <= ry1) {
          var sp = cellToScreen(rx0, ry0);
          var ww = (rx1 - rx0 + 1) * cs, hh = (ry1 - ry0 + 1) * cs;
          gctx.globalAlpha = 0.55;
          // Ghost preview of the brush tiled across the rect.
          drawBrushGhostBlock(rx0, ry0, rx1, ry1, cs);
          gctx.globalAlpha = 1;
          gctx.strokeStyle = "rgba(165,214,106,.9)";
          gctx.lineWidth = 2;
          gctx.strokeRect(sp.x + 1, sp.y + 1, ww - 2, hh - 2);
        }
        return;
      }

      // Plain hover ghost at the hovered cell.
      if (!hoverCell || !brush) return;
      if (!inBounds(hoverCell.x, hoverCell.y)) return;
      gctx.globalAlpha = 0.55;
      if (brush.kind === "tile") {
        drawTileGhost(brush.s, brush.i, hoverCell.x, hoverCell.y, cs);
      } else if (brush.kind === "stamp") {
        var sheet = sheetById[brush.s];
        if (sheet) {
          var ne = nonEmptyBySheet[brush.s];
          for (var dy = 0; dy < brush.h; dy++) {
            for (var dx = 0; dx < brush.w; dx++) {
              var srcIdx = (brush.y + dy) * sheet.cols + (brush.x + dx);
              if (ne && !ne.has(srcIdx)) continue; // skip empty source cells
              drawTileGhost(brush.s, srcIdx, hoverCell.x + dx, hoverCell.y + dy, cs);
            }
          }
        }
      }
      gctx.globalAlpha = 1;
      // Outline the hovered cell/block.
      var os = cellToScreen(hoverCell.x, hoverCell.y);
      var bw = (brush.kind === "stamp") ? brush.w : 1;
      var bh = (brush.kind === "stamp") ? brush.h : 1;
      gctx.strokeStyle = "rgba(255,255,255,.5)";
      gctx.lineWidth = 1;
      gctx.strokeRect(Math.round(os.x) + 0.5, Math.round(os.y) + 0.5, bw * cs - 1, bh * cs - 1);
    }

    function drawBrushGhostBlock(rx0, ry0, rx1, ry1, cs) {
      if (!brush) return;
      // For a rect fill, every cell is the brush's single tile (stamp -> top-left).
      var s, i;
      if (brush.kind === "tile") { s = brush.s; i = brush.i; }
      else { s = brush.s; var sheet0 = sheetById[brush.s]; if (!sheet0) return;
             i = brush.y * sheet0.cols + brush.x; }
      for (var y = ry0; y <= ry1; y++) {
        for (var x = rx0; x <= rx1; x++) {
          drawTileGhost(s, i, x, y, cs);
        }
      }
    }

    function drawTileGhost(sheetId, idx, cx, cy, cs) {
      if (!inBounds(cx, cy)) return;
      var sheet = sheetById[sheetId];
      if (!sheet) return;
      if (!isImgReady(sheet.id)) { getImg(sheet); return; }
      var img = imgCache.get(sheet.id);
      var sx = (idx % sheet.cols) * TILE;
      var sy = Math.floor(idx / sheet.cols) * TILE;
      var sp = cellToScreen(cx, cy);
      try { gctx.drawImage(img, sx, sy, TILE, TILE, sp.x, sp.y, cs, cs); }
      catch (e) { /* ignore */ }
    }

    // rAF loop — only repaint when something changed.
    function frame() {
      if (dirty) { dirty = false; render(); }
      window.requestAnimationFrame(frame);
    }

    /* ======================================================================
     * HISTORY
     * ====================================================================*/
    // An op: { layer:Int, changes:[ {key, before, after} ] }
    function pushHistory(layerIndex, changes) {
      if (!changes || !changes.length) return;
      undoStack.push({ layer: layerIndex, changes: changes });
      redoStack.length = 0;
      updateHistoryButtons();
      afterMutation();
    }

    function applyCellValue(layer, key, value) {
      if (value === undefined || value === null) layer.cells.delete(key);
      else layer.cells.set(key, { s: value.s, i: value.i });
    }

    function undo() {
      var op = undoStack.pop();
      if (!op) return;
      var layer = map.layers[op.layer];
      if (layer) {
        for (var i = op.changes.length - 1; i >= 0; i--) {
          applyCellValue(layer, op.changes[i].key, op.changes[i].before);
        }
      }
      redoStack.push(op);
      updateHistoryButtons();
      dirty = true;
      afterMutation();
    }
    function redo() {
      var op = redoStack.pop();
      if (!op) return;
      var layer = map.layers[op.layer];
      if (layer) {
        for (var i = 0; i < op.changes.length; i++) {
          applyCellValue(layer, op.changes[i].key, op.changes[i].after);
        }
      }
      undoStack.push(op);
      updateHistoryButtons();
      dirty = true;
      afterMutation();
    }
    function clearHistory() {
      undoStack.length = 0; redoStack.length = 0;
      updateHistoryButtons();
    }
    function updateHistoryButtons() {
      if (elUndo) elUndo.disabled = undoStack.length === 0;
      if (elRedo) elRedo.disabled = redoStack.length === 0;
    }

    /* ======================================================================
     * STROKE RECORDING (paint / erase drag)
     * ====================================================================*/
    function beginStroke() {
      strokeChanges = [];
      strokeTouched = new Set();
    }
    function recordChange(layer, key, value) {
      // Record at most one change per key per stroke (capture original 'before').
      if (strokeTouched.has(key)) {
        // Still apply the value, but only update 'after' on the existing entry.
        var existing = null;
        for (var k = strokeChanges.length - 1; k >= 0; k--) {
          if (strokeChanges[k].key === key) { existing = strokeChanges[k]; break; }
        }
        var before2 = layer.cells.get(key);
        var changed2 = applyIfDifferent(layer, key, value, before2);
        if (changed2 && existing) {
          existing.after = (value === undefined || value === null)
            ? undefined : { s: value.s, i: value.i };
        }
        return changed2;
      }
      var before = layer.cells.get(key);
      var changed = applyIfDifferent(layer, key, value, before);
      if (changed) {
        strokeTouched.add(key);
        strokeChanges.push({
          key: key,
          before: before ? { s: before.s, i: before.i } : undefined,
          after: (value === undefined || value === null) ? undefined : { s: value.s, i: value.i }
        });
      }
      return changed;
    }
    function applyIfDifferent(layer, key, value, before) {
      if (value === undefined || value === null) {
        if (before === undefined) return false;
        layer.cells.delete(key);
        return true;
      }
      if (before && before.s === value.s && before.i === value.i) return false;
      layer.cells.set(key, { s: value.s, i: value.i });
      return true;
    }
    function endStroke() {
      if (strokeChanges && strokeChanges.length) {
        undoStack.push({ layer: map.active, changes: strokeChanges });
        redoStack.length = 0;
        updateHistoryButtons();
        afterMutation();
      }
      strokeChanges = null;
      strokeTouched = null;
    }

    /* ======================================================================
     * TOOL OPERATIONS
     * ====================================================================*/
    function requireBrush() {
      if (!brush) { toast("Pick a tile first"); return false; }
      return true;
    }

    // Paint one cell or stamp block at target (cx,cy) on active layer.
    function paintAt(cx, cy) {
      var layer = activeLayer();
      if (!layer || !brush) return;
      if (brush.kind === "tile") {
        if (!inBounds(cx, cy)) return;
        recordChange(layer, cellKey(cx, cy), { s: brush.s, i: brush.i });
        dirty = true;
      } else if (brush.kind === "stamp") {
        var sheet = sheetById[brush.s];
        if (!sheet) return;
        var ne = nonEmptyBySheet[brush.s];
        for (var dy = 0; dy < brush.h; dy++) {
          for (var dx = 0; dx < brush.w; dx++) {
            var tx = cx + dx, ty = cy + dy;
            if (!inBounds(tx, ty)) continue;
            var srcIdx = (brush.y + dy) * sheet.cols + (brush.x + dx);
            if (ne && !ne.has(srcIdx)) continue; // skip empty source cells
            recordChange(layer, cellKey(tx, ty), { s: brush.s, i: srcIdx });
          }
        }
        dirty = true;
      }
    }

    function eraseAt(cx, cy) {
      var layer = activeLayer();
      if (!layer) return;
      if (!inBounds(cx, cy)) return;
      recordChange(layer, cellKey(cx, cy), undefined);
      dirty = true;
    }

    // Single tile that a (possibly stamp) brush resolves to for rect/fill.
    function brushSingleTile() {
      if (!brush) return null;
      if (brush.kind === "tile") return { s: brush.s, i: brush.i };
      var sheet = sheetById[brush.s];
      if (!sheet) return null;
      return { s: brush.s, i: brush.y * sheet.cols + brush.x };
    }

    function rectFill(x0, y0, x1, y1) {
      var layer = activeLayer();
      if (!layer) return;
      var t = brushSingleTile();
      if (!t) return;
      var changes = [];
      for (var y = y0; y <= y1; y++) {
        for (var x = x0; x <= x1; x++) {
          if (!inBounds(x, y)) continue;
          var key = cellKey(x, y);
          var before = layer.cells.get(key);
          if (before && before.s === t.s && before.i === t.i) continue;
          layer.cells.set(key, { s: t.s, i: t.i });
          changes.push({
            key: key,
            before: before ? { s: before.s, i: before.i } : undefined,
            after: { s: t.s, i: t.i }
          });
        }
      }
      pushHistory(map.active, changes);
      dirty = true;
    }

    function floodFill(sx, sy) {
      var layer = activeLayer();
      if (!layer) return;
      if (!inBounds(sx, sy)) return;
      var t = brushSingleTile();
      if (!t) return;
      var target = layer.cells.get(cellKey(sx, sy)) || null; // null === empty
      // No-op if target already equals fill tile.
      if (target && target.s === t.s && target.i === t.i) return;
      if (!target && false) return; // (empty target is fine; fall through)

      function matches(v) {
        if (!target) return !v;                  // both empty
        if (!v) return false;
        return v.s === target.s && v.i === target.i;
      }

      var changes = [];
      var visited = new Set();
      var stack = [[sx, sy]];
      var guard = 0;
      var maxIter = (map.w * map.h) + 16;        // generous cap
      while (stack.length) {
        if (++guard > maxIter * 4) break;        // hard safety against runaway
        var node = stack.pop();
        var x = node[0], y = node[1];
        if (!inBounds(x, y)) continue;
        var key = cellKey(x, y);
        if (visited.has(key)) continue;
        visited.add(key);
        var cur = layer.cells.get(key) || null;
        if (!matches(cur)) continue;
        // Replace with fill tile.
        var before = cur;
        if (!(before && before.s === t.s && before.i === t.i)) {
          layer.cells.set(key, { s: t.s, i: t.i });
          changes.push({
            key: key,
            before: before ? { s: before.s, i: before.i } : undefined,
            after: { s: t.s, i: t.i }
          });
        }
        stack.push([x + 1, y]); stack.push([x - 1, y]);
        stack.push([x, y + 1]); stack.push([x, y - 1]);
      }
      pushHistory(map.active, changes);
      dirty = true;
    }

    function eyedropAt(cx, cy) {
      if (!inBounds(cx, cy)) return;
      // Active layer first, then search downward through lower visible layers.
      var found = null;
      var aIdx = map.active;
      var al = map.layers[aIdx];
      if (al) {
        var v = al.cells.get(cellKey(cx, cy));
        if (v) found = v;
      }
      if (!found) {
        for (var li = aIdx - 1; li >= 0; li--) {
          var layer = map.layers[li];
          if (!layer.visible) continue;
          var vv = layer.cells.get(cellKey(cx, cy));
          if (vv) { found = vv; break; }
        }
      }
      if (!found) return; // no-op
      setBrushTile(found.s, found.i);
      highlightSwatch(found.s, found.i);
    }

    /* ======================================================================
     * BRUSH MANAGEMENT
     * ====================================================================*/
    function setBrushTile(s, i) {
      brush = { kind: "tile", s: s, i: i };
      updateBrushPreview();
    }
    function setBrushStamp(s, x, y, w, h) {
      brush = { kind: "stamp", s: s, x: x, y: y, w: w, h: h };
      updateBrushPreview();
    }
    function clearBrush() {
      brush = null;
      if (elClearBrush) elClearBrush.hidden = true;
      if (elBrushName) elBrushName.textContent = "No tile selected";
      if (elBrushSize) elBrushSize.textContent = "Pick a tile from the right →";
      if (bpctx) bpctx.clearRect(0, 0, elBrushPreview.width, elBrushPreview.height);
      deselectSwatch();
      dirty = true;
    }

    function updateBrushPreview() {
      if (!bpctx || !elBrushPreview || !brush) return;
      var W = elBrushPreview.width, H = elBrushPreview.height;
      bpctx.clearRect(0, 0, W, H);
      bpctx.imageSmoothingEnabled = false;
      var sheet = sheetById[brush.s];
      var name = sheet ? sheet.name : "Tile";
      if (brush.kind === "tile") {
        if (elBrushName) elBrushName.textContent = name;
        if (elBrushSize) elBrushSize.textContent = "1 tile";
        drawPreviewBlock(brush.s, brush.i % (sheet ? sheet.cols : 1),
          Math.floor(brush.i / (sheet ? sheet.cols : 1)), 1, 1);
      } else {
        if (elBrushName) elBrushName.textContent = name;
        if (elBrushSize) elBrushSize.textContent = brush.w + "×" + brush.h + " tiles";
        drawPreviewBlock(brush.s, brush.x, brush.y, brush.w, brush.h);
      }
      if (elClearBrush) elClearBrush.hidden = false;
      dirty = true;
    }

    // Draw a WxH cell block (cells over full sheet grid at colX,rowY) into the
    // 96x96 preview, centered, integer-scaled.
    function drawPreviewBlock(sheetId, colX, rowY, wCells, hCells) {
      var sheet = sheetById[sheetId];
      if (!sheet) return;
      var W = elBrushPreview.width, H = elBrushPreview.height;
      var srcW = wCells * TILE, srcH = hCells * TILE;
      var scale = Math.max(1, Math.floor(Math.min(W / srcW, H / srcH)));
      var dw = srcW * scale, dh = srcH * scale;
      var dx = Math.floor((W - dw) / 2), dy = Math.floor((H - dh) / 2);
      if (!isImgReady(sheet.id)) {
        getImg(sheet);
        // Redraw when it loads (handled globally via redrawSheetSwatches + dirty;
        // also schedule a one-shot preview refresh).
        scheduleBrushPreviewRefresh(sheet.id);
        return;
      }
      var img = imgCache.get(sheet.id);
      try {
        bpctx.drawImage(img, colX * TILE, rowY * TILE, srcW, srcH, dx, dy, dw, dh);
      } catch (e) { /* ignore */ }
    }

    function scheduleBrushPreviewRefresh(sheetId) {
      var img = imgCache.get(sheetId);
      if (!img) return;
      img.addEventListener("load", function once() {
        img.removeEventListener("load", once);
        if (brush && brush.s === sheetId) updateBrushPreview();
      });
    }

    /* ======================================================================
     * TOOLS UI (top bar)
     * ====================================================================*/
    function setTool(t) {
      tool = t;
      for (var i = 0; i < toolButtons.length; i++) {
        toolButtons[i].classList.toggle("is-active", toolButtons[i].getAttribute("data-tool") === t);
      }
    }
    toolButtons.forEach(function (b) {
      b.addEventListener("click", function () { setTool(b.getAttribute("data-tool")); });
    });

    /* ======================================================================
     * POINTER / DRAWING ON THE GRID
     * ====================================================================*/
    if (elGrid) {
      elGrid.addEventListener("pointerdown", onPointerDown);
      elGrid.addEventListener("pointermove", onPointerMove);
      elGrid.addEventListener("pointerup", onPointerUp);
      elGrid.addEventListener("pointercancel", onPointerUp);
      elGrid.addEventListener("pointerleave", function () {
        if (!dragMode) { hoverCell = null; updateCoords(); dirty = true; }
      });
      // Wheel zoom toward cursor.
      elGrid.addEventListener("wheel", onWheel, { passive: false });
      // Drag & drop from sidebar.
      elGrid.addEventListener("dragover", function (ev) { ev.preventDefault(); });
      elGrid.addEventListener("drop", onGridDrop);
    }

    function isPanInput(ev) {
      return spaceHeld || ev.button === 1 || tool === "pan";
    }

    function onPointerDown(ev) {
      if (!ready) return;
      // Only react to the primary/middle buttons for drawing/pan.
      if (ev.button !== 0 && ev.button !== 1) return;
      try { elGrid.setPointerCapture(ev.pointerId); } catch (e) {}
      activePointerId = ev.pointerId;
      var cell = screenToCell(ev);
      hoverCell = cell;

      if (isPanInput(ev)) {
        dragMode = "pan";
        lastPanScreen = { x: ev.clientX, y: ev.clientY };
        if (elStage) elStage.classList.add("panning");
        ev.preventDefault();
        return;
      }

      if (tool === "paint") {
        if (!requireBrush()) return;
        dragMode = "paint";
        beginStroke();
        paintAt(cell.x, cell.y);
      } else if (tool === "erase") {
        dragMode = "erase";
        beginStroke();
        eraseAt(cell.x, cell.y);
      } else if (tool === "rect") {
        if (!requireBrush()) return;
        dragMode = "rect";
        rectStart = { x: cell.x, y: cell.y };
        rectEnd = { x: cell.x, y: cell.y };
        dirty = true;
      } else if (tool === "fill") {
        if (!requireBrush()) return;
        floodFill(cell.x, cell.y);
      } else if (tool === "eyedropper") {
        eyedropAt(cell.x, cell.y);
      }
      updateCoords();
    }

    function onPointerMove(ev) {
      if (!ready) return;
      var cell = screenToCell(ev);
      var moved = !hoverCell || hoverCell.x !== cell.x || hoverCell.y !== cell.y;
      hoverCell = cell;

      if (dragMode === "pan") {
        if (lastPanScreen) {
          panX += (ev.clientX - lastPanScreen.x);
          panY += (ev.clientY - lastPanScreen.y);
          lastPanScreen = { x: ev.clientX, y: ev.clientY };
          dirty = true;
        }
        updateCoords();
        return;
      }
      if (dragMode === "paint") {
        if (moved || strokeChanges === null) paintAt(cell.x, cell.y);
      } else if (dragMode === "erase") {
        if (moved) eraseAt(cell.x, cell.y);
      } else if (dragMode === "rect") {
        rectEnd = { x: cell.x, y: cell.y };
        dirty = true;
      } else {
        // just hovering
        if (moved) dirty = true;
      }
      updateCoords();
    }

    function onPointerUp(ev) {
      if (activePointerId !== null) {
        try { elGrid.releasePointerCapture(activePointerId); } catch (e) {}
      }
      activePointerId = null;

      if (dragMode === "pan") {
        if (elStage) elStage.classList.remove("panning");
      } else if (dragMode === "paint" || dragMode === "erase") {
        endStroke();
      } else if (dragMode === "rect") {
        if (rectStart && rectEnd) {
          var x0 = Math.max(0, Math.min(rectStart.x, rectEnd.x));
          var y0 = Math.max(0, Math.min(rectStart.y, rectEnd.y));
          var x1 = Math.min(map.w - 1, Math.max(rectStart.x, rectEnd.x));
          var y1 = Math.min(map.h - 1, Math.max(rectStart.y, rectEnd.y));
          if (x0 <= x1 && y0 <= y1) rectFill(x0, y0, x1, y1);
        }
        rectStart = null; rectEnd = null;
      }
      dragMode = null;
      lastPanScreen = null;
      dirty = true;
    }

    function onWheel(ev) {
      if (!ready) return;
      ev.preventDefault();
      var r = elStage.getBoundingClientRect();
      var mx = ev.clientX - r.left;     // cursor in stage space
      var my = ev.clientY - r.top;
      var factor = ev.deltaY < 0 ? 1.1 : (1 / 1.1);
      var newZoom = clamp(zoom * factor, 0.25, 16);
      if (newZoom === zoom) return;
      // Keep the source point under the cursor fixed.
      // source coord under cursor: (m - pan) / (TILE*zoom) ... we keep screen-space
      // by adjusting pan so the same world point stays under cursor.
      var worldX = (mx - panX) / (TILE * zoom);
      var worldY = (my - panY) / (TILE * zoom);
      zoom = newZoom;
      panX = mx - worldX * TILE * zoom;
      panY = my - worldY * TILE * zoom;
      updateZoomLabel();
      dirty = true;
    }

    function onGridDrop(ev) {
      ev.preventDefault();
      var data = "";
      try { data = ev.dataTransfer.getData("text/tile"); } catch (e) {}
      if (!data) return;
      var sep = data.lastIndexOf(":");
      if (sep < 0) return;
      var sheetId = data.slice(0, sep);
      var idx = parseInt(data.slice(sep + 1), 10);
      if (!sheetById[sheetId] || isNaN(idx)) return;
      var cell = screenToCell(ev);
      // Set brush AND place the tile (undoable) on the active layer.
      setBrushTile(sheetId, idx);
      highlightSwatch(sheetId, idx);
      var layer = activeLayer();
      if (layer && inBounds(cell.x, cell.y)) {
        var key = cellKey(cell.x, cell.y);
        var before = layer.cells.get(key);
        if (!before || before.s !== sheetId || before.i !== idx) {
          layer.cells.set(key, { s: sheetId, i: idx });
          pushHistory(map.active, [{
            key: key,
            before: before ? { s: before.s, i: before.i } : undefined,
            after: { s: sheetId, i: idx }
          }]);
        }
      }
      dirty = true;
    }

    function updateCoords() {
      if (!elCoords) return;
      if (hoverCell && inBounds(hoverCell.x, hoverCell.y)) {
        elCoords.textContent = hoverCell.x + ", " + hoverCell.y;
      } else {
        elCoords.textContent = "";
      }
    }

    /* ======================================================================
     * LAYERS UI
     * ====================================================================*/
    function renderLayers() {
      if (!elLayerList) return;
      elLayerList.innerHTML = "";
      // TOP layer first in the list (reverse render order).
      for (var i = map.layers.length - 1; i >= 0; i--) {
        (function (idx) {
          var layer = map.layers[idx];
          var li = document.createElement("li");
          li.className = "layer" + (idx === map.active ? " is-active" : "");

          var vis = document.createElement("button");
          vis.className = "vis" + (layer.visible ? "" : " off");
          vis.textContent = layer.visible ? "👁" : "🚫";
          vis.title = "Toggle visibility";
          vis.addEventListener("click", function (e) {
            e.stopPropagation();
            layer.visible = !layer.visible;
            renderLayers(); dirty = true; afterMutation();
          });

          var name = document.createElement("span");
          name.className = "lname";
          name.textContent = layer.name;
          name.title = layer.name;
          name.addEventListener("dblclick", function (e) {
            e.stopPropagation();
            var nn = window.prompt("Rename layer", layer.name);
            if (nn !== null && nn.trim() !== "") {
              layer.name = nn.trim();
              renderLayers(); afterMutation();
            }
          });

          var up = document.createElement("button");
          up.className = "lbtn"; up.textContent = "▲"; up.title = "Move up";
          up.addEventListener("click", function (e) {
            e.stopPropagation(); moveLayer(idx, +1);
          });

          var down = document.createElement("button");
          down.className = "lbtn"; down.textContent = "▼"; down.title = "Move down";
          down.addEventListener("click", function (e) {
            e.stopPropagation(); moveLayer(idx, -1);
          });

          var del = document.createElement("button");
          del.className = "lbtn"; del.textContent = "✕"; del.title = "Delete layer";
          del.addEventListener("click", function (e) {
            e.stopPropagation(); deleteLayer(idx);
          });

          li.appendChild(vis);
          li.appendChild(name);
          li.appendChild(up);
          li.appendChild(down);
          li.appendChild(del);

          li.addEventListener("click", function () {
            map.active = idx; renderLayers(); dirty = true;
          });

          elLayerList.appendChild(li);
        })(i);
      }
    }

    function moveLayer(idx, dir) {
      // dir +1 = up (toward top, higher index), -1 = down.
      var ni = idx + dir;
      if (ni < 0 || ni >= map.layers.length) return;
      var tmp = map.layers[idx];
      map.layers[idx] = map.layers[ni];
      map.layers[ni] = tmp;
      if (map.active === idx) map.active = ni;
      else if (map.active === ni) map.active = idx;
      renderLayers(); dirty = true; clearHistory(); afterMutation();
    }

    function deleteLayer(idx) {
      if (map.layers.length <= 1) { toast("Can't delete the last layer"); return; }
      map.layers.splice(idx, 1);
      if (map.active >= map.layers.length) map.active = map.layers.length - 1;
      else if (map.active > idx) map.active--;
      renderLayers(); dirty = true; clearHistory(); afterMutation();
    }

    if (elAddLayer) {
      elAddLayer.addEventListener("click", function () {
        var n = map.layers.length + 1;
        map.layers.push(newLayer("Layer " + n));
        map.active = map.layers.length - 1;
        renderLayers(); dirty = true; afterMutation();
      });
    }

    /* ======================================================================
     * SIDEBAR / TILE LIST
     * ====================================================================*/
    function buildTileList() {
      if (!elTileList) return;
      elTileList.innerHTML = "";

      // Group sheets by group string, preserving first-seen order.
      var order = [];
      var groups = Object.create(null);
      for (var i = 0; i < sheets.length; i++) {
        var s = sheets[i];
        if (!groups[s.group]) { groups[s.group] = []; order.push(s.group); }
        groups[s.group].push(s);
      }

      for (var g = 0; g < order.length; g++) {
        var gname = order[g];
        var list = groups[gname];
        var details = document.createElement("details");
        details.className = "group";

        var summary = document.createElement("summary");
        var chev = document.createElement("span");
        chev.className = "chev"; chev.textContent = "▶";
        var label = document.createTextNode(" " + gname + " ");
        var pack = document.createElement("span");
        var packName = list[0] ? list[0].pack : "";
        pack.className = "group-pack" + (packName === "sorry" ? " sorry" : "");
        pack.textContent = packName;
        var gcount = document.createElement("span");
        gcount.className = "gcount";
        var tilesInGroup = 0;
        for (var ti = 0; ti < list.length; ti++) tilesInGroup += (list[ti].cells ? list[ti].cells.length : 0);
        gcount.textContent = fmtNum(tilesInGroup);

        summary.appendChild(chev);
        summary.appendChild(label);
        summary.appendChild(pack);
        summary.appendChild(gcount);
        details.appendChild(summary);

        for (var si = 0; si < list.length; si++) {
          details.appendChild(buildSheetEl(list[si]));
        }
        elTileList.appendChild(details);
      }

      // Lazy swatch rendering: observe each .sheet; build when it scrolls in.
      setupSwatchObserver();
    }

    function buildSheetEl(sheet) {
      var wrap = document.createElement("div");
      wrap.className = "sheet";
      wrap.setAttribute("data-sheet", sheet.id);
      wrap.setAttribute("data-name", (sheet.group + " " + sheet.name).toLowerCase());

      var head = document.createElement("div");
      head.className = "sheet-head";
      var sname = document.createElement("span");
      sname.className = "sname";
      sname.textContent = sheet.name;
      sname.title = sheet.name;
      var openBtn = document.createElement("button");
      openBtn.className = "open-sheet mini-text";
      openBtn.textContent = "open";
      openBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        openSheetModal(sheet);
      });
      head.appendChild(sname);
      head.appendChild(openBtn);

      var sw = document.createElement("div");
      sw.className = "swatches";

      wrap.appendChild(head);
      wrap.appendChild(sw);
      return wrap;
    }

    function setupSwatchObserver() {
      if (swatchObserver) swatchObserver.disconnect();
      if (typeof IntersectionObserver === "undefined") {
        // Fallback: build everything immediately (rare).
        var all = elTileList.querySelectorAll(".sheet");
        Array.prototype.forEach.call(all, function (el) {
          buildSwatches(el, el.getAttribute("data-sheet"));
        });
        return;
      }
      swatchObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            var el = en.target;
            buildSwatches(el, el.getAttribute("data-sheet"));
            swatchObserver.unobserve(el);
          }
        });
      }, { root: elTileList, rootMargin: "200px 0px" });

      var sheetsEls = elTileList.querySelectorAll(".sheet");
      Array.prototype.forEach.call(sheetsEls, function (el) {
        swatchObserver.observe(el);
      });
    }

    function buildSwatches(sheetEl, sheetId) {
      if (builtSheets[sheetId]) return;
      var sheet = sheetById[sheetId];
      if (!sheet) return;
      var container = sheetEl.querySelector(".swatches");
      if (!container) return;
      builtSheets[sheetId] = true;
      swatchCanvases[sheetId] = [];

      var img = getImg(sheet); // request load (may be pending)
      var frag = document.createDocumentFragment();
      var cells = sheet.cells || [];
      for (var k = 0; k < cells.length; k++) {
        var idx = cells[k];
        var btn = document.createElement("button");
        btn.className = "swatch";
        btn.setAttribute("draggable", "true");
        btn.setAttribute("data-sheet", sheetId);
        btn.setAttribute("data-i", String(idx));
        btn.title = sheet.name + " #" + idx;

        var cv = document.createElement("canvas");
        cv.width = 32; cv.height = 32;
        btn.appendChild(cv);
        drawSwatch(cv, sheet, idx);
        swatchCanvases[sheetId].push({ i: idx, canvas: cv });

        (function (s, ii, button) {
          button.addEventListener("click", function () {
            setBrushTile(s, ii);
            highlightSwatch(s, ii);
          });
          button.addEventListener("dragstart", function (ev) {
            try { ev.dataTransfer.setData("text/tile", s + ":" + ii); } catch (e) {}
            try { ev.dataTransfer.effectAllowed = "copy"; } catch (e) {}
          });
        })(sheetId, idx, btn);

        frag.appendChild(btn);
      }
      container.appendChild(frag);

      // If the image wasn't ready, redraw all these swatches once it loads.
      if (!isImgReady(sheetId) && img) {
        img.addEventListener("load", function once() {
          img.removeEventListener("load", once);
          redrawSheetSwatches(sheetId);
        });
      }
    }

    function drawSwatch(cv, sheet, idx) {
      var ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.imageSmoothingEnabled = false;
      if (!isImgReady(sheet.id)) return; // will be redrawn on load
      var img = imgCache.get(sheet.id);
      var sx = (idx % sheet.cols) * TILE;
      var sy = Math.floor(idx / sheet.cols) * TILE;
      try { ctx.drawImage(img, sx, sy, TILE, TILE, 0, 0, cv.width, cv.height); }
      catch (e) { /* ignore */ }
    }

    function redrawSheetSwatches(sheetId) {
      var arr = swatchCanvases[sheetId];
      if (!arr) return;
      var sheet = sheetById[sheetId];
      if (!sheet) return;
      for (var i = 0; i < arr.length; i++) {
        drawSwatch(arr[i].canvas, sheet, arr[i].i);
      }
    }

    // Swatch active highlight.
    function deselectSwatch() {
      var prev = elTileList ? elTileList.querySelector(".swatch.is-active") : null;
      if (prev) prev.classList.remove("is-active");
    }
    function highlightSwatch(sheetId, idx) {
      deselectSwatch();
      if (!elTileList) return;
      var sel = elTileList.querySelector('.swatch[data-sheet="' + cssEscape(sheetId) + '"][data-i="' + idx + '"]');
      if (sel) sel.classList.add("is-active");
    }
    function cssEscape(s) {
      // Minimal escaping for attribute selector values (ids are file-safe but be safe).
      return String(s).replace(/["\\]/g, "\\$&");
    }

    // Search
    if (elTileSearch) {
      elTileSearch.addEventListener("input", function () {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(applySearch, 120);
      });
    }
    function applySearch() {
      if (!elTileList) return;
      var q = (elTileSearch ? elTileSearch.value : "").trim().toLowerCase();
      var groups = elTileList.querySelectorAll(".group");
      var matchCount = 0;
      Array.prototype.forEach.call(groups, function (gEl) {
        var sheetsEls = gEl.querySelectorAll(".sheet");
        var anyVisible = false;
        Array.prototype.forEach.call(sheetsEls, function (sEl) {
          var hay = sEl.getAttribute("data-name") || "";
          var show = q === "" || hay.indexOf(q) !== -1;
          sEl.style.display = show ? "" : "none";
          if (show && q !== "") {
            var sid = sEl.getAttribute("data-sheet");
            var sheet = sheetById[sid];
            if (sheet) matchCount += (sheet.cells ? sheet.cells.length : 0);
          }
          if (show) anyVisible = true;
        });
        gEl.style.display = anyVisible ? "" : "none";
        if (q !== "") { if (anyVisible) gEl.open = true; }
      });
      // Update count text.
      if (elTileCount) {
        if (q === "") {
          elTileCount.textContent = fmtNum(sheets.length) + " sheets · " + fmtNum(totalTileCount()) + " tiles";
        } else {
          elTileCount.textContent = fmtNum(matchCount) + " matches";
        }
      }
    }

    if (elCollapseAll) {
      elCollapseAll.addEventListener("click", function () {
        if (!elTileList) return;
        var groups = elTileList.querySelectorAll(".group");
        Array.prototype.forEach.call(groups, function (g) { g.open = false; });
      });
    }

    function totalTileCount() {
      var n = 0;
      for (var i = 0; i < sheets.length; i++) n += (sheets[i].cells ? sheets[i].cells.length : 0);
      return n;
    }

    /* ======================================================================
     * SHEET MODAL (stamp picker)
     * ====================================================================*/
    function openSheetModal(sheet) {
      if (!elSheetModal || !sheet) return;
      modalSheet = sheet;
      modalSel = null;
      modalDragStart = null;
      if (elSheetTitle) elSheetTitle.textContent = sheet.name;
      if (elSheetSel) elSheetSel.textContent = "No selection";
      if (elSheetUse) elSheetUse.disabled = true;

      // Integer scale that fits ~720px, at least 8 if small, clamped 1..24.
      var maxDim = Math.max(sheet.w, sheet.h) || TILE;
      var scale = clamp(Math.floor(720 / maxDim), 1, 24);
      if (maxDim <= 48) scale = Math.max(scale, 8); // keep tiny sheets visible
      scale = clamp(scale, 1, 24);
      modalScale = scale;

      var cw = sheet.w * scale, chh = sheet.h * scale;
      if (elSheetCanvas) { elSheetCanvas.width = cw; elSheetCanvas.height = chh; }
      if (elSheetOverlay) { elSheetOverlay.width = cw; elSheetOverlay.height = chh; }

      drawSheetCanvas();
      drawSheetOverlay();

      elSheetModal.removeAttribute("hidden");
    }
    function closeSheetModal() {
      if (elSheetModal) elSheetModal.setAttribute("hidden", "");
      modalSheet = null; modalSel = null; modalDragStart = null;
    }

    function drawSheetCanvas() {
      if (!elSheetCanvas || !modalSheet) return;
      var ctx = elSheetCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, elSheetCanvas.width, elSheetCanvas.height);
      var sheet = modalSheet;
      if (!isImgReady(sheet.id)) {
        var img = getImg(sheet);
        if (img) {
          img.addEventListener("load", function once() {
            img.removeEventListener("load", once);
            if (modalSheet && modalSheet.id === sheet.id) drawSheetCanvas();
          });
        }
      } else {
        try {
          ctx.drawImage(imgCache.get(sheet.id), 0, 0, sheet.w, sheet.h,
            0, 0, elSheetCanvas.width, elSheetCanvas.height);
        } catch (e) {}
      }
      // Faint grid every 16 source px (scaled).
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var x = 0; x <= sheet.w; x += TILE) {
        var px = Math.round(x * modalScale) + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, elSheetCanvas.height);
      }
      for (var y = 0; y <= sheet.h; y += TILE) {
        var py = Math.round(y * modalScale) + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(elSheetCanvas.width, py);
      }
      ctx.stroke();
    }

    function drawSheetOverlay() {
      if (!elSheetOverlay) return;
      var ctx = elSheetOverlay.getContext("2d");
      ctx.clearRect(0, 0, elSheetOverlay.width, elSheetOverlay.height);
      if (!modalSel) return;
      var step = TILE * modalScale;
      var x = modalSel.x * step, y = modalSel.y * step;
      var w = modalSel.w * step, h = modalSel.h * step;
      ctx.fillStyle = "rgba(124,179,66,.22)";
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = "rgba(165,214,106,.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }

    function sheetOverlayCell(ev) {
      if (!elSheetOverlay || !modalSheet) return { x: 0, y: 0 };
      var r = elSheetOverlay.getBoundingClientRect();
      // Account for CSS scaling of the overlay (it may be displayed at native size).
      var scaleX = elSheetOverlay.width / (r.width || 1);
      var scaleY = elSheetOverlay.height / (r.height || 1);
      var px = (ev.clientX - r.left) * scaleX;
      var py = (ev.clientY - r.top) * scaleY;
      var step = TILE * modalScale;
      var cx = Math.floor(px / step);
      var cy = Math.floor(py / step);
      cx = clamp(cx, 0, modalSheet.cols - 1);
      cy = clamp(cy, 0, modalSheet.rows - 1);
      return { x: cx, y: cy };
    }

    if (elSheetOverlay) {
      elSheetOverlay.addEventListener("pointerdown", function (ev) {
        if (!modalSheet) return;
        try { elSheetOverlay.setPointerCapture(ev.pointerId); } catch (e) {}
        var c = sheetOverlayCell(ev);
        modalDragStart = c;
        modalSel = { x: c.x, y: c.y, w: 1, h: 1 };
        updateSheetSel();
        drawSheetOverlay();
      });
      elSheetOverlay.addEventListener("pointermove", function (ev) {
        if (!modalDragStart) return;
        var c = sheetOverlayCell(ev);
        var x0 = Math.min(modalDragStart.x, c.x);
        var y0 = Math.min(modalDragStart.y, c.y);
        var x1 = Math.max(modalDragStart.x, c.x);
        var y1 = Math.max(modalDragStart.y, c.y);
        modalSel = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        updateSheetSel();
        drawSheetOverlay();
      });
      elSheetOverlay.addEventListener("pointerup", function (ev) {
        try { elSheetOverlay.releasePointerCapture(ev.pointerId); } catch (e) {}
        modalDragStart = null;
      });
      elSheetOverlay.addEventListener("pointercancel", function () {
        modalDragStart = null;
      });
    }

    function updateSheetSel() {
      if (elSheetSel) {
        elSheetSel.textContent = modalSel
          ? (modalSel.w + "×" + modalSel.h + " tiles")
          : "No selection";
      }
      if (elSheetUse) elSheetUse.disabled = !modalSel;
    }

    if (elSheetUse) {
      elSheetUse.addEventListener("click", function () {
        if (!modalSheet || !modalSel) return;
        if (modalSel.w === 1 && modalSel.h === 1) {
          var i = modalSel.y * modalSheet.cols + modalSel.x;
          setBrushTile(modalSheet.id, i);
          highlightSwatch(modalSheet.id, i);
        } else {
          setBrushStamp(modalSheet.id, modalSel.x, modalSel.y, modalSel.w, modalSel.h);
        }
        closeSheetModal();
      });
    }
    if (elSheetClose) elSheetClose.addEventListener("click", closeSheetModal);
    if (elSheetModal) {
      elSheetModal.addEventListener("click", function (ev) {
        if (ev.target === elSheetModal) closeSheetModal(); // backdrop click
      });
    }

    /* ======================================================================
     * BRUSH PREVIEW clear button
     * ====================================================================*/
    if (elClearBrush) {
      elClearBrush.addEventListener("click", clearBrush);
    }

    /* ======================================================================
     * MAP CONTROLS (top bar + left rail)
     * ====================================================================*/
    if (elBgCheck) {
      elBgCheck.addEventListener("change", function () {
        map.bg = !!elBgCheck.checked; dirty = true; scheduleAutosave();
      });
    }
    if (elToggleGrid) {
      elToggleGrid.addEventListener("click", function () {
        gridOn = !gridOn;
        elToggleGrid.classList.toggle("is-on", gridOn);
        dirty = true;
      });
    }
    if (elZoomIn) elZoomIn.addEventListener("click", function () { zoomBy(1.25); });
    if (elZoomOut) elZoomOut.addEventListener("click", function () { zoomBy(1 / 1.25); });
    if (elZoomFit) elZoomFit.addEventListener("click", fitMap);

    function zoomBy(factor) {
      // Zoom toward the stage center.
      var cx = elStage ? elStage.clientWidth / 2 : 0;
      var cy = elStage ? elStage.clientHeight / 2 : 0;
      var newZoom = clamp(zoom * factor, 0.25, 16);
      if (newZoom === zoom) return;
      var worldX = (cx - panX) / (TILE * zoom);
      var worldY = (cy - panY) / (TILE * zoom);
      zoom = newZoom;
      panX = cx - worldX * TILE * zoom;
      panY = cy - worldY * TILE * zoom;
      updateZoomLabel();
      dirty = true;
    }

    function fitMap() {
      if (!elStage) return;
      var margin = 24;
      var availW = Math.max(1, elStage.clientWidth - margin * 2);
      var availH = Math.max(1, elStage.clientHeight - margin * 2);
      var z = Math.min(availW / (map.w * TILE), availH / (map.h * TILE));
      zoom = clamp(z, 0.25, 16);
      // Center the map.
      var cs = TILE * zoom;
      panX = Math.round((elStage.clientWidth - map.w * cs) / 2);
      panY = Math.round((elStage.clientHeight - map.h * cs) / 2);
      updateZoomLabel();
      dirty = true;
    }

    function updateZoomLabel() {
      if (elZoomLabel) elZoomLabel.textContent = Math.round(zoom * 100) + "%";
    }

    if (elResizeMap) {
      elResizeMap.addEventListener("click", function () {
        var w = clamp(parseInt(elMapW ? elMapW.value : map.w, 10) || map.w, 1, 400);
        var h = clamp(parseInt(elMapH ? elMapH.value : map.h, 10) || map.h, 1, 400);
        resizeMap(w, h);
      });
    }
    function resizeMap(w, h) {
      map.w = w; map.h = h;
      // Drop cells that no longer fit.
      for (var li = 0; li < map.layers.length; li++) {
        var layer = map.layers[li];
        var toDelete = [];
        layer.cells.forEach(function (v, key) {
          var parts = key.split(",");
          var cx = parseInt(parts[0], 10), cy = parseInt(parts[1], 10);
          if (cx < 0 || cy < 0 || cx >= w || cy >= h) toDelete.push(key);
        });
        for (var d = 0; d < toDelete.length; d++) layer.cells.delete(toDelete[d]);
      }
      if (elMapW) elMapW.value = String(w);
      if (elMapH) elMapH.value = String(h);
      clearHistory();
      fitMap();
      dirty = true;
      afterMutation();
    }

    if (elNewMap) {
      elNewMap.addEventListener("click", function () {
        if (!window.confirm("Start a new blank map? Unsaved work will be lost.")) return;
        var w = clamp(parseInt(elMapW ? elMapW.value : 40, 10) || 40, 1, 400);
        var h = clamp(parseInt(elMapH ? elMapH.value : 30, 10) || 30, 1, 400);
        map = newMap(w, h);
        if (elBgCheck) map.bg = !!elBgCheck.checked;
        if (elMapW) elMapW.value = String(w);
        if (elMapH) elMapH.value = String(h);
        clearHistory();
        renderLayers();
        fitMap();
        dirty = true;
        afterMutation();
      });
    }

    function updateStatusLine() {
      if (!elStatusLine) return;
      var placed = 0;
      for (var li = 0; li < map.layers.length; li++) placed += map.layers[li].cells.size;
      elStatusLine.textContent = map.w + "×" + map.h + " · " +
        map.layers.length + " layer" + (map.layers.length === 1 ? "" : "s") + " · " +
        fmtNum(placed) + " tiles placed";
      if (elMapW) elMapW.value = String(map.w);
      if (elMapH) elMapH.value = String(map.h);
    }

    /* ======================================================================
     * PERSISTENCE — serialize / deserialize / autosave / files
     * ====================================================================*/
    function serializeProject() {
      var layers = [];
      for (var li = 0; li < map.layers.length; li++) {
        var layer = map.layers[li];
        var cells = {};
        layer.cells.forEach(function (v, key) {
          cells[key] = [v.s, v.i];
        });
        layers.push({ name: layer.name, visible: !!layer.visible, cells: cells });
      }
      return {
        format: "sprout-valley-map",
        version: 1,
        tile: TILE,
        w: map.w, h: map.h,
        bg: !!map.bg,
        active: map.active,
        layers: layers
      };
    }

    function deserializeProject(obj) {
      // Returns a map model, or null if invalid. Null-safe throughout.
      if (!obj || obj.format !== "sprout-valley-map") return null;
      var w = clamp(parseInt(obj.w, 10) || 40, 1, 400);
      var h = clamp(parseInt(obj.h, 10) || 30, 1, 400);
      var layersIn = Array.isArray(obj.layers) ? obj.layers : [];
      var layers = [];
      for (var li = 0; li < layersIn.length; li++) {
        var L = layersIn[li] || {};
        var layer = newLayer(typeof L.name === "string" ? L.name : ("Layer " + (li + 1)));
        layer.visible = L.visible !== false;
        var cells = L.cells || {};
        for (var key in cells) {
          if (!Object.prototype.hasOwnProperty.call(cells, key)) continue;
          var pair = cells[key];
          if (!Array.isArray(pair) || pair.length < 2) continue;
          var sid = pair[0], idx = parseInt(pair[1], 10);
          if (typeof sid !== "string" || isNaN(idx)) continue;
          // Only keep cells whose coords are within the (clamped) map.
          var parts = key.split(",");
          var cx = parseInt(parts[0], 10), cy = parseInt(parts[1], 10);
          if (isNaN(cx) || isNaN(cy) || cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
          layer.cells.set(cx + "," + cy, { s: sid, i: idx });
        }
        layers.push(layer);
      }
      if (!layers.length) layers.push(newLayer("Ground"));
      var active = parseInt(obj.active, 10);
      if (isNaN(active) || active < 0 || active >= layers.length) active = 0;
      return {
        w: w, h: h,
        layers: layers,
        active: active,
        bg: obj.bg !== false
      };
    }

    function loadProjectObject(obj, opts) {
      var m = deserializeProject(obj);
      if (!m) return false;
      map = m;
      if (elBgCheck) elBgCheck.checked = !!map.bg;
      if (elMapW) elMapW.value = String(map.w);
      if (elMapH) elMapH.value = String(map.h);
      clearHistory();
      renderLayers();
      if (!opts || opts.fit !== false) fitMap();
      dirty = true;
      updateStatusLine();
      return true;
    }

    function scheduleAutosave() {
      if (autosaveTimer) clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(doAutosave, 600);
    }
    function doAutosave() {
      try {
        var json = JSON.stringify(serializeProject());
        window.localStorage.setItem(AUTOSAVE_KEY, json);
      } catch (e) { /* storage full or unavailable — ignore */ }
    }
    function loadAutosave() {
      var raw = null;
      try { raw = window.localStorage.getItem(AUTOSAVE_KEY); }
      catch (e) { raw = null; }
      if (!raw) return false;
      var obj = null;
      try { obj = JSON.parse(raw); } catch (e) { return false; }
      return loadProjectObject(obj, { fit: false });
    }

    // afterMutation — called after any change to the map model.
    function afterMutation() {
      updateStatusLine();
      scheduleAutosave();
    }

    // Save / load project files.
    if (elSaveProj) {
      elSaveProj.addEventListener("click", function () {
        try {
          var json = JSON.stringify(serializeProject(), null, 2);
          downloadBlob(new Blob([json], { type: "application/json" }), "sprout-map.json");
          toast("Saved sprout-map.json");
        } catch (e) { toast("Save failed"); }
      });
    }
    if (elLoadProj && elFileInput) {
      elLoadProj.addEventListener("click", function () { elFileInput.click(); });
      elFileInput.addEventListener("change", function () {
        var file = elFileInput.files && elFileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var obj = null;
          try { obj = JSON.parse(reader.result); } catch (e) { obj = null; }
          if (obj && loadProjectObject(obj)) toast("Project loaded");
          else toast("Invalid project file");
          elFileInput.value = ""; // allow re-loading the same file
        };
        reader.onerror = function () { toast("Could not read file"); elFileInput.value = ""; };
        reader.readAsText(file);
      });
    }

    // Export PNG.
    if (elExportPng) {
      elExportPng.addEventListener("click", exportPng);
    }
    function exportPng() {
      // Collect sheets that are actually used by visible layers.
      var needed = Object.create(null);
      for (var li = 0; li < map.layers.length; li++) {
        var layer = map.layers[li];
        if (!layer.visible) continue;
        layer.cells.forEach(function (v) { needed[v.s] = true; });
      }
      var pending = [];
      for (var sid in needed) {
        if (!Object.prototype.hasOwnProperty.call(needed, sid)) continue;
        var sheet = sheetById[sid];
        if (!sheet) continue;
        var img = getImg(sheet);
        if (img && !isImgReady(sid)) {
          pending.push(new Promise(function (resolve) {
            function done() { img.removeEventListener("load", done); img.removeEventListener("error", done); resolve(); }
            img.addEventListener("load", done);
            img.addEventListener("error", done);
            // Safety timeout so a stuck image can't block export forever.
            setTimeout(resolve, 5000);
          }));
        }
      }
      Promise.all(pending).then(function () {
        doExportPng();
      }, function () { doExportPng(); });
    }
    function doExportPng() {
      var off = document.createElement("canvas");
      off.width = Math.max(1, map.w * TILE);
      off.height = Math.max(1, map.h * TILE);
      var ctx = off.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      // Transparent background (ignore checkerboard for export).
      for (var li = 0; li < map.layers.length; li++) {
        var layer = map.layers[li];
        if (!layer.visible) continue;
        layer.cells.forEach(function (v, key) {
          var sheet = sheetById[v.s];
          if (!sheet || !isImgReady(sheet.id)) return; // export what's available
          var parts = key.split(",");
          var cx = parseInt(parts[0], 10), cy = parseInt(parts[1], 10);
          var sx = (v.i % sheet.cols) * TILE;
          var sy = Math.floor(v.i / sheet.cols) * TILE;
          try {
            ctx.drawImage(imgCache.get(sheet.id), sx, sy, TILE, TILE, cx * TILE, cy * TILE, TILE, TILE);
          } catch (e) {}
        });
      }
      if (off.toBlob) {
        off.toBlob(function (blob) {
          if (blob) { downloadBlob(blob, "sprout-map.png"); toast("Exported sprout-map.png"); }
          else fallbackDataUrl();
        }, "image/png");
      } else {
        fallbackDataUrl();
      }
      function fallbackDataUrl() {
        try {
          var url = off.toDataURL("image/png");
          downloadUrl(url, "sprout-map.png");
          toast("Exported sprout-map.png");
        } catch (e) { toast("Export failed"); }
      }
    }

    function downloadBlob(blob, name) {
      var url = URL.createObjectURL(blob);
      downloadUrl(url, name);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
    function downloadUrl(url, name) {
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    /* ======================================================================
     * TOAST
     * ====================================================================*/
    var toastTimer = null;
    function toast(msg) {
      if (!elToast) return;
      elToast.textContent = msg;
      elToast.removeAttribute("hidden");
      elToast.style.opacity = "1";
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        elToast.style.opacity = "0";
        setTimeout(function () { elToast.setAttribute("hidden", ""); }, 220);
      }, 1800);
    }

    /* ======================================================================
     * KEYBOARD
     * ====================================================================*/
    function isTyping(t) {
      if (!t) return false;
      var tag = t.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
    }
    document.addEventListener("keydown", function (ev) {
      // Space → pan-ready (even while not typing).
      if (ev.code === "Space" && !isTyping(ev.target)) {
        if (!spaceHeld) {
          spaceHeld = true;
          if (elStage) elStage.classList.add("pan-ready");
        }
        ev.preventDefault();
        return;
      }
      if (isTyping(ev.target)) return;

      var meta = ev.ctrlKey || ev.metaKey;
      if (meta) {
        var k = ev.key.toLowerCase();
        if (k === "z" && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
        if ((k === "z" && ev.shiftKey) || k === "y") { ev.preventDefault(); redo(); return; }
        return; // leave other ctrl combos alone
      }

      switch (ev.key) {
        case "b": case "B": setTool("paint"); break;
        case "r": case "R": setTool("rect"); break;
        case "g": case "G": setTool("fill"); break;
        case "i": case "I": setTool("eyedropper"); break;
        case "e": case "E": setTool("erase"); break;
        case "[": zoomBy(1 / 1.25); break;
        case "]": zoomBy(1.25); break;
        default: return;
      }
    });
    document.addEventListener("keyup", function (ev) {
      if (ev.code === "Space") {
        spaceHeld = false;
        if (elStage) elStage.classList.remove("pan-ready");
        if (dragMode !== "pan" && elStage) elStage.classList.remove("panning");
      }
    });
    // Drop pan-ready if the window loses focus while space is "held".
    window.addEventListener("blur", function () {
      spaceHeld = false;
      if (elStage) { elStage.classList.remove("pan-ready"); }
    });

    /* ======================================================================
     * UTILITIES
     * ====================================================================*/
    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
    function fmtNum(n) {
      // Thousands separators (e.g. 15,594).
      n = n || 0;
      return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    /* ======================================================================
     * RESIZE OBSERVER + rAF LOOP startup
     * ====================================================================*/
    if (typeof ResizeObserver !== "undefined" && elStage) {
      var ro = new ResizeObserver(function () { resizeCanvas(); });
      ro.observe(elStage);
    } else {
      window.addEventListener("resize", resizeCanvas);
    }

    /* ======================================================================
     * MANIFEST LOAD + INIT
     * ====================================================================*/
    function init() {
      // Build initial UI from whatever map we have (default or autosave).
      renderLayers();
      resizeCanvas();
      updateZoomLabel();
      updateStatusLine();
      window.requestAnimationFrame(frame);

      // Try autosave (null-safe; default map if none/invalid).
      loadAutosave();

      // Fetch the tile manifest (relative).
      fetch("tiles-manifest.json")
        .then(function (res) {
          if (!res.ok) throw new Error("manifest HTTP " + res.status);
          return res.json();
        })
        .then(function (data) {
          manifest = data || {};
          if (typeof manifest.tile === "number" && manifest.tile > 0) TILE = manifest.tile;
          sheets = Array.isArray(manifest.sheets) ? manifest.sheets : [];
          // Build lookups.
          for (var i = 0; i < sheets.length; i++) {
            var s = sheets[i];
            sheetById[s.id] = s;
            nonEmptyBySheet[s.id] = new Set(s.cells || []);
          }
          buildTileList();
          applySearch(); // sets the initial "N sheets · M tiles" text
          finishReady();
        })
        .catch(function (err) {
          // Manifest failed — still let the user move around an empty map.
          if (elTileList) {
            var note = document.createElement("div");
            note.className = "empty-note";
            note.textContent = "Could not load tiles-manifest.json — tiles unavailable.";
            elTileList.appendChild(note);
          }
          if (elTileCount) elTileCount.textContent = "0 sheets";
          finishReady();
        });
    }

    function finishReady() {
      ready = true;
      // Hide the loader overlay.
      if (elLoader) elLoader.style.display = "none";
      // Initial framing.
      fitMap();
      dirty = true;
      setTool(tool);
    }

    // Kick everything off.
    init();
  }
})();
