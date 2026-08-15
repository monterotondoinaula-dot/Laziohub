let currentManifest = null;
let currentYearData = null;

$(document.body).ready(function() {
  initApp();
});

function initApp() {
  $.getJSON("data/manifest.json")
    .done(function(manifest) {
      currentManifest = manifest;
      $("#comune-title").html('Comune di ' + manifest.comune + ' <small>(' + manifest.provincia + ')</small>');
      $("#popolazione-sub").text('Popolazione residente: ' + manifest.popolazione.toLocaleString('it-IT') + ' abitanti');

      // Popola select anno
      var $select = $("#year-select");
      $select.empty();
      manifest.anni_disponibili.forEach(function(anno) {
        $select.append($('<option>', { value: anno, text: anno }));
      });
      $select.val(manifest.default_year);

      $select.on("change", function() {
        loadData($(this).val());
      });

      loadData(manifest.default_year);
    })
    .fail(function() {
      console.error("Errore nel caricamento del manifest.json");
    });
}

function loadData(anno) {
  $.getJSON("data/" + anno + ".json")
    .done(function(data) {
      currentYearData = data;
      updateKPI(data);
      renderSection(data.entrate_tipologia, "#entrate-bubbles", "#table-entrate tbody", data.anno_confronto);
      renderSection(data.spese_programma, "#spese-bubbles", "#table-spese tbody", data.anno_confronto);
    })
    .fail(function() {
      console.error("Errore nel caricamento dei dati per l'anno: " + anno);
    });
}

function updateKPI(data) {
  var totEntrate = d3.sum(data.entrate_tipologia, function(d) { return d.v_curr; });
  var totSpese = d3.sum(data.spese_programma, function(d) { return d.v_curr; });
  var pop = currentManifest ? currentManifest.popolazione : 1;
  var proCapite = totSpese / pop;

  var formatEuro = function(val) {
    return "€ " + Math.round(val).toLocaleString('it-IT');
  };

  $("#kpi-totale-entrate").text(formatEuro(totEntrate));
  $("#kpi-totale-spese").text(formatEuro(totSpese));
  $("#kpi-pro-capite").text("€ " + Math.round(proCapite).toLocaleString('it-IT') + " / ab");
}

function renderSection(items, chartContainerSelector, tableBodySelector, annoConfronto) {
  renderTable(items, tableBodySelector, annoConfronto);
  renderOpenBilanciBubbles(items, chartContainerSelector, annoConfronto);
}

function renderTable(items, tableBodySelector, annoConfronto) {
  var $tbody = $(tableBodySelector);
  $tbody.empty();

  var formatEuro = function(val) {
    return "€ " + Math.round(val).toLocaleString('it-IT');
  };

  items.sort(function(a, b) { return b.v_curr - a.v_curr; });

  items.forEach(function(item) {
    var diff = item.v_curr - item.v_prev;
    var perc = item.v_prev > 0 ? ((diff / item.v_prev) * 100).toFixed(1) : 0;
    
    var badgeClass = perc > 1 ? "badge-up" : (perc < -1 ? "badge-down" : "badge-equal");
    var badgeSign = perc > 0 ? "+" : "";

    var row = '<tr>' +
      '<td><strong>' + item.label + '</strong><br><small class="text-muted">' + item.sub + '</small></td>' +
      '<td class="text-right">' + formatEuro(item.v_curr) + '</td>' +
      '<td class="text-right"><span class="badge-var ' + badgeClass + '">' + badgeSign + perc + '%</span></td>' +
      '</tr>';
    $tbody.append(row);
  });
}

