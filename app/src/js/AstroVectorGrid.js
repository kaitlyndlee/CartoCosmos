import L from "leaflet";
import Protobuf from "./Leaflet.VectorGrid.bundled.min.js";

/**
 * @class AstroVectorGrid
 * @aka L.AstroVectorGrid
 * @extends L.VectorGrid.Protobuf
 *
 * @classdesc
 * Loads vector tiles and adds them to the map as a layer. Adds the ability to click on a point
 * or draw a bounding box to select points.
 *
 * @param {String} url - URL of the server to get the tiles from.
 * @param {Object} options - Options for the vector layer.
 */
export default L.AstroVectorGrid = L.VectorGrid.Protobuf.extend({
  options: {
    interactive: true,
    rendererFactory: L.canvas.tile,
    vectorTileLayerStyles: {
      points_test2: {
        weight: 1,
        fillColor: "red",
        color: "red",
        opacity: 1,
        fillOpacity: 1,
        fill: true,
        radius: 3
      }
    },
    maxZoom: 8,
    noWrap: true,
    getFeatureId: function(feature) {
      feature.properties.id = feature.id;
      return feature.properties.id;
    }
  },

  initialize: function(url, options) {
    this._selectedFeatures = [];

    L.setOptions(this, options);
    L.VectorGrid.Protobuf.prototype.initialize.call(this, url, this.options);
  },

  /**
   * @function AstroVectorGrid.prototype.onAdd
   * @description Adds the vector tiles to the map and adds onclick and ondraw even listeners
   *              to select the points.
   * @param {AstroMap} map - Map to add layers to.
   */
  onAdd: function(map) {
    this._map = map;
    this.on("click", function(e) {
      this.selectFeature(e.layer.properties.id);
    });
    map.on(L.Draw.Event.CREATED, this.selectFeatures, this);

    L.VectorGrid.Protobuf.prototype.onAdd.call(this, map);
  },

  /**
   * @function AstroVectorGrid.prototype.clearSelected
   * @description Resets the style of the points so they look unselected
   *              and clears the selectedFeatures array.
   */
  clearSelected: function() {
    if (this._selectedFeatures.length > 0) {
      for (let i = 0; i < this._selectedFeatures.length; i++) {
        this.resetFeatureStyle(this._selectedFeatures[i]);
      }
    }
    this._selectedFeatures = [];
  },

  /**
   * @function AstroVectorGrid.prototype.selectFeature
   * @description When a point is clicked, clear any previously selected points, remove any drawn
   *              shapes, and change the style of the point clicked to make it selected.
   *              If a shape is clicked twice, reset its style (deselect it).
   * @param {Int} feature - ID of the point to select.
   */
  selectFeature(feature) {
    // Clear selected feature if clicked twice
    if (this._selectedFeatures.indexOf(feature) !== -1) {
      this.clearSelected();
      return;
    }
    // If a shape is drawn, clear that shape before selecting a new point.
    // map fires so that the DrawControl can listen to this event.
    this._map.fire("clearShape");
    this.changeSelectedStyle([feature]);
    console.log(feature);
  },

  /**
   * @function AstroVectorGrid.prototype.changeSelectedStyle
   * @description Clears any previously selected points and
   *              changes the style of the selected points.
   * @param {Array} features - Array of IDs of the points to select.
   */
  changeSelectedStyle: function(features) {
    this.clearSelected();

    for (let i = 0; i < features.length; i++) {
      this._selectedFeatures.push(features[i]);
      this.setFeatureStyle(features[i], {
        weight: 1,
        fillColor: "yellow",
        color: "yellow",
        opacity: 1,
        fillOpacity: 1,
        fill: true,
        radius: 3
      });
    }
  },

  /**
   * @function AstroVectorGrid.prototype.selectFeatures
   * @description Is called when a user draws a bounding box to select multiple points.
   *              Finds the features (points) that are under the boudning box
   *              and updates their styles.
   * @param {L.Dom.Event} event - Ondraw event containg the information about the drawn shape.
   */
  selectFeatures: function(event) {
    let drawnCorners = [event.layer._latlngs[0], event.layer._latlngs[2]];
    let tile;
    let features;
    let latLon;
    let highlightedFeatures = [];

    for (let tileKey in this._vectorTiles) {
      tile = this._vectorTiles[tileKey];
      features = tile._features;

      for (let featureID in features) {
        latLon = this.geometryToLatLon(
          features[featureID].feature._point,
          this.getTileSize(),
          tile._tileCoord
        );
        if (L.latLngBounds(drawnCorners).contains(latLon)) {
          highlightedFeatures.push(featureID);
        }
      }
    }
    this.changeSelectedStyle(highlightedFeatures);
    this._selectedFeatures=highlightedFeatures;
    event.layer.on("click", this.selectedToCSV, this)
    console.log(highlightedFeatures);
  },

  /**
   * @function AstroVectorGrid.prototype.selectedToCSV
   * @description Download selected points to a .csv file.
   *
   */
  selectedToCSV: function(event) {
    let tile;
    let features;
    let fullFeatures = [];

    for (let tileKey in this._vectorTiles) {
      tile = this._vectorTiles[tileKey];
      features = tile._features;

      for (const featureID of this._selectedFeatures) {
        let selectedFeature = features[featureID];
        if (typeof selectedFeature !== "undefined") {
          fullFeatures.push([selectedFeature.feature.properties.id,
                             selectedFeature.feature.properties.sourcefile,
                             selectedFeature.feature._point.x,
                             selectedFeature.feature._point.y
                           ]);
        }
      }
    }
    // Don't send out an empty .csv
    if (fullFeatures.length == 0) {
      return;
    }
    let csvContent = "data:text/csv;charset=utf-8,"
      + fullFeatures.map(e => e.join(",")).join("\n");

    var encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
  },

  /**
   * @function AstroVectorGrid.prototype.geometryToLatLon
   * @description Since the (x, y) coordinates associated with each point are relative to the tile
   *              it is in, convert the coordinates so they are relative to the map image and
   *              then unproject the image point to lat and lon values.
   *
   * @param {Object} geometry - coordinates of the point of the form {x: <value>, y: <value>}.
   * @param {Double} tilesSize - Total number of pixels in a vector tile.
   * @param {Object} tileCoords - coordinates of the tile of the form {x: <value>, y: <value>, z: <value>}.
   * @return {L.Point} Coordiantes of the selected point in lat lon.
   */
  geometryToLatLon: function(geometry, tileSize, tileCoords) {
    let pxPerExtent = tileSize.x / 256.0; // Hardcoded
    let offset = tileCoords.scaleBy(tileSize);

    let point = L.point(
      offset.x + geometry.x * pxPerExtent,
      offset.y + geometry.y * pxPerExtent
    );
    return this._map.unproject(point);
  }
});
