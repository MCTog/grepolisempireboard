var WMap = {
  scroll_int : 0,
  chunkSize : 20,
  scrolled : false,
  xSize : null,
  ySize : null,
  island_id : null,
  elm : {},
  position_tile_offset : {},
  town_position : {},
  nice_browser : null,
  color_table_open : false,
  map_arrow_type : '',
  initialize : function(data, islands, current_position, map_size, chunc_size,
      own_town_position, map_arrow_type) {
    this.elm = {
      'mover' : $('#map_mover'),
      'marker' : $('#map_marker'),
      'wrapper' : $('#map_wrapper'),
      'move_container' : $('#map_move_container'),
      'coord_popup' : $('#mouse_coordinate_popup'),
      'town_d' : $('#town_direction')
    };
    this.elm.mover.unselectable();
    var town_id = document.location.search.match(/target_town_id=([0-9]+)/), focussed_town_id = null != town_id ? town_id[1]
        : null;
    this.mapData = new MapData(data);
    this.mapTiles = MapTiles;
    this.xSize = parseInt(this.elm.wrapper.css('width'));
    this.ySize = parseInt(this.elm.wrapper.css('height'));
    this.mapTiles.initialize(this.mapData, this.xSize, this.ySize, islands,
        map_size, focussed_town_id);
    this.position_tile_offset = {
      x : Math.round(this.xSize / (this.mapTiles.tileSize.x)),
      y : Math.round(this.ySize / (this.mapTiles.tileSize.y * 2))
    }
    this.scrollBorder = this.mapTiles.getScrollBorder();
    this.island_id = current_position.island_id;
    this.handler = {};
    this.handler.mouseup = function(e) {
      return WMap.handlerUp(e);
    };
    this.handler.mousemove = function(e) {
      return WMap.handlerMouseMove(e);
    };
    this.elm.mover.mousedown(function(e) {
      return WMap.handlerDown(e);
    });
    this.scrollMapToPos(current_position.x, current_position.y, false);
    this.handler.mouseMovePositionPopup = function(e) {
      return WMap.mouseMovePositionPopup(e)
    };
    var obj = this.elm.mover[0];
    try {
      if (obj.setCapture && obj.attachEvent) {
        obj.attachEvent('onmousemove', this.handler.mouseMovePositionPopup);
      } else {
        document.addEventListener('mousemove',
            this.handler.mouseMovePositionPopup, true);
      }
    } catch (e) {
    }
    this.town_position = own_town_position;
    this.town_id = this.town_position.id;
    var town_tile = function() {
      var x, y, precise;
      if (ele = document.getElementById('town_' + WMap.town_id)) {
        x = ele.style.left, y = ele.style.top, precise = true;
      } else {
        var tmp = MapTiles
            .map2Pixel(WMap.town_position.x, WMap.town_position.y);
        x = tmp.x, y = tmp.y;
      }
      return {
        'x' : x,
        'y' : y,
        'precise' : precise
      };
    }.call();
    this.town_position.x_px = parseInt(town_tile.x) + 45;
    this.town_position.y_px = parseInt(town_tile.y) + 35;
    this.town_position.precise = town_tile.precise;
    $('.map_jump_to_current_town_button').mousePopup(
        new MousePopup("zur aktuellen Stadt springen"));
    this.map_arrow_type = map_arrow_type;
    this.determineRenderMode();
    $('#toggle_color_table').mousePopup(new MousePopup('Farbzuweisungen'));
  },
  handlerDown : function(event) {
    if (event.target != this.elm.mover[0]) {
      return;
    }
    this.last_move_x = this.last_move_y = 0;
    var obj = this.elm.mover[0];
    if (obj.setCapture && obj.detachEvent) {
      obj.setCapture();
      obj.detachEvent('onmousemove', this.handler.mouseMovePositionPopup);
      obj.attachEvent('onmousemove', this.handler.mousemove);
      obj.attachEvent('onmouseup', this.handler.mouseup);
      obj.attachEvent('onlosecapture', this.handler.mouseup);
    } else {
      document.removeEventListener('mousemove',
          this.handler.mouseMovePositionPopup, true);
      document.addEventListener('mousemove', this.handler.mousemove, true);
      document.addEventListener('mouseup', this.handler.mouseup, true);
    }
    this.elm.coord_popup.hide();
    this.clearMarker();
    this.mousemove(event);
    event.preventDefault();
  },
  handlerUp : function(e) {
    var obj = this.elm.mover[0];
    if (obj.releaseCapture && obj.detachEvent) {
      obj.detachEvent('onlosecapture', this.handler.mouseup);
      obj.detachEvent('onmouseup', this.handler.mouseup);
      obj.detachEvent('onmousemove', this.handler.mousemove);
      obj.attachEvent('onmousemove', this.handler.mouseMovePositionPopup, true);
      obj.releaseCapture();
    } else {
      document.removeEventListener('mouseup', this.handler.mouseup, true);
      document.addEventListener('mousemove',
          this.handler.mouseMovePositionPopup, true);
      document.removeEventListener('mousemove', this.handler.mousemove, true);
    }
    this.mapTiles.updateTownsForCurrentPosition();
    this.mapTiles.recreate();
    this.recalcMarker();
    this.elm.coord_popup.show();
    this.mouseMovePositionPopup(e);
    if (!this.town_position.precise) {
      if (ele = document.getElementById('town_' + this.town_id)) {
        this.town_position.x_px = parseInt(ele.style.left) + 45;
        this.town_position.y_px = parseInt(ele.style.top) + 35;
        this.town_position.precise = true;
      }
    }
  },
  handlerMouseMove : function(e) {
    this.mousemove(e);
  },
  mousemove : function(event, reset_last_move) {
    this.scrolled = true;
    if (this.last_move_x === 0 && this.last_move_y === 0
        && (reset_last_move === undefined || reset_last_move === true)) {
      this.last_move_x = event.clientX;
      this.last_move_y = event.clientY;
    }
    var diff = {
      x : event.clientX - this.last_move_x,
      y : event.clientY - this.last_move_y
    };
    this.last_move_x += diff.x;
    this.last_move_y += diff.y;
    this.setScroll(this.scroll.x - diff.x * 2, this.scroll.y - diff.y * 2);
    var map = this.mapTiles.pixel2Map(this.scroll.x, this.scroll.y);
    this.mapX = map.x;
    this.mapY = map.y;
    this.updateMapCoordInfo(map.x, map.y);
    while (this.mapX != this.mapTiles.tile.x) {
      var colMoveValue = this.mapX < this.mapTiles.tile.x ? 1 : -1;
      this.mapTiles.colMove(colMoveValue);
    }
    while (this.mapY != this.mapTiles.tile.y) {
      var rowMoveValue = this.mapY < this.mapTiles.tile.y ? 1 : -1;
      this.mapTiles.rowMove(rowMoveValue);
    }
    this.setMoveContainerPos(-this.scroll.x, -this.scroll.y);
    return false;
  },
  mouseMovePositionPopup : function(event) {
    var map_pixel_offset = this.elm.mover.offset();
    var mouse_pixel_coordinate = {
      x : (window.scrollX ? window.scrollX : 0) + event.clientX
          - map_pixel_offset.left,
      y : (window.scrollY ? window.scrollY : 0) + event.clientY
          - map_pixel_offset.top
    };
    var mouse_map_coordinate = this.mapTiles.pixel2Map(
        mouse_pixel_coordinate.x + 2, mouse_pixel_coordinate.y + 2);
    mouse_map_coordinate.x += this.mapX;
    mouse_map_coordinate.y += this.mapY;
    var delta_x = mouse_pixel_coordinate.x
        - this.elm.move_container.position().left - this.town_position.x_px;
    var delta_y = mouse_pixel_coordinate.y
        - this.elm.move_container.position().top - this.town_position.y_px;
    var rad = -Math.atan2(delta_x, delta_y) - Math.PI / 2;
    var grad = (isNaN(rad) == false) ? Math.round((rad * 180 / Math.PI)) : NaN;
    var distance = Math.round(Math.sqrt(Math.pow(delta_x, 2)
        + Math.pow(delta_y, 2)) * 10) / 10;
    var speed = MapDuration.speed;
    var duration_readable;
    if (speed > 0) {
      var duration_seconds = Math.round((distance * 50) / speed);
      duration_seconds += MapDuration.duration_offset;
      duration_readable = readableSeconds(duration_seconds);
    } else {
      duration_readable = '--';
    }
    $('#map_duration').html('<span>' + duration_readable + '</span>');
    if (this.map_arrow_type == 'none') {
      this.elm.coord_popup.hide();
    } else {
      var rotate = '';
      var scale = '';
      var close_to_town = distance < 45;
      if (this.nice_browser && this.map_arrow_type == 'modern') {
        if (!close_to_town) {
          rotate = this.prefix + '-transform:translate(34px,38px) rotate('
              + grad + 'deg)translate(60px,0);';
        } else {
          rotate = 'display:none;';
        }
        scale = this.prefix + '-transform:scale(1,0.5);';
        this.elm.town_d.attr('style', rotate);
        this.elm.coord_popup.attr('style', scale + 'left:'
            + (mouse_pixel_coordinate.x - 50) + 'px;top:'
            + (mouse_pixel_coordinate.y - 50) + 'px;');
      } else if (!this.fixed_direction && this.map_arrow_type == 'modern') {
        this.sin = Math.sin(rad), this.cos = Math.cos(rad);
        if (!close_to_town) {
          this.elm.town_d[0].filters.item(0).M11 = this.cos;
          this.elm.town_d[0].filters.item(0).M12 = -this.sin;
          this.elm.town_d[0].filters.item(0).M21 = this.sin;
          this.elm.town_d[0].filters.item(0).M22 = this.cos;
        }
        this.elm.coord_popup.css({
          left : (mouse_pixel_coordinate.x - 50),
          top : (mouse_pixel_coordinate.y - 50)
        });
        this.elm.coord_popup[0].filters.item(0).M11 = 1;
        this.elm.coord_popup[0].filters.item(0).M12 = 0;
        this.elm.coord_popup[0].filters.item(0).M21 = 0;
        this.elm.coord_popup[0].filters.item(0).M22 = 0.5;
        var x_cmp = ~~((this.cos * this.t_off_x) - (this.sin * this.t_off_y)
            + 70 - (this.elm.town_d.width() >> 1)), y_cmp = ~~((this.sin * this.t_off_x)
            + (this.cos * this.t_off_y) + 70 - (this.elm.town_d.height() >> 1));
        this.elm.town_d_wrapper.attr('style', 'left:' + x_cmp + 'px;top:'
            + y_cmp + 'px;' + (close_to_town ? 'display:none;' : ''));
      } else {
        this.d = this.d || 'f00';
        grad += 270;
        if (22.5 <= grad && grad < 67.5) {
          this.d = 'sw';
        } else if (337.5 <= grad || grad < 22.5) {
          this.d = 's';
        } else if (292.5 <= grad && grad < 337.5) {
          this.d = 'se';
        } else if (247.5 <= grad && grad < 292.5) {
          this.d = 'e';
        } else if (202.5 <= grad && grad < 247.5) {
          this.d = 'ne';
        } else if (157.5 <= grad && grad < 202.5) {
          this.d = 'n';
        } else if (112.5 <= grad && grad < 157.5) {
          this.d = 'nw';
        } else if (67.5 <= grad && grad < 112.5) {
          this.d = 'w';
        }
        if (!this.elm.coord_popup.hasClass(this.d)) {
          this.elm.coord_popup.attr('class', this.d);
        }
        this.elm.coord_popup.attr('style', 'left:'
            + (mouse_pixel_coordinate.x - 50) + 'px;top:'
            + (mouse_pixel_coordinate.y - 25) + 'px;');
      }
    }
  },
  determineRenderMode : function() {
    var version = $.browser.version;
    this.nice_browser = false;
    this.prefix = '';
    if ($.browser.mozilla && version >= '1.9.1') {
      this.prefix = '-moz';
      this.nice_browser = true;
    } else if ($.browser.webkit && version >= '525') {
      this.prefix = '-webkit';
      this.nice_browser = true;
    } else if ($.browser.opera && parseFloat(version) >= parseFloat('10.5')) {
      this.prefix = '-o';
      this.nice_browser = true;
    } else if ($.browser.msie && version >= '7') {
      this.sin = null, this.cos = null;
      this.t_off_x = 60;
      this.t_off_y = 0;
      this.elm.coord_popup.addClass('ie');
      this.elm.town_d_wrapper = $('#town_direction_wrapper');
      this.elm.town_d[0].style.filter = 'progid:DXImageTransform.Microsoft.Matrix(FilterType="bilinear", sizingMethod="auto expand",M11 = '
          + this.cos
          + ', M12 = '
          + (-this.sin)
          + ', M21 = '
          + this.sin
          + ', M22 = ' + this.cos + ');';
      this.elm.coord_popup[0].style.filter = 'progid:DXImageTransform.Microsoft.Matrix(FilterType="bilinear", sizingMethod="auto expand",M11 = 1, M12 = 0, M21 = 0, M22 = 0.5);';
      this.handlerUp({
        clientX : 0,
        clientY : 0
      });
    } else {
      this.elm.coord_popup.empty().attr('id', 'mouse_coordinate_popup_fixed');
      this.fixed_direction = true;
    }
    if (this.map_arrow_type == 'fallback') {
      $('#town_direction_wrapper').hide();
      this.elm.coord_popup.attr('id', 'mouse_coordinate_popup_fixed');
    }
  },
  setMoveContainerPos : function(left, top) {
    left -= this.mapTiles.tileSize.x;
    top -= this.mapTiles.tileSize.y;
    if (window.opera) {
      left = left - this.mapTiles.cssOffset.x;
      top = top - this.mapTiles.cssOffset.y;
      while (left > 20000) {
        left -= 20000;
        this.mapTiles.cssOffset.x += 20000;
        this.mapTiles.setAllTilePixel();
      }
      while (left < -20000) {
        left += 20000;
        this.mapTiles.cssOffset.x -= 20000;
        this.mapTiles.setAllTilePixel();
      }
      while (top > 20000) {
        top -= 20000;
        this.mapTiles.cssOffset.y += 20000;
        this.mapTiles.setAllTilePixel();
      }
      while (top < -20000) {
        top += 20000;
        this.mapTiles.cssOffset.y -= 20000;
        this.mapTiles.setAllTilePixel();
      }
    }
    this.elm.move_container[0].style.left = left + 'px';
    this.elm.move_container[0].style.top = top + 'px';
  },
  setScroll : function(x, y) {
    this.scroll.x = bound(x, this.scrollBorder.xMin, this.scrollBorder.xMax);
    this.scroll.y = bound(y, this.scrollBorder.yMin, this.scrollBorder.yMax);
  },
  setPosition : function(pos) {
    this.mapX = pos.x - 1;
    this.mapY = pos.y - 1;
    this.updateMapCoordInfo(this.mapX, this.mapY);
    this.mapTiles.tile = {
      x : this.mapX,
      y : this.mapY
    };
    var pixel = this.mapTiles.map2Pixel(this.mapX, this.mapY);
    var offset = {
      'x' : 0,
      'y' : 0
    }, island_width_in_tiles = this.mapTiles.islands[this.island_id].width, island_width_in_pixels = island_width_in_tiles
        * this.mapTiles.tileSize.x / 2, island_offset_x = this.mapTiles.islands[this.island_id].centering_offset_x, island_offset_y = this.mapTiles.islands[this.island_id].centering_offset_y;
    offset.x = (this.xSize / 2 - island_width_in_pixels / 2)
        + (this.mapTiles.tileSize.x / 4) - island_offset_x;
    offset.x = Math.min(offset.x, this.mapTiles.tileSize.x / 2);
    offset.y = -island_offset_y;
    if (pos.x % 2 == 1) {
      offset.y -= this.mapTiles.tileSize.y;
    }
    pixel.x -= offset.x;
    pixel.y -= offset.y;
    this.setMoveContainerPos(-pixel.x, -pixel.y);
    this.scroll = {
      x : pixel.x,
      y : pixel.y
    };
    this.mapTiles.updateTownsForCurrentPosition();
    this.mapTiles.recreate();
    this.recalcMarker();
  },
  toChunk : function(x, y) {
    var chunk = {
      x : parseInt(x / this.chunkSize),
      y : parseInt(y / this.chunkSize)
    };
    var rel = {
      x : x % this.chunkSize,
      y : y % this.chunkSize
    };
    return {
      chunk : chunk,
      rel : rel
    };
  },
  scrollMapToPos : function(x, y, check_reload) {
    if (false !== check_reload) {
      this.mapData.checkReload(x, y, this.chunkSize, this.chunkSize,
          function() {
            this.setPosition({
              x : x,
              y : y
            });
          }.bind(this, x, y));
    } else {
      this.setPosition({
        x : x,
        y : y
      });
    }
    this.last_move_x = this.last_move_y = 0;
  },
  clearMarker : function() {
    this.elm.marker[0].innerHTML = '';
    this.elm.marker[0].innerText = '';
  },
  recalcMarker : function() {
    var town, html, towns = this.mapData.getTowns(this.mapTiles.tile.x,
        this.mapTiles.tile.y, this.mapTiles.tileCount.x,
        this.mapTiles.tileCount.y);
    for ( var i in towns) {
      town = towns[i];
      var pixel = this.mapTiles.map2Pixel(town.x, town.y), coords = {
        x : Math.round(pixel.x - this.scroll.x - this.mapTiles.tileSize.x
            + town.offset_x + 42),
        y : pixel.y - this.scroll.y - this.mapTiles.tileSize.y + town.offset_y
            + 35,
        radius : 32
      };
      if ((coords.x + coords.radius < 0) || (coords.y + coords.radius < 0)
          || (coords.x - coords.radius > this.xSize)
          || (coords.y - coords.radius > this.ySize)) {
        continue;
      }
      var town_type = this.getTownType(town);
      if (town.popup === undefined) {
        if (town_type == 'town') {
          html = '<h4>'
              + town.name
              + '</h4>'
              + '<table class="popup_table_inside">'
              + '<tr><td>'
              + '<img src="http://static.grepolis.com/images/game/temp/player.png" />'
              + '</td><td>'
              + town.player_name
              + '</td></tr>'
              + '<tr><td>'
              + '<img src="http://static.grepolis.com/images/game/temp/points.png" />'
              + '</td><td>'
              + ngettext('%1 Punkt', new Array('%1 Punkte'), town.points)
                  .replace('%1', town.points) + '</td></tr>';
          if (town.alliance_name != null) {
            html += '<tr><td>'
                + '<img src="http://static.grepolis.com/images/game/temp/ally.png" />'
                + '</td><td>' + town.alliance_name + '</td></tr>';
          }
          html += '</table>';
        } else if (town_type == 'farm_town') {
          if (town.mood !== undefined) {
            html = '<h4>'
                + town.name
                + '</h4>'
                + '<table class="popup_table_inside">'
                + '<tr><td>'
                + '<img src="http://static.grepolis.com/images/game/towninfo/mood.png" />'
                + '</td><td>'
                + ('%1% Stimmung'.replace('%1', town.mood))
                + '</td></tr>'
                + '<tr><td>'
                + '<img src="http://static.grepolis.com/images/game/towninfo/strength.png" />'
                + '</td><td>' + ('%1% Stärke'.replace('%1', town.strength))
                + '</td></tr>' + '<tr><td colspan=2>'
                + '<span class="resource_' + town.demand
                + '_icon"></span><span class="popup_ratio">' + ' 1:'
                + town.ratio + '</span><span class="resource_' + town.offer
                + '_icon"></span></td></tr>' + '</table>';
          } else {
            html = null;
          }
        } else {
          html = 'Hier kannst du eine Stadt gründen';
        }
        town.popup = html && new MousePopup(html, {
          opacity : 0.7
        });
      }
      if (town.popup != null) {
        var area = document.createElement('area');
        area.shape = 'circle';
        area.coords = coords.x + ',' + coords.y + ',' + coords.radius;
        area.href = '#';
        $(area).mousePopup(town.popup);
        if (WMap.getTownType(town) == 'town') {
          area.id = 'town-' + town.id;
        }
        if (town_type == 'free') {
          $(area).click((function(town) {
            return function(e) {
              UninhabitedPlaceInfo.init(town.x, town.y, town.nr);
            }
          })(town));
        } else if (town.mood !== undefined || town_type == 'town') {
          $(area).click((function(town) {
            return function(e) {
              if (WMap.getTownType(town) == 'town') {
                type = 'town_info';
              } else {
                type = 'farm_town_info';
              }
              var is_ghost_town = (town.player_name == "");
              TownInfo.init(town.id, type, is_ghost_town, '#map_place');
              return false;
            }
          })(town));
        } else {
          area.style.cursor = 'default';
          $(area).click(function(town) {
            return false;
          });
        }
        this.elm.marker[0].appendChild(area);
      }
    }
    MapCalender.recalcMarker();
  },
  getSea : function(x, y) {
    var sea_x = new String(Math.floor(x * 10 / MapTiles.mapSize));
    var sea_y = new String(Math.floor(y * 10 / MapTiles.mapSize));
    return sea_x + sea_y;
  },
  getCoordsFromSea : function(sea) {
    var sea_y = sea % 10;
    var sea_x = Math.floor(sea / 10);
    var coord_x = Math.round((sea_x * MapTiles.mapSize) / 10);
    var coord_y = Math.round((sea_y * MapTiles.mapSize) / 10);
    return {
      x : coord_x,
      y : coord_y
    };
  },
  updateMapCoordInfo : function(x, y) {
    x += this.position_tile_offset.x;
    y += this.position_tile_offset.y;
    document.getElementById('xcoord').value = x;
    document.getElementById('ycoord').value = y;
    document.getElementById('sea_id').innerHTML = this.getSea(x, y);
  },
  getTownType : function(town) {
    if (town.type == 'free') {
      return 'free';
    } else if (town.strength === undefined) {
      return 'town';
    } else {
      return 'farm_town';
    }
  },
  jumpToPos : function(coord_x, coord_y) {
    var map = this.mapTiles.pixel2Map(this.scrollBorder.xMax,
        this.scrollBorder.yMax);
    coord_x = bound(coord_x, 0, map.x);
    coord_y = bound(coord_y, 0, map.y);
    this.clearMarker();
    this.scrollMapToPos(
        parseInt(coord_x - this.position_tile_offset.x / 2, 10), parseInt(
            coord_y - this.position_tile_offset.y / 2, 10), true);
    return false;
  },
  toggleColorTable : function() {
    if (WMap.color_table_open) {
      $('#map_color_table').detach().appendTo('body').hide();
      WMap.color_table_open = false;
    } else {
      Ajax.post('map', 'get_custom_colors', {}, function(data) {
        $('#map_color_table_content').html(data.list_html);
        $('#map_color_table').detach().appendTo('#content').show();
        WMap.color_table_open = true;
      });
    }
  }
};
var MapDuration = {
  displayed : false,
  selected_units : {},
  speed : 0,
  duration_offset : 0,
  naval_speed_bonus_factor : 1,
  init : function() {
  },
  toggle : function() {
  },
  calculateSpeedOfUnits : function() {
    MapDuration.speed = 0;
    $.each(MapDuration.selected_units, function(unit_id, selected) {
      if (!selected) {
        return;
      }
      var unit_data = GameData.units[unit_id];
      if (MapDuration.speed == 0 || MapDuration.speed > unit_data.speed) {
        MapDuration.speed = unit_data.speed
            * MapDuration.naval_speed_bonus_factor;
      }
    });
    return MapDuration.speed;
  },
  selectUnit : function(unit_type, ele) {
    $(ele).toggleClass('selected');
    MapDuration.selected_units[unit_type] = !this.selected_units[unit_type];
    MapDuration.calculateSpeedOfUnits();
  }
}
var MapCalender = {
  data : {},
  dialog : null,
  init : function(data) {
    MapCalender.data = data;
    MapCalender.recalcMarker();
  },
  recalcMarker : function() {
    $
        .each(
            MapCalender.data,
            function(id, island) {
              var day = id.split('_')[1];
              var pixel = WMap.mapTiles.map2Pixel(island.x, island.y);
              var coords1 = {
                x : pixel.x + WMap.mapTiles.cssOffset.x,
                y : pixel.y + WMap.mapTiles.cssOffset.y
              };
              if (island.island_id == 17) {
                var img = 'rock1_xmas.gif';
                var day_offset_x = 177;
                var day_offset_y = 47;
              } else if (island.island_id == 18) {
                var img = 'rock2_xmas.gif';
                var day_offset_x = 112;
                var day_offset_y = 95;
              } else if (island.island_id == 19) {
                var img = 'rock3_xmas.gif';
                var day_offset_x = 111;
                var day_offset_y = 87;
              } else if (island.island_id == 20) {
                var img = 'rock4_xmas.gif';
                var day_offset_x = 110;
                var day_offset_y = 85;
              } else if (island.island_id == 21) {
                var img = 'rock5_xmas.gif';
                var day_offset_x = 111;
                var day_offset_y = 76;
              }
              $(
                  '<img src="http://static.grepolis.com/images/game/map/' + img
                      + '" style="position: absolute; top: ' + coords1.y
                      + 'px; left: ' + coords1.x + 'px; z-index: 100;" />')
                  .appendTo('#map_calender');
              $(
                  '<div style="position: absolute; top: '
                      + (coords1.y + day_offset_y)
                      + 'px; left: '
                      + (coords1.x + day_offset_x)
                      + 'px; z-index: 101;width:32px;height:32px;text-align:center;font-size:24px;font-family:Georgia, Times, serif;color:#fc6;text-shadow:1px 1px 3px #000;" >'
                      + day + '</div>').appendTo('#map_calender');
              var pixel = WMap.mapTiles.map2Pixel(island.x, island.y), coords = {
                x : Math.round(pixel.x - WMap.scroll.x
                    - WMap.mapTiles.tileSize.x + island.offset_x + 36),
                y : pixel.y - WMap.scroll.y - WMap.mapTiles.tileSize.y
                    + island.offset_y + 35,
                radius : 32
              };
              if (coords.x < 5000 && coords.x > -5000 && coords.y < 5000
                  && coords.y > -5000) {
                var area = document.createElement('area');
                area.shape = 'circle';
                area.coords = coords.x + ',' + coords.y + ',' + coords.radius;
                area.href = '#';
                $(area).mousePopup(new MousePopup('Tag ' + ' ' + day));
                area.id = 'present-' + id;
                $(area).click(function() {
                  Ajax.post('map', 'openCalenderWindow', {
                    day : id,
                    what : 'info'
                  }, function(result) {
                    MapCalender.openCalenderDialog(id, result);
                  });
                });
                WMap.elm.marker[0].appendChild(area);
              }
            });
  },
  openCalenderDialog : function(id, result) {
    if (result.choice) {
      MapCalender.dialog = new Dialog3({
        title : result.title,
        text : result.text1 + '<br /><br />' + result.html
            + '<br clear="all" /><br />'
            + (result.text2 == '' ? '' : (result.text2 + '<br /><br />'))
            + (result.text3 == '' ? '' : (result.text3 + '<br /><br />'))
            + result.text4,
        button_yes_1 : {
          title : 'Geschenk annehmen' + ' (1)',
          callback_function : function() {
            Ajax.post('map', 'openCalenderWindow', {
              day : id,
              what : 'get',
              nr : 1
            }, function() {
              return MapCalender.dialog.close();
            });
          }
        },
        button_yes_2 : {
          title : 'Geschenk annehmen' + ' (2)',
          callback_function : function() {
            Ajax.post('map', 'openCalenderWindow', {
              day : id,
              what : 'get',
              nr : 2
            }, function() {
              return MapCalender.dialog.close();
            });
          }
        },
        button_no : {
          title : 'Abbrechen',
          callback_function : function() {
            return MapCalender.dialog.close();
          }
        }
      });
    } else {
      MapCalender.dialog = new Dialog2({
        screenshot : (result.screenshot ? true : false),
        title : result.title,
        text : result.text1 + '<br /><br />' + result.html
            + '<br clear="all" /><br />'
            + (result.text2 == '' ? '' : (result.text2 + '<br /><br />'))
            + (result.text3 == '' ? '' : (result.text3 + '<br /><br />'))
            + result.text4,
        button_yes : {
          title : 'Geschenk annehmen',
          callback_function : function() {
            Ajax.post('map', 'openCalenderWindow', {
              day : id,
              what : 'get'
            }, function() {
              return MapCalender.dialog.close();
            });
          }
        },
        button_no : {
          title : 'Abbrechen',
          callback_function : function() {
            return MapCalender.dialog.close();
          }
        }
      });
    }
    MapCalender.dialog.open();
    $("a[rel='screenshot20']").colorbox({
      transition : "fade"
    });
    $('#call_of_the_ocean').setPopup('call_of_the_ocean');
    $('#kingly_gift').setPopup('kingly_gift');
    $('#wedding').setPopup('wedding');
    $('#curator_info_cal').setPopup('curator_info');
    return false;
  }
}