function renderOpenBilanciBubbles(items, containerSelector, annoConfronto) {
  var $container = $(containerSelector);
  $container.empty();

  var width = $container.width() || 600;
  var height = 480;

  var validItems = items.filter(function(d) { return d.v_curr > 0; });

  var svg = d3.select(containerSelector)
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  // Scala dimensione raggio
  var maxVal = d3.max(validItems, function(d) { return d.v_curr; });
  var radiusScale = d3.scale.sqrt()
    .domain([0, maxVal])
    .range([8, 65]);

  // Colori stile OpenBilanci basati sulla variazione percentuale
  var getColor = function(d) {
    var diff = d.v_curr - d.v_prev;
    var perc = d.v_prev > 0 ? (diff / d.v_prev) * 100 : 0;
    if (perc > 2) return "#2ecc71";   // Verde (Aumento)
    if (perc < -2) return "#e74c3c";  // Rosso (Calo)
    return "#f39c12";                 // Giallo/Arancio (Stabile)
  };

  // Node layout per posizionamento bolle senza sovrapposizioni (D3 Force Simulation)
  var nodes = validItems.map(function(d) {
    return {
      radius: radiusScale(d.v_curr),
      data: d,
      x: width / 2 + (Math.random() - 0.5) * 50,
      y: height / 2 + (Math.random() - 0.5) * 50
    };
  });

  var force = d3.layout.force()
    .nodes(nodes)
    .size([width, height])
    .gravity(0.08)
    .charge(-120)
    .friction(0.85)
    .on("tick", tick)
    .start();

  var node = svg.selectAll(".node")
    .data(nodes)
    .enter().append("g")
    .attr("class", "node")
    .call(force.drag);

  // Disegno Bolle
  node.append("circle")
    .attr("class", "bubble")
    .attr("r", function(d) { return d.radius; })
    .style("fill", function(d) { return getColor(d.data); })
    .on("mouseover", function(d) {
      var diff = d.data.v_curr - d.data.v_prev;
      var perc = d.data.v_prev > 0 ? ((diff / d.data.v_prev) * 100).toFixed(1) : "0.0";
      var formatEuro = function(v) { return "€ " + Math.round(v).toLocaleString('it-IT'); };

      $("#ob-tooltip").html(
        '<div class="tt-title">' + d.data.label + '</div>' +
        '<div><small>' + d.data.sub + '</small></div>' +
        '<div style="margin-top:5px;">Previsione: <strong>' + formatEuro(d.data.v_curr) + '</strong></div>' +
        '<div>vs ' + annoConfronto + ': ' + formatEuro(d.data.v_prev) + '</div>' +
        '<div>Variazione: <strong>' + (perc > 0 ? '+' : '') + perc + '%</strong></div>'
      ).css("opacity", 1);
    })
    .on("mousemove", function() {
      var e = d3.event;
      $("#ob-tooltip").css({
        left: (e.pageX + 15) + "px",
        top: (e.pageY - 20) + "px"
      });
    })
    .on("mouseout", function() {
      $("#ob-tooltip").css("opacity", 0);
    });

  // Testo interno alle bolle
  node.append("text")
    .attr("class", "bubble-label")
    .attr("dy", ".3em")
    .text(function(d) {
      return d.radius > 22 ? truncate(d.data.label, Math.floor(d.radius / 4)) : "";
    });

  function tick(e) {
    node.each(collide(0.3));
    node.attr("transform", function(d) {
      // Limita movimento dentro il canvas
      d.x = Math.max(d.radius, Math.min(width - d.radius, d.x));
      d.y = Math.max(d.radius, Math.min(height - d.radius, d.y));
      return "translate(" + d.x + "," + d.y + ")";
    });
  }

  // Risoluzione collisioni tra cerchi
  function collide(alpha) {
    var quadtree = d3.geom.quadtree(nodes);
    return function(d) {
      var r = d.radius + 10,
          nx1 = d.x - r,
          nx2 = d.x + r,
          ny1 = d.y - r,
          ny2 = d.y + r;
      quadtree.visit(function(quad, x1, y1, x2, y2) {
        if (quad.point && (quad.point !== d)) {
          var x = d.x - quad.point.x,
              y = d.y - quad.point.y,
              l = Math.sqrt(x * x + y * y),
              r = d.radius + quad.point.radius + 4;
          if (l < r) {
            l = (l - r) / l * alpha;
            d.x -= x *= l;
            d.y -= y *= l;
            quad.point.x += x;
            quad.point.y += y;
          }
        }
        return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
      });
    };
  }

  function truncate(str, len) {
    return str.length > len ? str.substring(0, len - 1) + "…" : str;
  }
}