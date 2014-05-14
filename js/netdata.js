/*
 * Load, create, and modify objects representing networks.
 * 
 * Author: Paul McCarthy <pauldmccarthy@gmail.com>
 */
define(["lib/d3", "lib/queue"], function(d3, queue) {

  /*
   * Generates D3 colour (and edge width) scales for the given
   * network, and attaches them as attributes of the given 
   * scaleInfo object.
   *
   * It is assumed that the network object has the following 
   * properties:
   *
   *   - edgeWidthIdx:  Index of the edge weight to be used
   *                    for scaling edge widths.
   *
   *   - edgeColourIdx: Index of the edge weight to be used
   *                    for scaling edge colours.
   *
   *   - nodeColourIdx: Index of the node data to be used for
   *                    scaling node colours.
   *
   * The following attributes are added to the scaleInfo object:
   *
   *   - nodeColourScale:     Colours nodes according to the 
   *                          node data at nodeColourIdx.
   *
   *   - edgeWidthScale:      Scales edge widths according to the edge 
   *                          weight at index edgeWidthIdx.
   *
   *   - defEdgeColourScale:  Colours edges, when not highlighted, 
   *                          according to the edge weight at index 
   *                          edgeColourIdx.
   *
   *   - hltEdgeColourScale:  Colours edges, when highlighted, 
   *                          according to the edge weight at 
   *                          index edgeColourIdx.
   */
  function genColourScales(network, scaleInfo) {
    
    var ewwIdx = scaleInfo.edgeWidthIdx;
    var ecwIdx = scaleInfo.edgeColourIdx;

    // Nodes are coloured according to their node data.
    // TODO handle more than 10 node labels?
    var nodeColourScale = d3.scale.category10();

    var ecMin = network.matrixAbsMins[ecwIdx];
    var ecMax = network.matrixAbsMaxs[ecwIdx];
    var ewMin = network.matrixAbsMins[ewwIdx];
    var ewMax = network.matrixAbsMaxs[ewwIdx];

    // Edge width scale
    var edgeWidthScale = d3.scale.linear()
      .domain([-ewMax, -ewMin, 0, ewMin, ewMax])
      .range( [    15,      2, 0,     2,    15]);

    // Colour scale for highlighted edges
    var hltEdgeColourScale = d3.scale.linear()
      .domain([ -ecMax,    -ecMin,    0,          ecMin,     ecMax  ])
      .range( ["#0000dd", "#ccccdd", "#ffffff", "#ddaaaa", "#dd0000"]);

    // The colour scale for non-highlighted edges
    // is a washed out version of that used for 
    // highlighted edges. Could achieve the same
    // effect with opacity, but avoiding opacity
    // gives better performance.
    var edgeColourHltToDef = d3.scale.linear()
      .domain([0,   255])
      .range( [210, 240]);

    var defEdgeColourScale = function(val) {
      var c = d3.rgb(hltEdgeColourScale(val));
      
      var cols = [c.r,c.g,c.b];
      cols.sort(function(a,b) {return a-b;});

      var ri = cols.indexOf(c.r);
      var gi = cols.indexOf(c.g);
      var bi = cols.indexOf(c.b);

      c.r = Math.ceil(edgeColourHltToDef(cols[ri]));
      c.g = Math.ceil(edgeColourHltToDef(cols[gi]));
      c.b = Math.ceil(edgeColourHltToDef(cols[bi]));

      return c;
    }

    // attach all those scales as attributes 
    // of the provided scaleinfo object
    scaleInfo.nodeColourScale    = nodeColourScale;
    scaleInfo.edgeWidthScale     = edgeWidthScale;
    scaleInfo.defEdgeColourScale = defEdgeColourScale;
    scaleInfo.hltEdgeColourScale = hltEdgeColourScale;

    
    // And attach a bunch of convenience 
    // functions for use in d3 attr calls
    scaleInfo.nodeColour = function(node) {
      return scaleInfo.nodeColourScale(node.nodeData[network.nodeColourIdx]);
    };

    scaleInfo.defEdgeColour = function(edge) {
      return scaleInfo.defEdgeColourScale(
        edge.weights[scaleInfo.edgeColourIdx]);
    };
    
    // The *Path* functions are provided, as 
    // edges are represented as spline paths
    // (see netvis.js)
    scaleInfo.defPathColour = function(path) {
      return scaleInfo.defEdgeColourScale(
        path.edge.weights[scaleInfo.edgeColourIdx]);
    };

    scaleInfo.hltEdgeColour = function(edge) {
      return scaleInfo.hltEdgeColourScale(
        edge.weights[scaleInfo.edgeColourIdx]);
    };

    scaleInfo.hltPathColour = function(path) {
      return scaleInfo.hltEdgeColourScale(
        path.edge.weights[scaleInfo.edgeColourIdx]);
    };
   
    scaleInfo.edgeWidth = function(edge) {
      return scaleInfo.edgeWidthScale(
        edge.weights[sclaeInfo.edgeWidthIdx]);
    };

    scaleInfo.pathWidth = function(path) {
      return scaleInfo.edgeWidthScale(
        path.edge.weights[scaleInfo.edgeWidthIdx]);
    };
  }

  /*
   * Flattens the dendrogram tree for the given network 
   * (see the makeNetworkDendrogramTree function below), 
   * such that it contains at most maxClusters clusters. 
   * This function basically performs the same job as 
   * the MATLAB cluster function, e.g.:
   *
   *   > cluster(linkages, 'maxclust', maxClusters)
   */
  function flattenDendrogramTree(network, maxClusters) {

    // Returns a list of tree nodes which contain leaf 
    // nodes - the current 'clusters' in the tree.
    function getClusters() {

      var allClusts  = network.nodes.map(function(node) {return node.parent;});
      var uniqClusts = [];

      for (var i = 0; i < allClusts.length; i++) {
        if (uniqClusts.indexOf(allClusts[i]) > -1) continue;
        uniqClusts.push(allClusts[i]);
      }

      return uniqClusts;
    }

    // Iterate through the list of clusters, 
    // merging them  one by one, until we are 
    // left with (at most) maxClusters.
    var clusters = getClusters();

    while (clusters.length > maxClusters) {

      // Identify the cluster with the minimum 
      // distance  between its children
      distances = clusters.map(function(clust) {return clust.distance;});
      minIdx    = distances.indexOf(d3.min(distances));

      clust         = clusters[minIdx];
      parent        = clust.parent;
      children      = clust.children;
      clustChildIdx = parent.children.indexOf(clust);
      clustTreeIdx  = network.treeNodes.indexOf(clust);
      
      // Squeeze that cluster node out of the 
      // tree, by attaching its children to its 
      // parent and vice versa.
      parent .children .splice(clustChildIdx, 1);
      network.treeNodes.splice(clustTreeIdx,  1);

      children.forEach(function(child) {
        child.parent = parent;
        parent.children.push(child);
      });

      // Update the cluster list
      clusters = getClusters();
    }
  }

  /*
   * Given a network (see the createNetwork function), and the 
   * output of a call to the MATLAB linkage function which 
   * describes the dendrogram of clusters of the network 
   * nodes, this function creates a list of 'dummy' nodes 
   * which represent the dendrogram tree. This list is added 
   * as an attribute called 'treeNodes' of the provided 
   * network.
   */
  function makeNetworkDendrogramTree(network, linkages) {

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
      treeNode.distance = linkages[i][2];
      treeNode.index = i + numNodes;

      treeNodes.push(treeNode);
    }

    network.treeNodes = treeNodes;
  }

  /*
   * Extracts and returns a sub-matrix from the given
   * parent matrix, containing the data at the indices
   * in the specified index array.
   */
  function extractSubMatrix(matrix, indices) {
    var submat = [];

    for (var i = 0; i < indices.length; i++) {

      var row = [];
      for (var j = 0; j < indices.length; j++) {

        row.push(matrix[indices[i]][indices[j]]);
      }
      submat.push(row);
    }

    return submat;
  }

  /*
   * Extracts and returns a subnetwork from the given network, 
   * consisting of the node at the specified index, all of the 
   * neighbours of that node, and all of the edges between 
   * them.
   */
  function extractSubNetwork(network, rootIdx) {

    var oldRoot  = network.nodes[rootIdx];

    // Create a list of node indices, in the parent 
    // network, of all nodes to be included in the 
    // subnetwork
    var nodeIdxs = [rootIdx];

    for (var i = 0; i < oldRoot.neighbours.length; i++) {
      nodeIdxs.push(oldRoot.neighbours[i].index);
    }
    nodeIdxs.sort(function(a,b){return a-b;});

    // Create a bunch of sub-matrices containing 
    // the data for the above list of nodes
    var subMatrices = network.matrices.map(
      function(matrix) {return extractSubMatrix(matrix, nodeIdxs);});

    // create a bunch of node data arrays 
    // from the original network node data
    var subNodeData = network.nodeData.map(function(array) {
      return nodeIdxs.map(function(idx) {
        return array[idx];
      });
    });

    var subnet = createNetwork(
      subMatrices, 
      network.matrixLabels, 
      subNodeData,
      network.nodeDataLabels,
      null,
      network.thumbUrl,
      network.thresholdFunc,
      network.thresholdValueLabels,
      network.thresholdValues,
      network.thresholdIdx,
      1);

    // Fix node names and thumbnails, and add 
    // indices for each subnetwork node back 
    // to the corresponding parent network node
    var zerofmt = d3.format("04d");
    for (var i = 0; i < subnet.nodes.length; i++) {

      var node = subnet.nodes[i];

      node.name         = network.nodes[nodeIdxs[i]].name;
      node.fullNetIndex = network.nodes[nodeIdxs[i]].index;

      if (subnet.thumbUrl !== null) {
        var imgurl = network.thumbUrl + "/" + zerofmt(nodeIdxs[i]) + ".png";
        node.thumbnail = imgurl;
      }
    }

    // Create a dummy dendrogram with a single cluster
    var root = {};
    root.index    = subnet.nodes.length;
    root.children = subnet.nodes;
    subnet.nodes.forEach(function(node) {node.parent = root;});
    subnet.treeNodes = [root];

    // save a reference to the parent network
    // subnet.parentNetwork = network;

    return subnet;
  }

  /*
   * Creates a tree representing the dendrogram specified 
   * in the linkage data provided when the network was loaded, 
   * and flattens the tree so that it contains (at most) the 
   * specified number of clusters. If there was no linkage 
   * data specified when the network was load, this function 
   * does nothing.
   */
  function setNumClusters(network, numClusts) {

    if (network.linkage === null) return;

    // generate a tree of dummy nodes from 
    // the dendrogram in the linkages data
    makeNetworkDendrogramTree(network, network.linkage);

    // flatten the tree to the specified number of clusters
    flattenDendrogramTree(network, numClusts);
    network.numClusters = numClusts;
  }

  /*
   * Creates a list of edges for the given network. 
   * The network edges are defined by  the matrix at 
   * network.matrices[network.thresholdIdx].  The 
   * values in all matrices (including the one just 
   * mentioned) are added as 'weight' attributes 
   * on the corresponding network edge.
   */
  function thresholdNetwork(network) {

    var matrix   = network.matrices[network.thresholdIdx];
    var numNodes = network.nodes.length;

    // Create a list of edges. At the same time, we'll 
    // figure out the real and absolute max/min values 
    // for each weight matrix across all edges, so they 
    // can be used to scale edge colour/width/etc properly.
    network.edges     = [];
    var matrixMins    = [];
    var matrixMaxs    = [];
    var matrixAbsMins = [];
    var matrixAbsMaxs = [];

    // threshold the matrix
    matrix = network.thresholdFunc(matrix, network.thresholdValues);
    
    // initialise min/max arrays
    for (var i = 0; i < network.matrices.length; i++) {
      matrixMins   .push( Number.MAX_VALUE);
      matrixMaxs   .push(-Number.MAX_VALUE);
      matrixAbsMins.push( Number.MAX_VALUE);
      matrixAbsMaxs.push(-Number.MAX_VALUE);
    }

    // initialise node neighbour/edge arrays
    for (var i = 0; i < numNodes; i++) {
      network.nodes[i].edges      = [];
      network.nodes[i].neighbours = [];
    }

    for (var i = 0; i < numNodes; i++) {
      for (var j = i+1; j < numNodes; j++) {

        // NaN values in the matrix
        // are not added as edges
        if (isNaN(matrix[i][j])) continue;

        var edge     = {};
        edge.i       = network.nodes[i];
        edge.j       = network.nodes[j];

        // d3.layout.bundle and d3.layout.force require two 
        // attributes, 'source' and 'target', so we add them 
        // here, purely for  convenience.
        edge.source  = network.nodes[i];
        edge.target  = network.nodes[j];
        edge.weights = network.matrices.map(function(mat) {return mat[i][j];});

        network.edges.push(edge);
        network.nodes[i].neighbours.push(network.nodes[j]);
        network.nodes[j].neighbours.push(network.nodes[i]);
        network.nodes[i].edges     .push(edge);
        network.nodes[j].edges     .push(edge);

        // update weight mins/maxs
        for (var k = 0; k < edge.weights.length; k++) {

          var w  =          edge.weights[k];
          var aw = Math.abs(edge.weights[k]);

          if (w  > matrixMaxs[k])    matrixMaxs[k]    = w;
          if (w  < matrixMins[k])    matrixMins[k]    = w;
          if (aw > matrixAbsMaxs[k]) matrixAbsMaxs[k] = aw;
          if (aw < matrixAbsMins[k]) matrixAbsMins[k] = aw;
        }
      }
    }

    network.matrixMins    = matrixMins;
    network.matrixMaxs    = matrixMaxs;
    network.matrixAbsMins = matrixAbsMins;
    network.matrixAbsMaxs = matrixAbsMaxs;
  }

  /*
   * Creates a network from the given data.
   */
  function createNetwork(
    matrices,
    matrixLabels,
    nodeData,
    nodeDataLabels,
    linkage,
    thumbUrl,
    thresholdFunc,
    thresholdValues,
    thresholdValueLabels,
    thresholdIdx,
    numClusters) {

    var network  = {};
    var nodes    = [];
    var numNodes = matrices[0].length;
    var zerofmt  = d3.format("04d");

    // Create a list of nodes
    for (var i = 0; i < numNodes; i++) {

      var node = {};

      // Node name is 1-indexed
      node.index      = i;
      node.name       = "" + (i+1);
      node.nodeData   = nodeData.map(function(array) {return array[i];});

      // Attach a thumbnail URL to 
      // every node in the network
      if (thumbUrl !== null) {
        var imgUrl = thumbUrl + "/" + zerofmt(i) + ".png";
        node.thumbnail = imgUrl;
      }
      else {
        node.thumbnail = null;
      }

      nodes.push(node);
    }

    network.nodes                = nodes;
    network.nodeData             = nodeData;
    network.nodeDataLabels       = nodeDataLabels;
    network.matrices             = matrices;
    network.matrixLabels         = matrixLabels;
    network.linkage              = linkage;
    network.thumbUrl             = thumbUrl;
    network.thresholdFunc        = thresholdFunc;
    network.thresholdValues      = thresholdValues;
    network.thresholdValueLabels = thresholdValueLabels;
    network.thresholdIdx         = thresholdIdx;
    network.numClusters          = numClusters;

    // create the network edges
    thresholdNetwork(network);

    // Create a dendrogram, and flatten it 
    // to the specified number of clusters.
    // This will do nothing if this network
    // has no linkage data.
    setNumClusters(network, numClusters);

    // create scale information for 
    // colouring/scaling nodes and edges
    var scaleInfo = {};
    scaleInfo.edgeWidthIdx  = 0;
    scaleInfo.edgeColourIdx = 0;
    scaleInfo.nodeColourIdx = 0;

    genColourScales(network, scaleInfo);
    network.scaleInfo = scaleInfo;

    console.log(network);

    return network;
  }

  /* 
   * Sets the matrix data used to scale edge widths
   * to the matrix at the specified index.
   */
  function setEdgeWidthIdx(network, idx) {

    if (idx < 0 || idx >= network.matrices.length) {
      throw "Matrix index out of range.";
    } 

    network.scaleInfo.edgeWidthIdx = idx;
    genColourScales(network, network.scaleInfo);
  }

  /* 
   * Sets the matrix data used to colour edges
   * to the matrix at the specified index.
   */
  function setEdgeColourIdx(network, idx) {

    if (idx < 0 || idx >= network.matrices.length) {
      throw "Matrix index out of range.";
    } 

    network.scaleInfo.edgeColourIdx = idx;
    genColourScales(network, network.scaleInfo);
  }

  /* 
   * Sets the node data used to colour nodes 
   * to the node data at the specified data index.
   */
  function setNodeColourIdx(network, idx) {
    if (idx < 0 || idx >= network.nodeDataLabels.length) {
      throw "Node data index out of range."
    }
    network.nodeColourIdx = idx;
    genColourScales(network, network.scaleInfo);
  }

  /*
   * Sets the matrix used to threshold the network to the 
   * matrix at the specified index, and re-thresholds the 
   * network.
   */
  function setThresholdMatrix(network, idx) {

    if (idx < 0 || idx >= network.matrices.length) {
      throw "Matrix index out of range.";
    } 

    network.thresholdIdx = idx;

    // this forces re-thresholding, and all 
    // the other stuff that needs to be done 
    setThresholdValue(network, 0, network.thresholdValues[0]);
  }

  /*
   * Sets the value for the threshold function argument at 
   * the given index, and re-thresholds the network.
   */
  function setThresholdValue(network, idx, value) {

    if (idx < 0 || idx >= network.thresholdValues.length) {
      throw "Threshold value index out of range.";
    }

    network.thresholdValues[idx] = value;
    thresholdNetwork(network);

    // force recreation of dendrogram and of colour scales
    setNumClusters(  network, network.numClusters);
    genColourScales( network, network.scaleInfo);
  }

  /*
   *
   */
  function onDataLoad(error, args) {

    // TODO handle error

    var stdArgs        = args[0];
    var nodeDataLabels = stdArgs.nodeDataLabels;
    var matrixLabels   = stdArgs.matrixLabels;
    var thumbUrl       = stdArgs.thumbnails;
    var thresFunc      = stdArgs.thresFunc;
    var thresVals      = stdArgs.thresVals;
    var thresLabels    = stdArgs.thresLabels;
    var onLoadFunc     = stdArgs.onLoadFunc;

    var linkage      = args[1];

    var numNodeData = nodeDataLabels.length;
    var numMatrices = matrixLabels  .length;

    var nodeData = args.slice(2,               2 + numNodeData);
    var matrices = args.slice(2 + numNodeData, 2 + numNodeData + numMatrices);

    if (linkage !== null) 
      linkage = parseTextMatrix(linkage);
    
    matrices = matrices.map(parseTextMatrix);
    nodeData = nodeData.map(parseTextMatrix);

    // node data should be 1D arrays
    nodeData = nodeData.map(function(array) {return array[0];});

    // check all data arrays to ensure 
    // they are of compatible lengths
    var numNodes = matrices[0].length;

    matrices.forEach(function(matrix, i) {
      var errorMsg =  "Matrix " + matrixLabels[i] + " has invalid size ";
      
      // number of rows
      if (matrix.length != numNodes) {
        console.log(matrix);
        throw errorMsg + "(num rows: " + matrix.length + ")";
      }

      // number of columns in each row
      matrix.forEach(function(row) {
        if (row.length != numNodes) {
          console.log(row);
          throw errorMsg + "(column length " + row.length + ")";
        }
      });
    });

    // node data arrays
    nodeData.forEach(function(array, i) {
      if (array.length != numNodes) {
        console.log(array);
        throw "Node data array " + nodeDataLabels[i] + 
              " has invalid length (" + array.length + ")";
      }
    });

    network = createNetwork(
      matrices, 
      matrixLabels, 
      nodeData,
      nodeDataLabels, 
      linkage, 
      thumbUrl,
      thresFunc,
      thresVals,
      thresLabels,
      0,
      1);

    onLoadFunc(network);
  }

  /*
   *
   */
  function loadNetwork(args, onLoadFunc) {

    var matrixUrls     = args.matrices;
    var matrixLabels   = args.matrixLabels;
    var nodeDataUrls   = args.nodeData;
    var nodeDataLabels = args.nodeDataLabels;
    var linkageUrl     = args.linkage;
    var thumbUrl       = args.thumbnails;
    var thresFunc      = args.thresFunc;
    var thresVals      = args.thresVals;
    var thresLabels    = args.thresLabels;

    args.onLoadFunc = onLoadFunc;

    if (matrixUrls.length !== matrixLabels.length) {
      throw "Matrix URL and label lengths do not match";
    }

    if (nodeDataUrls.length !== nodeDataLabels.length) {
      throw "Node data URL and label lengths do not match";
    }

    if (thresVals.length !== thresLabels.length) {
      throw "Threshold value and label lengths do not match";
    }

    // The qId function is an identity function 
    // which may be used to pass standard 
    // arguments (i.e. arguments which are not 
    // the result of an asychronous load) to the 
    // await/awaitAll functions.
    function qId(arg, cb) {cb(null, arg);}

    // Load all of the network data, and 
    // pass it to the onDataLoad function. 
    var q = queue();

    // standard arguments
    q = q.defer(qId, args);
    
    // linkage data
    if (linkageUrl) q = q.defer(d3.text, linkageUrl);
    else            q = q.defer(qId,     null);

    // node data
    nodeDataUrls.forEach(function(url) {
      q = q.defer(d3.text, url);
    });

    // matrix data
    matrixUrls.forEach(function(url) {
      q = q.defer(d3.text, url);
    });

    // load all the things!
    q.awaitAll(onDataLoad);
  }

  /*
   * Uses d3.dsv to turn a string containing 
   * numerical matrix data into a 2D array.
   */
  function parseTextMatrix(matrixText) { 

    // create a parser for space delimited text
    var parser = d3.dsv(" ", "text/plain");
      
    // parse the text data, converting each value to 
    // a float and ignoring any extraneous whitespace
    // around or between values.
    var matrix = parser.parseRows(matrixText, function(row) {
      row = row.filter(function(value) {return value != ""; } );
      row = row.map(   function(value) {return parseFloat(value);});
      return row;
    });

    return matrix;
  }


  var netdata                = {};
  netdata.loadNetwork        = loadNetwork;
  netdata.extractSubNetwork  = extractSubNetwork;
  netdata.setNumClusters     = setNumClusters;
  netdata.setEdgeWidthIdx    = setEdgeWidthIdx;
  netdata.setEdgeColourIdx   = setEdgeColourIdx;
  netdata.setNodeColourIdx   = setNodeColourIdx;
  netdata.setThresholdMatrix = setThresholdMatrix;
  netdata.setThresholdValue  = setThresholdValue;
  return netdata;
});
