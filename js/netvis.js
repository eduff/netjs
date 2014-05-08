(function() {

  /*
   * Draw the nodes of the given network.
   */
  function drawFullNodes(svg, network, radius) {

    var clusterLayout  = d3.layout.cluster().size([360, radius-50]);
    var rootNode       = network.treeNodes[network.treeNodes.length - 1];
    var clusteredNodes = clusterLayout.nodes(rootNode);
    var leafNodes      = network.nodes;

    var svgNodes = svg.append("g").selectAll(".node")
      .data(network.nodes)
      .enter();

    var svgNodeLabels = svg.append("g").selectAll(".node")
      .data(network.nodes)
      .enter(); 

    // Position nodes in a big circle
    function positionNode(node, off) {
      return "rotate("    + (node.x - 90)   + ")"   + 
             "translate(" + (node.y + off)  + ",0)" + 
             (node.x < 180 ? "" : "rotate(180)"); 
    }

    // Colour each node and its label according to cluster
    // TODO will there ever be more than 10 clusters?
    clusterScale = d3.scale.category10();
    function colourNode(node) {
      return clusterScale(node.cluster-1 % 10);
    }

    /*
     * The circle and label for a specific node are given css classs 
     * 'node-X', where X is the node id. For every neighbour of a 
     * particular node, that node is also given the css class 
     * 'nodenbr-Y', where Y is the index of the neighbour.
     */
    function nodeClasses(node) {
      var classes = ["node-" + node.index];

      node.neighbours.forEach(function(nbr) {
        classes.push("nodenbr-" + nbr.index);
      });

      return classes.join(" ");
    }

    // Draw the nodes
    svgNodes = svgNodes
      .append("circle")
      .attr("class",     nodeClasses)
      .attr("transform", function(node) {return positionNode(node, 8);})
      .attr("r",         3)
      .attr("fill",      colourNode);
      
    // Draw the node labels
    svgNodeLabels = svgNodeLabels
      .append("text")
      .attr("class",       nodeClasses)
      .attr("dy",          ".31em")
      .attr("fill",         colourNode)
      .attr("transform",    function(node) {return positionNode(node, 12);})
      .style("text-anchor", function(node) {return node.x < 180 ? "start" : "end"; })
      .text(function(node) { return node.name; });

    network.svgNodes      = svgNodes;
    network.svgNodeLabels = svgNodeLabels;
  }

  /*
   * Draw the edges of the given network.
   */
  function drawFullEdges(svg, network, radius) {

    // For drawing network edges as splines
    var bundle = d3.layout.bundle();
    var line   = d3.svg.line.radial()
      .interpolate("bundle")
      .tension(.85)
      .radius(function(node) { return node.y; })
      .angle( function(node) { return node.x / 180 * Math.PI; });


     // Each svg path element is given two classes - 'edge-X' 
     // and 'edge-Y', where X and Y are the edge endpoints
    function edgeClasses(path) {
      end = path.length - 1;
      classes = ["edge-" + path[0].index, "edge-" + path[end].index];
      return classes.join(" ");
    }

    // Each edge is given an id 'edge-X-Y', where X 
    // and Y are the edge endpoints (and X < Y).
    function edgeId(path) {
      end = path.length - 1;
      idxs = [path[0].index, path[end].index];
      idxs.sort(function(a, b){return a-b});
      return "edge-" + idxs[0] + "-" + idxs[1];
    }

    var colourDomain = d3.max([Math.abs(network.weightMins[1]), 
                               Math.abs(network.weightMaxs[1])]);
    var edgeColourScale = d3.scale.linear()
      .domain([-colourDomain, 0, colourDomain])
      .range(["blue", "white", "red"]);

    function edgeColour(path) {
      var colour = edgeColourScale(path.edge.weights[1]);
      return colour;
    }

    // Edges are drawn as splines
    var paths = bundle(network.edges);

    for (var i = 0; i < paths.length; i++) {
      paths[i].edge         = network.edges[i];
      network.edges[i].path = paths[i];
    }

    // draw the edges
    var svgEdges = svg.append("g").selectAll(".edge")
      .data(paths)
      .enter()
      .append("path")
      .attr("id",            edgeId)
      .attr("class",         edgeClasses)
      .attr("stroke",        edgeColour)
      .attr("stroke-width",  1)
      .attr("fill",         "none")
      .attr("d",             line);
  }

  /*
   * Configures mouse-based interaction with the network.
   */
  function configDynamics(svg, network, radius) {

    var svgNodes      = network.svgNodes;
    var svgNodeLabels = network.svgNodeLabels;
    var svgEdges      = network.svgEdges;

    // scale for edge width
    var edgeWidthScale = d3.scale.linear()
      .domain([network.weightMins[0], network.weightMaxs[0]])
      .range([1, 15]);

    function setEdgeWidths(pathElems, paths, over) {
      
      var width = 1;

      if (over) {
        width = function(path) {
          var scaledWidth = edgeWidthScale(path.edge.weights[0]);
          return scaledWidth;
        }
      }

      pathElems
        .data(paths)
        .attr("stroke-width", width)
        .each(function() {this.parentNode.appendChild(this)});
    }

    function mouseOverNode(node, over) {

      
      var paths     = node.edges.map(function(edge) {return edge.path;});
      var pathElems = d3.selectAll(".edge-" + node.index);

      d3.selectAll(".node-"    + node.index).classed("highlight", over);
      d3.selectAll(".nodenbr-" + node.index).classed("highlight", over);
      pathElems                             .classed("highlight", over);
      setEdgeWidths(pathElems, paths, over);
    }

    svgNodes
      .on("mouseover", function(node) {mouseOverNode(node, true);  })
      .on("mouseout",  function(node) {mouseOverNode(node, false); })
    svgNodeLabels
      .on("mouseover", function(node) {mouseOverNode(node, true);  })
      .on("mouseout",  function(node) {mouseOverNode(node, false); })
  }

  /*
   * Takes a network created by the makeNetwork function (below),
   * and displays it in the specified networkDiv element, with 
   * nodes arranged in a big circle.
   *
   * Citation: http://bl.ocks.org/mbostock/7607999
   */
  function displayFullNetwork(network, networkDiv, controlDiv) {

    // TODO generate diameter from display size
    var diameter    = 960;
    var radius      = diameter / 2;

    // put an svg element inside the networkDiv
    var svg = d3.select(networkDiv).append("svg")
      .attr("width",  diameter)
      .attr("height", diameter)
      .append("g")
      .attr("transform", "translate(" + radius + "," + radius + ")");

    drawFullNodes(svg, network, radius);
    drawFullEdges(svg, network, radius);
    configDynamics(svg, network, radius);

    d3.select(self.frameElement).style("height", diameter + "px");
  }


  /*
   * Given a network (see makeNetwork), and the output of a call to the 
   * MATLAB linkage function which describes the dendrogram of clusters 
   * of the network nodes, this function creates a list of 'dummy' nodes 
   * which represent the binary dendrogram tree. This list is added as 
   * an attribute called 'treeNodes' of the provided network.
   */
  function networkToTree(network, linkages) {

    var numNodes  = network.nodes.length;
    var treeNodes = [];

    for (var i = 0; i < linkages.length; i++) {
      var treeNode = {};
      var left     = linkages[i][0];
      var right    = linkages[i][1];

      if (left  > numNodes) left  = treeNodes[    left  - 1 - numNodes];
      else                  left  = network.nodes[left  - 1];
      if (right > numNodes) right = treeNodes[    right - 1 - numNodes];
      else                  right = network.nodes[right - 1];

      left .parent = treeNode;
      right.parent = treeNode;
      treeNode.children = [left, right];

      treeNodes.push(treeNode);
    }

    network.treeNodes = treeNodes;
  }

  /*
   * Creates a network from the given list of matrices, and 
   * cluster and hierarchy labels for each node. The network
   * edges are defined by the first matrix in the matrix list
   * - any entries in this matrix which are not NaN will be
   * added as an edge in the network. The values in all other
   * matrices will be added as attributes on the corresponding
   * network edge.
   */
  function makeNetwork(matrices, clusters, hier) {

    matrix = matrices[0];

    // A network is just a list of nodes and edges
    var nodes    = [];
    var edges    = [];
    var numNodes = matrix.length;

    // Create a list of nodes
    for (var i = 0; i < numNodes; i++) {

      var node = {};

      // Node label is 1-indexed
      node.index      = i+1;
      node.name       = "" + (i+1);
      node.cluster    = clusters[i];
      node.neighbours = [];
      node.edges      = [];

      nodes.push(node);
    }

    // Create a list of edges. At the same time, we'll 
    // figure out the the max/min values for each weight 
    // matrix across all edges, so they can be used to 
    // scale colour/opacity/etc properly.
    var weightMins = [];
    var weightMaxs = [];
    
    // initialise min/max arrays
    for (var i = 0; i < matrices.length; i++) {
      weightMins.push( Number.MAX_VALUE);
      weightMaxs.push(-Number.MAX_VALUE);
    }

    for (var i = 0; i < numNodes; i++) {
      for (var j = i+1; j < numNodes; j++) {

        if (isNaN(matrix[i][j])) continue;

        var edge     = {};
        edge.i       = nodes[i];
        edge.j       = nodes[j];

        // d3.layout.bundle requires two attributes, 'source' and 'target'.
        edge.source  = nodes[i];
        edge.target  = nodes[j];
        edge.weights = matrices.map(function(mat) {return mat[i][j]; });

        // update weight mins/maxs
        for (var k = 0; k < edge.weights.length; k++) {
          if (edge.weights[k] > weightMaxs[k]) weightMaxs[k] = edge.weights[k];
          if (edge.weights[k] < weightMins[k]) weightMins[k] = edge.weights[k];
        }

        edges              .push(edge);
        nodes[i].neighbours.push(nodes[j]);
        nodes[j].neighbours.push(nodes[i]);
        nodes[i].edges     .push(edge);
        nodes[j].edges     .push(edge);
      }
    }

    // put all the network information 
    // into a dictionary
    var network = {};
    network.nodes       = nodes;
    network.edges       = edges;
    network.weightMins  = weightMins;
    network.weightMaxs  = weightMaxs;

    return network;
  }

  /*
   * Uses d3.dsv to turn a string containing numerical matrix data
   * into a 2D array.
   */
  function parseTextMatrix(matrixText) { 
    // create a parser for space delimited text
    var parser = d3.dsv(" ", "text/plain");
      
    // parse the text data, converting each value to a float
    var matrix = parser.parseRows(matrixText, function(row) {
      row = row.filter(function(value) {return value != ""; } );
      row = row.map(   function(value) {return parseFloat(value);});
      return row;
    });

    return matrix;
  }

  /*
   * Converts all the given text data into numerical matrices,
   * thresholds znet2 matrix and does some other minor tweaks,
   * then passes all the data to the makeNetwork function, and
   * passes the resulting network to the displayFullNetwork 
   * function.
   */
  function onDataLoad(
    error, znet1Data, znet2Data, clusterData, hierData, linkageData) {

    znet1Matrix = parseTextMatrix(znet1Data);
    znet2Matrix = parseTextMatrix(znet2Data);
    clusters    = parseTextMatrix(clusterData)[0];
    hiers       = parseTextMatrix(hierData)   [0];
    linkages    = parseTextMatrix(linkageData)

    // threshold the znet2 matrix
    for (var i = 0; i < znet2Matrix.length; i++) {

      absVals   = znet2Matrix[i].map(function(val) {return Math.abs(val);});
      nodeThres = d3.max(absVals) * 0.75;

      for (var j = 0; j < znet2Matrix.length; j ++) {
        if (Math.abs(znet2Matrix[i][j]) < nodeThres) {
          znet2Matrix[i][j] = Number.NaN;
        }
      }
    }

    // hiers is 1-indexed. Fix this.
    for (var i = 0; i < hiers.length; i++) {
      hiers[i] -= 1;
    }

    // turn the matrix data into a network
    var network = makeNetwork([znet2Matrix, znet1Matrix], clusters, hiers);
    
    // generate a tree of dummy nodes from 
    // the dendrogram in the linkages data
    networkToTree(network, linkages);

    //console.log(znet2Matrix);
    //console.log(znet1Matrix);
    //console.log(clusters);
    //console.log(hiers);
    console.log(network);

    // and display 
    displayFullNetwork(network, "#fullNetwork", "none");
  }

  /*
   * Load all of the network data, and pass it to the onDataLoad
   * function.
   */ 
  queue()
    .defer(d3.text, "/data/Znet1.txt")
    .defer(d3.text, "/data/Znet2.txt")
    .defer(d3.text, "/data/clusters.txt")
    .defer(d3.text, "/data/hier.txt")
    .defer(d3.text, "/data/linkages.txt")
    .await(onDataLoad);

})();
