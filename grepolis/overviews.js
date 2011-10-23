var TradeOverview = {
  property : '',
  original_target : null,
  list : null,
  help : false,
  popup : $('<div id="overview_help" class="small"><div class="top"></div><div class="middle"></div><div class="bottom"></div></div>'),
  blink : $('<img id="drag_here" src="http://static.grepolis.com/images/game/overviews/blink.gif" />'),
  elements : {},
  movement_counter : [],
  init : function() {
    $('.town_draggable').draggable(
        {
          appendTo : 'body',
          helper : function() {
            var clone = $(this).clone();
            clone.find('ul.trade_movements').remove();
            var id = '_' + clone.attr('id');
            return clone.attr('id', id);
          },
          drag : function(e, ui) {
            if (TradeOverview.original_target == null) {
              TradeOverview.original_target = e.target;
              if ($.browser.ie) {
                $(TradeOverview.original_target).attr('style',
                    'filter:alpha(opacity=50);');
              } else {
                $(TradeOverview.original_target).css('opacity', 0.5);
              }
            }
          },
          stop : function() {
            $(TradeOverview.original_target).removeAttr('style');
            TradeOverview.original_target = null;
          }
        });
    $('.town_droppable').droppable(
        {
          accept : '.town_draggable',
          activeClass : 'droppable-active',
          hoverClass : 'droppable-hover',
          drop : function(e, ui) {
            var dropthis = $(ui.helper[0]).clone();
            dropthis.removeAttr('style');
            dropthis.find('span.town_population').remove();
            $(this).empty().append(dropthis);
            if (this.id === 'trade_from') {
              TradeOverview.reInitializeSliders();
            }
            TradeOverview.original_target = null;
            var town_divs = $('.town_droppable .town_draggable');
            if (town_divs.length === 2) {
              var data = {};
              data.origin_town_id = town_divs[0].id.replace("_town_", "");
              data.destination_town_id = town_divs[1].id.replace("_town_", "");
              Ajax.post('town_overviews', 'calculate_duration_between_towns',
                  data, function(return_data) {
                    $('#trade_duration span.duration').text(
                        return_data.duration);
                    $('#trade_duration span.arrival_at').text(
                        return_data.arrival_at);
                    $('#trade_duration').fadeIn('fast');
                  });
            }
          }
        });
    this.elements.w = $('#wrapper'),
        this.elements.t_m_w = $('#trade_movements_wrapper');
    this.elements.w.css(this.elements.w.stored_css = {
      top : Layout.getMenuHeight(),
      bottom : parseInt(this.elements.t_m_w.css('bottom'))
          + this.elements.t_m_w.height()
    });
    $('#trade_overview_towns li.town_draggable span.town_name span.toggle')
        .bind('click', function() {
          TradeOverview.tradeDetails($(this).parents('.town_draggable'));
          $(this).toggleClass('active');
        });
    $('.sort_icon').bind(
        'click',
        function() {
          TradeOverview.sortTownsBy(($(this).attr('class')).replace(
              /(\sactive|sort_icon\s)/g, ''));
          $('.sort_icon').removeClass('active');
          $(this).addClass('active');
        });
    this.list = $.makeArray($('#trade_overview_towns .town_draggable'));
    $('.sort_icon.wood').mousePopup(new MousePopup('Nach Holz sortieren'));
    $('.sort_icon.stone').mousePopup(new MousePopup('Nach Stein sortieren'));
    $('.sort_icon.iron').mousePopup(new MousePopup('Nach Silber sortieren'));
    $('.sort_icon.storage').mousePopup(
        new MousePopup('Nach Lagergröße sortieren'));
    $('.sort_icon.town_name').mousePopup(
        new MousePopup('Nach Stadtname sortieren'));
    $('.sort_icon.town_points').mousePopup(
        new MousePopup('Nach Punkten sortieren'));
    $('.sort_icon.town_population_sort').mousePopup(
        new MousePopup('Nach freier Bevölkerung sortieren'));
    $('.storage').mousePopup(new MousePopup('Lagergröße'));
    $('.trade_capacity').mousePopup(new MousePopup('Freie Händler'));
    $('.town_name .toggle').mousePopup(
        new MousePopup('Handelsbewegungen anzeigen'));
    $('#buttons .cancel').mousePopup(new MousePopup('zurücksetzen'));
    $('#buttons .confirm').mousePopup(new MousePopup('Rohstoffe senden'));
    $('#buttons .help').mousePopup(new MousePopup('Hilfe anzeigen'));
    $('.duration').mousePopup(new MousePopup('Laufzeit'));
    $('.arrival_at').mousePopup(new MousePopup('Ankunftszeit'));
    $('.town_population').mousePopup(new MousePopup('Freie Bevölkerung'));
    TradeOverview.initCountdowns();
  },
  reInitializeSliders : function() {
    var wood = new UnitSlider();
    wood.initialize('trade_overview_type_wood', 0, $(
        '#trade_from .resource_' + 'wood' + '_icon').html().strip());
    var iron = new UnitSlider();
    iron.initialize('trade_overview_type_iron', 0, $(
        '#trade_from .resource_' + 'iron' + '_icon').html().strip());
    var stone = new UnitSlider();
    stone.initialize('trade_overview_type_stone', 0, $(
        '#trade_from .resource_' + 'stone' + '_icon').html().strip());
  },
  showHelp : function(step) {
    if (typeof (step) == 'undefined') {
      if (this.help) {
        this.hideHelp();
        return;
      } else {
        step = 0;
      }
    }
    this.popup.appendTo('body');
    switch (step) {
    case 0:
      this.help = true;
      this.clearSelection();
      var anchor = $($('#trade_overview_towns').children()[0]);
      this.popup.children('.middle').text(
          'Ziehe die Stadt auf eines der freien Felder, um zu handeln.');
      this.popup.addClass('top_align').css({
        top : anchor.height() + anchor.offset().top + 'px',
        left : anchor.offset().left + 'px'
      }).show();
      $('.town_draggable').one('dragstart.help', function() {
        TradeOverview.showHelp(1);
        TradeOverview.popup.hide();
      });
      break;
    case 1:
      $('.town_draggable').one('dragstop.help', function() {
      });
      this.blink.remove();
      this.blink.appendTo('#trade_from');
      this.blink.fadeIn();
      $('#trade_from').one('drop.help', function() {
        TradeOverview.showHelp(2);
        TradeOverview.blink.remove();
      });
      break;
    case 2:
      var anchor = $($('#trade_overview_towns').children()[1]);
      if (anchor.length == 0) {
        break;
      }
      this.popup.children('.middle').text(
          'Ziehe die Stadt auf das verbliebene freie Feld.');
      this.popup.addClass('top_align').css({
        top : anchor.height() + anchor.offset().top + 'px',
        left : anchor.offset().left + 'px'
      }).show();
      $('.town_draggable').one('dragstart.help', function() {
        TradeOverview.showHelp(3);
        TradeOverview.popup.hide();
      });
      break;
    case 3:
      $('.town_draggable').one('dragstop.help', function() {
      });
      this.blink.remove();
      this.blink.appendTo('#trade_to');
      this.blink.fadeIn();
      $('#trade_to').one('drop.help', function() {
        TradeOverview.hideHelp();
        TradeOverview.blink.remove();
      });
      break;
    default:
      TradeOverview.hideHelp();
      break;
    }
  },
  hideHelp : function() {
    this.help = false;
    this.popup.hide().remove();
    this.blink.hide().remove();
  },
  clearSelection : function() {
    $('.town_droppable .town_draggable').remove();
    $('.town_draggable').removeAttr('style');
    $.each([ 'wood', 'stone', 'iron' ], function(i, res_name) {
      $('#trade_overview_type_' + res_name).val(0);
    });
    $('#trade_duration').fadeOut('fast');
  },
  sendResourcesBetweenTowns : function() {
    var town_divs = $('.town_droppable .town_draggable');
    if (town_divs.length != 2) {
      HumanMessage
          .error('Ziehe die beiden Städte in die dafür vorgesehenen Felder.');
      return;
    }
    var origin_town_id = town_divs[0].id.replace("_town_", "");
    var destination_town_id = town_divs[1].id.replace("_town_", "");
    if (!origin_town_id || !destination_town_id) {
      HumanMessage
          .error('Ziehe die beiden Städte in die dafür vorgesehenen Felder.');
      return;
    } else if (origin_town_id == destination_town_id) {
      HumanMessage
          .error('Du kannst keine Rohstoffe an die gleiche Stadt schicken!');
      return;
    }
    var data = {};
    data.origin_town_id = origin_town_id;
    data.destination_town_id = destination_town_id;
    $.each([ 'wood', 'stone', 'iron' ], function(i, res_name) {
      data[res_name] = $('#trade_overview_type_' + res_name).val();
    });
    Ajax
        .post(
            'town_overviews',
            'trade_between_own_town',
            data,
            function(return_data) {
              TradeOverview.clearSelection();
              TradeOverview.updateElements(data);
              $('#trade_duration').fadeOut('fast');
              $('#trade_movements_list').html(return_data.trade_movements_html);
              Layout.towns[return_data.origin_town_id].resources.wood -= return_data.resources.wood;
              Layout.towns[return_data.origin_town_id].resources.stone -= return_data.resources.stone;
              Layout.towns[return_data.origin_town_id].resources.iron -= return_data.resources.iron;
              TradeOverview.movement_counter
                  .push(return_data.new_trade_movement);
              TradeOverview.initCountdowns();
            }, {}, 'send_resources_between_towns');
  },
  updateElements : function(data) {
    this._wood = data.wood == "" ? 0 : parseInt(data.wood);
    this._stone = data.stone == "" ? 0 : parseInt(data.stone);
    this._iron = data.iron == "" ? 0 : parseInt(data.iron);
    var inc_box = $('#town_' + data.destination_town_id).find(
        'div.box.middle.center');
    var out_box = $('#town_' + data.origin_town_id).find(
        'div.box.middle.center');
    var res = {
      wood : this._wood,
      stone : this._stone,
      iron : this._iron,
      town_population : 0
    };
    $.each(res, function(res_name, res_value) {
      if (res[res_name] > 0 && res_name != 'town_population') {
        var elem = $('#town_' + data.origin_town_id + '_res .' + res_name
            + '.resource_count .count');
        var value = parseInt(elem.text());
        value -= res[res_name];
        if (elem.hasClass('town_storage_full')) {
          elem.removeClass('town_storage_full');
        }
        elem.html(value);
      }
    });
    var sum = 0;
    for ( var x in res) {
      sum -= res[x];
    }
    var out_trade_info = out_box.find('div.trade_info');
    out_trade_info
        .append('<span class="overview_outgoing icon sortable"></span>');
    inc_box.find('div.trade_info').append(
        '<span class="overview_incoming icon sortable"></span>');
    var cap = out_trade_info.children('span.trade_capacity').html();
    var index = cap.search(/\//g);
    out_trade_info.children('span.trade_capacity').html(
        parseInt(cap.substr(0, index)) + sum + '/' + cap.substr(++index));
  },
  tradeDetails : function(ele) {
    var town_id = ele[0].id.replace("town_", "");
    var movement_list = ele.find('ul.trade_movements');
    var wrapper = ele.parent().parent();
    if (ele.position().top + ele.height() > wrapper.height()) {
      wrapper.scrollTop(wrapper.height() - ele.position().top)
    }
    if (movement_list.hasClass('list_open')) {
      movement_list.slideUp();
    } else if (!movement_list.children().hasClass('dummy')) {
      movement_list.slideDown();
    } else {
      Ajax.get('town_overviews', 'trade_infos', {
        'town_id' : town_id
      }, function(data) {
        movement_list.html(data.movement_list);
        movement_list.slideDown();
      }.bind(movement_list));
    }
    movement_list.toggleClass('list_open');
  },
  toggleTradeMovementList : function(elem) {
    var toggled = (this.elements.w.height() !== 0)
    if (!this.elements.t_m_w.stored_css) {
      this.elements.t_m_w.stored_css = {
        height : this.elements.t_m_w.css('height')
      };
    }
    $(elem).find('span.toggle_icon').attr('class',
        'toggle_icon ' + (!toggled ? 'right_d' : 'down_d'));
    this.elements.w.css(toggled ? {
      bottom : ''
    } : this.elements.w.stored_css);
    if (toggled) {
      this.elements.t_m_w.animate({
        height : 334
      });
    } else {
      this.elements.t_m_w.animate({
        height : this.elements.t_m_w.stored_css.height
      });
    }
    this.t_m = this.t_m || $('#trade_movements');
    this.t_m.css({
      display : toggled ? 'block' : 'none'
    })
  },
  sortTownsBy : function(_property) {
    if (Sort.sortedBy(_property)) {
      this.list = this.list.reverse();
    } else {
      Sort.sortBy(_property);
      this.list = Sort.qsort(this.list);
    }
    $('#trade_overview_towns').append(this.list);
  },
  initCountdowns : function() {
    $.each(TradeOverview.movement_counter, function(i, movement) {
      var trade = $('#eta-trade-' + movement.id);
      trade.countdown(movement.arrival_at, {});
      trade.bind('finish', function() {
        $(this).parent().fadeOut();
      });
    });
  }
};
var TownGroupOverview = {
  property : '',
  list : null,
  active_list : null,
  temporary_active_group : 0,
  old_temp_active_group : 0,
  move : true,
  sum_active_towns : 0,
  original_target : null,
  town_data : {},
  init : function() {
    $('.town_draggable').draggable(
        {
          appendTo : 'body',
          helper : function() {
            var clone = $(this).clone();
            var id = '_' + clone.attr('id');
            return clone.attr('id', id);
          },
          drag : function(e, ui) {
            if (TownGroupOverview.original_target == null) {
              TownGroupOverview.original_target = e.target;
              if (navigator.appName == "Microsoft Internet Explorer") {
                $(TownGroupOverview.original_target).attr('style',
                    'filter:alpha(opacity=50);');
              } else {
                $(TownGroupOverview.original_target).css('opacity', 0.5);
              }
            }
          },
          stop : function() {
            $(TownGroupOverview.original_target).removeAttr('style');
            TownGroupOverview.original_target = null;
          }
        });
    $('.town_drop_area_active').droppable({
      accept : '#town_group_all_towns .town_draggable',
      activeClass : 'droppable-active',
      hoverClass : 'droppable-hover',
      drop : function(e, ui) {
        TownGroupOverview.addToGroup(ui.draggable);
      }
    });
    $('.town_drop_area_remaining').droppable({
      accept : '#town_group_active_towns .town_draggable',
      activeClass : 'droppable-active',
      hoverClass : 'droppable-hover',
      drop : function(e, ui) {
        TownGroupOverview.removeFromGroup(ui.draggable);
      }
    });
    TownGroupOverview.setUnitPopups();
    $('.sort_icon_active').bind(
        'click',
        function() {
          TownGroupOverview.sortTownsBy(($(this).attr('class'))
              .match(/town_\w+/g)[0], true);
          $('.sort_icon_active').removeClass('active');
          $(this).addClass('active');
        });
    $('.sort_icon_all').bind(
        'click',
        function() {
          TownGroupOverview.sortTownsBy(($(this).attr('class'))
              .match(/town_\w+/g)[0], false);
          $('.sort_icon_all').removeClass('active');
          $(this).addClass('active');
        });
    $('.overview_type_icon').bind(
        'click',
        function() {
          TownGroupOverview.setOverviewType(($(this).attr('class')).replace(
              /(overview_type_icon\s)|(\sactive)/g, ''), false);
        });
    $('.sort_icon_all.town_name').mousePopup(
        new MousePopup('Nach Stadtname sortieren'));
    $('.sort_icon_all.town_points').mousePopup(
        new MousePopup('Nach Punkten sortieren'));
    $('.sort_icon_all.town_population').mousePopup(
        new MousePopup('Nach freier Bevölkerung sortieren'));
    $('.sort_icon_active.town_name').mousePopup(
        new MousePopup('Nach Stadtname sortieren'));
    $('.sort_icon_active.town_points').mousePopup(
        new MousePopup('Nach Punkten sortieren'));
    $('.sort_icon_active.town_population').mousePopup(
        new MousePopup('Nach freier Bevölkerung sortieren'));
    $('.overview_type_icon.show_resources').mousePopup(
        new MousePopup('Zeige Rohstoffe in den Städten'));
    $('.overview_type_icon.show_units').mousePopup(
        new MousePopup('Zeige Einheiten in den Städten'));
    $('.select_town_group').mousePopup(new MousePopup('Gruppe aktivieren'));
    $('.delete_town_group').mousePopup(new MousePopup('Gruppe löschen'));
    $('.storage').mousePopup(new MousePopup('Rohstofflager'));
    $('.population_info').mousePopup(new MousePopup('Freie Bevölkerung'));
    $('.town_population_sort').mousePopup(
        new MousePopup('Nach freier Bevölkerung sortieren'));
    TownGroupOverview.list = $.makeArray($('#town_group_all_towns .town_item'));
    TownGroupOverview.active_list = $
        .makeArray($('#town_group_active_towns .town_item'));
  },
  setUnitPopups : function() {
    $.each(GameData.units, function(unit) {
      $(".unit_" + unit).setPopup(unit);
    });
  },
  setOverviewType : function(type) {
    var data = {};
    data.overview_type = type;
    if (this.town_data[type]) {
      TownGroupOverview.update_town_data(this.town_data[type], type);
      return;
    }
    Ajax.post('town_group_overviews', 'set_overview_type', data, function(
        return_data) {
      TownGroupOverview.update_town_data(return_data.towns, type);
      TownGroupOverview.town_data[type] = return_data.towns;
      TownGroupOverview.setUnitPopups();
    }, {}, 'set_overview_type');
  },
  update_town_data : function(data, type) {
    $.each(data, function(town_id, content) {
      $('#town_' + town_id + ' .box_content')
          .html('<div>' + content + '</div>');
    });
    $('.overview_type_icon').removeClass('active');
    $('#sort_groups .' + type).addClass('active');
  },
  removeFromGroup : function(town_element) {
    var data = {};
    data.town_id = town_element[0].id.replace("town_", "");
    data.group_id = TownGroupOverview.temporary_active_group;
    Ajax.post('town_group_overviews', 'remove_town_from_group', data, function(
        return_data) {
      TownGroupOverview.moveRight(return_data);
      if ($('#town_group_active_towns').children().length == 0) {
        $('#town_group_id_' + return_data.group_id)
            .find('a .select_town_group').remove();
        if (return_data.is_active) {
          Layout.setActiveTownGroup(0, '', '', false);
        }
      }
      if ($('#town_group_all_towns').children().length == 1) {
        $('#sort_icons_all_towns .hide').removeClass('hide').addClass('show');
      }
    }, {}, 'remove_from_group');
  },
  addToGroup : function(town_element) {
    var data = {};
    data.town_id = town_element[0].id.replace("town_", "");
    data.group_id = TownGroupOverview.temporary_active_group;
    Ajax
        .post(
            'town_group_overviews',
            'add_town_to_group',
            data,
            function(return_data) {
              TownGroupOverview.moveLeft(return_data);
              if (TownGroupOverview.sum_active_towns == 1) {
                $('#sort_icons_active_group_towns .hide').removeClass('hide')
                    .addClass('show');
                if ($('#town_group_id_' + return_data.group_id).find(
                    'a .select_town_group').length == 0) {
                  $('#town_group_id_' + return_data.group_id)
                      .append(
                          '<a class="select_town_group confirm" href="#" onclick="Layout.setActiveTownGroup('
                              + return_data.group_id
                              + ', \'town_group_overviews\', \'\'); return false"></a>');
                }
              }
              if ($('#town_group_all_towns').children().length == 0
                  && $('.town_group_active.show').length > 0) {
                Layout
                    .showHint(
                        'Hinweis',
                        'Du hast zurzeit all deine Städte in einer Stadtgruppe. Erhältst du neue Städte, werden diese nicht in den Übersichten und der Städteliste erscheinen. Damit die neue Stadt in den Übersichten angezeigt wird, kannst du sie manuell zur Gruppe hinzufügen oder die aktive Gruppe abwählen.');
              }
            }, {}, 'add_to_group');
  },
  moveLeft : function(town_data) {
    TownGroupOverview.sum_active_towns++;
    var town = $('#town_' + town_data.town_id);
    this.insertTownInto(town, $('#town_group_active_towns'));
    TownGroupOverview.active_list = $
        .makeArray($('#town_group_active_towns .town_item'));
    TownGroupOverview.list = $.makeArray($('#town_group_all_towns .town_item'));
    if ($('#town_group_all_towns').children().length == 0) {
      $('#sort_icons_all_towns .show').removeClass('show').addClass('hide');
    }
    $('.sort_icon_active').removeClass('active');
  },
  moveRight : function(town_data) {
    TownGroupOverview.sum_active_towns--;
    var town = $('#town_' + town_data.town_id + '');
    this.insertTownInto(town, $('#town_group_all_towns'));
    TownGroupOverview.active_list = $
        .makeArray($('#town_group_active_towns .town_item'));
    TownGroupOverview.list = $.makeArray($('#town_group_all_towns .town_item'));
    if ($('#town_group_active_towns').children().length == 0) {
      $('#sort_icons_active_group_towns .show').removeClass('show').addClass(
          'hide');
    }
    $('.sort_icon_all').removeClass('active');
  },
  insertTownInto : function(town, list) {
    if (list.children().length == 0) {
      town.appendTo(list)
    } else {
      var all = list.find('div.box.middle.center');
      var prop = TownGroupOverview.property == '' ? 'town_name'
          : TownGroupOverview.property;
      for ( var i = 0; i < all.length; i++) {
        var j = 0;
        var sortables = all[i].getElementsByTagName('span')
        while (j < sortables.length
            && sortables[j].className.indexOf(prop) == -1) {
          j++;
        }
        if (town[0].getElementsByTagName('span')[j].innerHTML.strip().isLTE(
            sortables[j].innerHTML.strip())) {
          town.insertBefore($(all[i]).parents('li'))
          return;
        } else {
          town.insertAfter($(all[i]).parents('li'))
        }
      }
    }
  },
  setTemporaryActiveGroup : function(town_id_arr) {
    TownGroupOverview.cleanupActiveTowns(town_id_arr);
    TownGroupOverview.cleanupRemainingTowns(town_id_arr);
    var active_hide = $('#town_group_id_'
        + TownGroupOverview.old_temp_active_group + ' .show');
    var active_show = $('#town_group_id_'
        + TownGroupOverview.old_temp_active_group + ' .hide');
    var inactive_hide = $('#town_group_id_'
        + TownGroupOverview.temporary_active_group + ' .show');
    var inactive_show = $('#town_group_id_'
        + TownGroupOverview.temporary_active_group + ' .hide');
    var title = $(
        '#town_group_id_' + TownGroupOverview.temporary_active_group + ' .show')
        .text();
    active_hide.removeClass('show').addClass('hide');
    active_show.removeClass('hide').addClass('show');
    inactive_hide.removeClass('show').addClass('hide');
    inactive_show.removeClass('hide').addClass('show');
    $('#active_town_list_head').text('Städte aus %s'.replace('%s', title));
    if ($('#town_group_id_' + TownGroupOverview.temporary_active_group
        + ' .select_town_group').length > 0) {
      $('#sort_icons_active_group_towns .hide').removeClass('hide').addClass(
          'show');
    }
  },
  cleanupActiveTowns : function(town_id_arr) {
    var active_towns = $('#town_group_active_towns .town_item');
    $.each(active_towns, function(nr) {
      var town_id = this.id.replace("town_", "");
      var move = true;
      $.each(town_id_arr, function(id) {
        if (this.id == town_id) {
          move = false;
        }
      });
      if (move) {
        TownGroupOverview.moveRight({
          'town_id' : town_id
        });
      }
    });
    if ($('#town_group_active_towns').children().length == 0) {
      $('#sort_icons_active_group_towns .show').removeClass('show').addClass(
          'hide');
    }
    Sort.sortBy(null);
    TownGroupOverview.sortTowns(false);
  },
  cleanupRemainingTowns : function(town_id_arr) {
    var rem_towns = $('#town_group_all_towns .town_item');
    $.each(rem_towns, function(nr) {
      var town_id = this.id.replace("town_", "");
      var move = true;
      $.each(town_id_arr, function(id) {
        if (this.id == town_id) {
          TownGroupOverview.moveLeft({
            'town_id' : town_id
          });
        }
      });
    });
    Sort.sortBy(null);
    TownGroupOverview.sortTowns(true);
  },
  unsetActiveSort : function(isMovedLeft) {
    if (isMovedLeft) {
      $('.sort_icon_active').removeClass('active');
    } else {
      $('.sort_icon_all').removeClass('active');
    }
  },
  sortTowns : function(isMovedLeft) {
    var tmp = TownGroupOverview.property != '' ? TownGroupOverview.property
        : 'town_name';
    TownGroupOverview.sortTownsBy(tmp, isMovedLeft);
  },
  sortTownsBy : function(_property, isMovedLeft) {
    this.property = _property;
    if (isMovedLeft) {
      if (Sort.sortedBy(_property)) {
        TownGroupOverview.active_list = TownGroupOverview.active_list.reverse();
      } else {
        Sort.sortBy(_property);
        TownGroupOverview.active_list = Sort
            .qsort(TownGroupOverview.active_list);
      }
      $('#town_group_active_towns').append(TownGroupOverview.active_list);
    } else {
      if (Sort.sortedBy(_property)) {
        TownGroupOverview.list = TownGroupOverview.list.reverse();
      } else {
        Sort.sortBy(_property);
        TownGroupOverview.list = Sort.qsort(TownGroupOverview.list);
      }
      $('#town_group_all_towns').append(TownGroupOverview.list);
    }
  }
};
var RecruitUnits = {
  units : [],
  current_town_id : null,
  current_unit_id : null,
  slider : null,
  help : false,
  popup : $('<div id="overview_help" class="small"><div class="top"></div><div class="middle"></div><div class="bottom"></div></div>'),
  c_width : 735,
  c_height : 370,
  recruit_units : null,
  recruit_tabs : null,
  showAllUnits : false,
  res : {},
  old_value : [],
  max_build : [],
  init : function() {
    $('.confirm').mousePopup(new MousePopup('Einheiten ausbilden'));
    $('.reload').mousePopup(new MousePopup('Zurücksetzen'));
    $('.toggle_troops_in_town.own').mousePopup(
        new MousePopup('Zeige nur eigene Truppen'));
    $('.toggle_troops_in_town.all').mousePopup(
        new MousePopup('Zeige alle Truppen'));
    $('.all_troops_of_town').mousePopup(
        new MousePopup('Alle Einheiten aus dieser Stadt'));
    $('#toggle').mousePopup(new MousePopup('Mythologische Einheiten anzeigen'));
    $('#toggle').click(
        function() {
          if ($('#toggle').hasClass('game_arrow_right')) {
            $('#toggle').mousePopup(
                new MousePopup('Mythologische Einheiten anzeigen'));
          } else {
            $('#toggle').mousePopup(
                new MousePopup('Land- und Seeeinheiten anzeigen'));
          }
        });
    $('.queues_list').each(function() {
      var table_class = $(this).prev().attr('class');
      $(this).addClass(table_class);
    });
    $('.recruit_overview .max_build').bind(
        'click',
        function() {
          if (!$(this).next().hasClass('inactive')) {
            $(this).parent().find('input').val(
                parseInt($(this).html().match(/\d+/)));
          }
        });
    $('.toggle_troops_in_town.own').click(function() {
      if ($(this).hasClass('disabled')) {
        return false;
      }
      $(this).addClass('disabled');
      $('.toggle_troops_in_town.all').removeClass('disabled');
      $('.all_troops_of_town').removeClass('disabled');
      RecruitUnits.toggleTownUnits();
    });
    $('.toggle_troops_in_town.all').click(function() {
      if ($(this).hasClass('disabled')) {
        return false;
      }
      $(this).addClass('disabled');
      $('.toggle_troops_in_town.own').removeClass('disabled');
      $('.all_troops_of_town').removeClass('disabled');
      RecruitUnits.toggleTownUnits();
    });
    $('.all_troops_of_town').click(function() {
      if ($(this).hasClass('disabled')) {
        return false;
      }
      $(this).addClass('disabled');
      $('.toggle_troops_in_town.all').removeClass('disabled');
      $('.toggle_troops_in_town.own').removeClass('disabled');
      RecruitUnits.toggleAllTroopsOfTowns();
    });
    $.each(GameData.units, function(unit) {
      $("#overview_unit_" + unit).setPopup(unit);
    });
    $('tr.place_command').each(function() {
      if ($(this).find('.casted_power_call_of_the_ocean').length != 0) {
        $(this).find('.power_icon#call_of_the_ocean').addClass('disabled');
      }
      if ($(this).find('.casted_power_fertility_improvement').length != 0) {
        $(this).find('.power_icon#fertility_improvement').addClass('disabled');
      }
    });
  },
  queueUnits : function(elem) {
    if (!$(elem).hasClass('inactive')) {
      var classes = $(elem).parent().attr('class').split(' ', 2);
      var town_id = classes[0].match(/\d+/);
      var unit_type = classes[1].replace(/unit_/g, '');
      $(elem).parent().find('input').val(
          parseInt($(elem).parent().find('.max_build').html().match(/\d+/)));
      RecruitUnits.updateResAndQueue(town_id, unit_type,
          GameData.units[unit_type].resources,
          GameData.units[unit_type].population);
    }
  },
  toggleBuildableUnits : function(elem) {
    var town_id = $(elem).attr('id').replace(/toggle_town_units_/g, '');
    var status = $(elem).attr('class').replace(/toggle/g, '');
    Ajax.post('town_overviews', 'toggle_nonbuildable_units', {
      town_id : town_id,
      status : status
    }, function(data) {
      $('#town_' + town_id + ' .clearfix.recruit_overview').html(data.html);
      $('#town_' + town_id + ' .recruit_overview .place_unit').bind(
          'click',
          function() {
            if (!$(this).hasClass('inactive')) {
              var classes = $(this).parent().attr('class').split(' ', 2);
              var town_id = classes[0].match(/\d+/);
              var unit_type = classes[1].replace(/unit_/g, '');
              $(this).parent().find('input').val(
                  parseInt($(this).parent().find('.max_build').html().match(
                      /\d+/)));
              RecruitUnits.updateResAndQueue(town_id, unit_type,
                  GameData.units[unit_type].resources,
                  GameData.units[unit_type].population);
            }
          });
    });
  },
  selectTown : function(ev) {
    var ele = ev.originalTarget || ev.srcElement;
    var preselect = null;
    if (ele.tagName == 'A') {
      return;
    }
    while (ele.parentNode != null
        && (ele.parentNode.tagName != 'UL' || ele.parentNode.id
            .indexOf('town_units_overview') != -1)) {
      if (ele.className.indexOf('place_unit') != -1) {
        preselect = ele.className.replace('place_unit unit_', '');
      }
      ele = ele.parentNode
    }
    RecruitUnits.current_town_id = ~~(ele.id.replace(/\D+/g, ''));
    function openCloseTown() {
      var self = $(ele);
      var queues = self.find('#units_' + RecruitUnits.current_town_id
          + ' .queue');
      if (!self.hasClass('selected')) {
        var p = self.position();
        self.attr('style', 'position:absolute;left:' + p.left + 'px;top:'
            + p.top + 'px;z-index:5;')
        self.animate({
          left : 0,
          top : self.parent().parent().scrollTop(),
          width : RecruitUnits.c_width,
          height : RecruitUnits.c_height
        }, 500, function() {
          self.find('#units_' + RecruitUnits.current_town_id).append(
              RecruitUnits.recruit_units)
          RecruitUnits.showAvailableUnits();
        });
        self.addClass('selected');
        queues.each(function() {
          $(this).parent().show();
        });
        queues.first().parents('.queues').addClass('active').prev().hide();
      } else {
        self.removeAttr('style').removeClass('selected')
        RecruitUnits.recruit_units.detach();
        queues.each(function() {
          ele = $(this);
          if (ele.children().length == 0) {
            ele.parent().hide();
          }
        });
        queues.first().parents('.queues').removeClass('active').prev().show();
      }
    }
    if (RecruitUnits.units[RecruitUnits.current_town_id]) {
      openCloseTown();
    } else {
      Ajax.post('town_overviews', 'town_units', {
        town_id : RecruitUnits.current_town_id
      }, function(response) {
        RecruitUnits.units[RecruitUnits.current_town_id] = {
          units : response
        };
        openCloseTown();
      });
    }
  },
  calculateFavor : function(town_id, current_favor, power, favor_for_power) {
    $('tr#town_' + town_id).find('.power_icon#' + power).addClass('disabled');
    if (current_favor - favor_for_power < favor_for_power) {
      $('.power_icon#' + power).each(function() {
        $(this).addClass('disabled');
      })
    }
  },
  orderSelectedUnit : function() {
    var order_count = ~~($('#recruit_amount').val());
    var naval = GameData.units[this.current_unit_id].transport === null;
    if (order_count == 0) {
      return;
    }
    var unit_image = '<div id="order_tmp" class="place_unit" style="background:url(http://static.grepolis.com/images/game/units/'
        + this.current_unit_id
        + '_25x25.png)"><span class="place_unit_black small bold">'
        + order_count
        + '</span><span class="place_unit_white small bold">'
        + order_count + '</span></div>';
    var town_id = this.current_town_id;
    var ajax_data = {};
    ajax_data.units = {};
    ajax_data.units[this.current_unit_id] = order_count;
    ajax_data.town_id = town_id;
    var queue = $('#units_' + this.current_town_id + ' .queues').find(
        '.naval , .ground');
    Ajax
        .post(
            'town_overviews',
            'recruit_units',
            ajax_data,
            function(return_data) {
              $
                  .each(
                      ajax_data.units,
                      function(type, amount) {
                        RecruitUnits.units[town_id].units[type].max_build -= parseInt(amount);
                        queue[naval ? 1 : 0].getElementsByTagName('div')[1].innerHTML += unit_image;
                        var res_span = $('#units_' + town_id
                            + ' .unit_town_resources span.count');
                        var i = 0;
                        var unit_res = jQuery.extend(true, {},
                            GameData.units[type].resources, {
                              population : GameData.units[type].population
                            });
                        for (res in unit_res) {
                          var ele = res_span[i++];
                          RecruitUnits.units[town_id][res] = ele.innerHTML = ~~ele.innerHTML
                              - unit_res[res] * amount;
                          var town_index = 0;
                          $.each(Layout.towns, function(index, town) {
                            if (town.id == town_id) {
                              town_index = index;
                            }
                          });
                          Layout.towns[town_index].resources[res] = parseInt(ele.innerHTML);
                          if (unit_res[res] > 0) {
                            $(ele).removeClass("town_storage_full");
                          }
                        }
                      });
              var counter = 0;
              $
                  .each(
                      return_data.order_ids,
                      function(key, id) {
                        $('#order_' + return_data.order_ids[id]).unbind();
                        if (counter == 0) {
                          $('#order_tmp').attr('id',
                              'order_' + return_data.order_ids[id]);
                          $('#order_' + return_data.order_ids[id]).addClass(
                              'orderer_unit_' + return_data.unit_types[id]);
                        }
                        $('#order_' + return_data.order_ids[id])
                            .mousePopup(
                                new MousePopup(
                                    '<div id="ordered_unit_popup">'
                                        + GameData.units[return_data.unit_types[id]].name
                                        + '<br /><img src="http://static.grepolis.com/images/game/res/time.png" alt=""/><span class="eta"></span></div>'
                                        + '<script type="text/javascript">$("#ordered_unit_popup .eta").countdown('
                                        + return_data.order_finished_times[id]
                                        + ')<\/script>'));
                        counter++;
                      });
              var units, unit;
              for (unit in units = RecruitUnits.units[town_id].units) {
                if (units[unit].max_build > 0) {
                  var resources, res;
                  for (res in resources = jQuery.extend(true, {},
                      GameData.units[unit].resources, {
                        population : GameData.units[unit].population
                      })) {
                    var new_max = parseInt(RecruitUnits.units[town_id][res]
                        / (resources[res]));
                    new_max = Math.max(new_max, 0);
                    if (new_max < units[unit].max_build) {
                      units[unit].max_build = new_max;
                    }
                  }
                }
              }
              RecruitUnits.showAvailableUnits();
            });
  },
  orderSelectedUnitInOverview : function(town_id) {
    var order_count = 0;
    var unit_image = {};
    var order_is_empty = true;
    var ajax_data = {};
    ajax_data.units = {};
    $
        .each(
            GameData.units,
            function(unit) {
              order_count = $('input#town_' + town_id + '_count_' + unit).val();
              if (order_count == '' || typeof order_count == 'undefined') {
                order_count = 0;
              }
              if (order_count > 0) {
                order_is_empty = false;
                ajax_data.units[unit] = parseInt(order_count);
                unit_image[unit] = '<div id="order_tmp" class="place_unit" style="background:url(http://static.grepolis.com/images/game/units/'
                    + unit
                    + '_25x25.png);margin: 0; height: 25px; width: 25px; float: left; display: inline-block;"><span class="place_unit_black small bold">'
                    + order_count
                    + '</span><span class="place_unit_white small bold">'
                    + order_count + '</span></div>';
              }
            });
    ajax_data.town_id = town_id;
    var queue = $('.recruit_overview tr#town_' + town_id).next('tr').find(
        '.naval , .ground');
    if (!order_is_empty) {
      Ajax.post('town_overviews', 'recruit_units', ajax_data, function(
          return_data) {
        $.each(ajax_data.units, function(type, amount) {
          var res_span = $('.recruit_overview #town_' + town_id
              + '_res span.count');
          var i = 0;
          var unit_res = jQuery.extend(true, {},
              GameData.units[type].resources, {
                population : GameData.units[type].population
              });
          for (res in unit_res) {
            var ele = res_span[i++];
            ele.innerHTML = ~~ele.innerHTML - unit_res[res] * amount;
            var town_index = 0;
            $.each(Layout.towns, function(index, town) {
              if (town.id == town_id) {
                town_index = index;
              }
            });
            Layout.towns[town_index].resources[res] = parseInt(ele.innerHTML);
            if (unit_res[res] > 0) {
              $(ele).removeClass("town_storage_full");
            }
          }
          if (amount != 0) {
            var naval = GameData.units[type].transport === null;
            queue[naval ? 1 : 0].innerHTML += unit_image[type];
          }
        });
        if (return_data.bar != '') {
          Layout.updateBar(return_data.bar);
        }
        RecruitUnits.getMaxBuildOfUnits(town_id);
        RecruitUnits.resetRecruitInTown(town_id);
      });
    }
  },
  getMaxBuildOfUnits : function(town_id) {
    var wood = parseInt($(
        '.recruit_overview #town_' + town_id + '_res .wood span.count').html());
    var stone = parseInt($(
        '.recruit_overview #town_' + town_id + '_res .stone span.count').html());
    var iron = parseInt($(
        '.recruit_overview #town_' + town_id + '_res .iron span.count').html());
    var town_population = parseInt($(
        '.recruit_overview #town_' + town_id
            + '_res .town_population span.count').html());
    $
        .each(
            GameData.units,
            function(unit) {
              if (GameData.units[unit].id != 'militia') {
                var max_build_for_wood = GameData.units[unit].resources.wood != 0 ? Math
                    .floor(wood / GameData.units[unit].resources.wood)
                    : wood;
                var max_build_for_stone = GameData.units[unit].resources.stone != 0 ? Math
                    .floor(stone / GameData.units[unit].resources.stone)
                    : stone;
                var max_build_for_iron = GameData.units[unit].resources.iron != 0 ? Math
                    .floor(iron / GameData.units[unit].resources.iron)
                    : iron;
                var max_build_for_favor = GameData.units[unit].favor != 0 ? Math
                    .floor(Layout.favor / GameData.units[unit].favor)
                    : Layout.favor;
                var max_build_for_population = GameData.units[unit].population != 0 ? Math
                    .floor(town_population / GameData.units[unit].population)
                    : town_population;
                var max_build = Math.min(Math.min(Math.min(max_build_for_wood,
                    max_build_for_stone), Math.min(max_build_for_iron,
                    max_build_for_population)), max_build_for_favor);
                RecruitUnits.max_build[GameData.units[unit].id] = parseInt(max_build);
                if (!$(
                    '.recruit_overview tr#town_' + town_id
                        + ' .max_build.unit_' + GameData.units[unit].id)
                    .parent().hasClass('inactive')) {
                  $(
                      '.recruit_overview tr#town_' + town_id
                          + ' .max_build.unit_' + GameData.units[unit].id)
                      .html(
                          (parseInt(max_build) ? '+' + parseInt(max_build) : ''));
                }
                if (!parseInt(max_build)) {
                  $(
                      '.recruit_overview tr#town_' + town_id
                          + '.max_build.unit_' + GameData.units[unit].id)
                      .remove();
                  $(
                      '.recruit_overview tr#town_' + town_id + ' input#town_'
                          + town_id + '_count_' + GameData.units[unit].id)
                      .remove();
                }
              }
            });
  },
  select : function(ele) {
    if (typeof ele != 'string') {
      while (ele.parentNode.className.indexOf('recruit_tab') != -1
          || ele.parentNode.id != 'recruit_tabs') {
        ele = ele.parentNode;
      }
    } else {
      ele = document.getElementById(ele).parentNode;
    }
    var unit_id = RecruitUnits.current_unit_id = ele
        .getElementsByTagName('div')[0].id;
    RecruitUnits.recruit_tabs.each(function(element) {
      this.parentNode.className = this.parentNode.className.replace('selected',
          '');
    });
    RecruitUnits.slider
        .setMax(this.units[this.current_town_id].units[unit_id].max_build)
    RecruitUnits.slider
        .setValue(this.units[this.current_town_id].units[unit_id].max_build)
    var img = RecruitUnits.recruit_units.find('img')[0];
    img.src = Game.img() + '/game/units/' + unit_id + '_90x90.jpg'
    img.alt = GameData.units[unit_id].name;
    document.getElementById('unit_order_unit_name').innerHTML = GameData.units[unit_id].name;
    RecruitUnits.showCosts({
      unit_id : unit_id,
      count : RecruitUnits.slider.getValue()
    })
    RecruitUnits.showCosts({
      count : 1
    })
    $(ele).addClass('selected');
  },
  showCosts : function(options) {
    this.unit_id = options.unit_id || this.current_unit_id;
    this.count = options.count || 1;
    var all = this.count > 1 ? 'all' : 'unit'
    var unit = RecruitUnits.units[RecruitUnits.current_town_id].units[this.unit_id];
    for ( var res_id in unit.resources) {
      document.getElementById('unit_order_' + all + '_' + res_id).innerHTML = unit.resources[res_id]
          * this.count;
    }
    document.getElementById('unit_order_' + all + '_favor').innerHTML = unit.favor
        * this.count;
    document.getElementById('unit_order_' + all + '_pop').innerHTML = unit.population
        * this.count;
    document.getElementById('unit_order_' + all + '_build_time').innerHTML = readableSeconds(unit.build_time
        * this.count);
  },
  resetUnit : function(ele, unit_type) {
    delete this.units[this.current_town_id][unit_type];
    $(ele).parent().remove();
  },
  initSlider : function() {
    var elements = this.recruit_units.children('#recruit_box').children()
        .children();
    this.slider = new Slider({
      elementMin : $(elements[1]),
      elementMax : $(elements[2]),
      elementDown : $(elements[3]),
      elementUp : $(elements[5]),
      elementInput : $(elements[6]),
      elementSlider : $(elements[4])
    });
    this.slider._elementSlider.bind('change', function(event, ui) {
      RecruitUnits.showCosts({
        count : RecruitUnits.slider.getValue()
      });
    });
  },
  showAvailableUnits : function() {
    this.recruit_units.hide();
    this.recruit_units.slideDown();
    var type;
    if (!this.recruit_tabs) {
      this.recruit_tabs = $('#recruit_tabs .recruit_unit');
    }
    this.recruit_tabs
        .each(function() {
          type = this.id;
          var tab = $(this);
          var unittype = RecruitUnits.units[RecruitUnits.current_town_id].units[type];
          if (unittype && unittype.max_build > 0) {
            tab.parent().show();
            tab.children()[0].innerHTML = tab.children()[1].innerHTML = unittype.count;
            tab.next()[0].innerHTML = unittype.max_build;
          } else {
            tab.parent().hide();
          }
        });
    this.select('sword');
  },
  toggleTownUnits : function() {
    if (!RecruitUnits.showAllUnits) {
      Ajax
          .post(
              'town_overviews',
              'all_units',
              {},
              function(return_data) {
                RecruitUnits.showAllUnits = !RecruitUnits.showAllUnits;
                $
                    .each(
                        return_data.all_units,
                        function(town_id, units) {
                          $.each(units, function(type, sum) {
                          });
                          var list = $('#units_' + town_id + ' .current_units')
                              .html('');
                          $
                              .each(
                                  units,
                                  function(type, sum) {
                                    $(
                                        'tr#town_' + town_id + ' span.count_'
                                            + type).html(sum);
                                    if (sum > 0 && type != 'town_id') {
                                      list
                                          .append('<div style="background-image: url(http://static.grepolis.com/images/game/units/'
                                              + type
                                              + '_25x25.png);" class="place_unit unit_'
                                              + type
                                              + '"><span class="place_unit_black bold small">'
                                              + sum
                                              + '</span><span class="place_unit_white bold small">'
                                              + sum + '</span></div>');
                                    }
                                  });
                          $('#toggle_unit_link .middle').text(
                              'Zeige nur eigene Truppen');
                        });
              });
    } else {
      Ajax
          .post(
              'town_overviews',
              'own_units',
              {},
              function(return_data) {
                RecruitUnits.showAllUnits = !RecruitUnits.showAllUnits;
                $
                    .each(
                        return_data.own_units,
                        function(town_id, units) {
                          var list = $('#units_' + town_id + ' .current_units')
                              .html('');
                          $
                              .each(
                                  units,
                                  function(type, sum) {
                                    $(
                                        'tr#town_' + town_id + ' span.count_'
                                            + type).html(sum);
                                    if (sum > 0 && type != 'town_id') {
                                      list
                                          .append('<div style="background-image: url(http://static.grepolis.com/images/game/units/'
                                              + type
                                              + '_25x25.png);" class="place_unit unit_'
                                              + type
                                              + '"><span class="place_unit_black bold small">'
                                              + sum
                                              + '</span><span class="place_unit_white bold small">'
                                              + sum + '</span></div>');
                                    }
                                  });
                          $('#toggle_unit_link .middle').text(
                              'Zeige alle Truppen');
                        });
              });
    }
  },
  toggleShowOuterTroops : function() {
    this.otcw = this.otcw || $('#outer_troops_content_wrapper');
    this.ot = this.ot || $('#outer_troops');
    this.toggle = this.toggle || $('#outer_troops_link');
    if (!this.ot.toggled) {
      this.ot.stored_height = this.ot.css('height');
      this.ot.animate({
        height : 442
      }, 600, 'linear');
      this.ot.toggled = 1;
      this.toggle.find('.toggle_icon.beyond.right_d').attr('class',
          'toggle_icon beyond up_d');
      this.ot.find('.toggle_icon.recruit').attr('class',
          'toggle_icon recruit right_d');
    } else {
      this.ot.animate({
        height : this.ot.stored_height
      }, 600, 'linear', function() {
        RecruitUnits.otcw.empty().parent().removeAttr('style');
      });
      this.ot.toggled = 0;
      this.toggle.find('.toggle_icon.beyond.up_d').attr('class',
          'toggle_icon beyond right_d');
      return;
    }
    Ajax.post('town_overviews', 'outer_units', {}, function(data) {
      RecruitUnits.otcw.html(data.html).show();
      $.each(GameData.units, function(unit) {
        $("." + unit).setPopup(unit);
      });
      $('.place_sendback_all').mousePopup(
          new MousePopup('<strong>' + 'Alle Einheiten zurückschicken'
              + '</strong>'));
      $('.place_sendback_part').mousePopup(
          new MousePopup('<strong>' + 'Einige Einheiten zurückschicken'
              + '</strong>'));
    });
  },
  toggleRecruitTroops : function() {
    this.otcw = this.otcw || $('#outer_troops_content_wrapper');
    this.ot = this.ot || $('#outer_troops');
    this.toggle = this.toggle || $('#recruit_troops_link');
    if (!this.ot.toggled) {
      this.ot.stored_height = this.ot.css('height');
      this.ot.animate({
        height : 442
      }, 600, 'linear', function() {
        Ajax.postEx('town_overviews', 'recruit_units_overview', {}, "html",
            function(data) {
              $('#outer_troops_content_wrapper').html(data);
              for (i = 0; i < Layout.power_popup_data.length; i++) {
                Layout.initializePowerPopupForTownOverview(
                    Layout.power_popup_data[i].power,
                    Layout.power_popup_data[i].town_id,
                    Layout.power_popup_data[i].finished_at);
              }
              $.each(GameData.units, function(unit) {
                $(".unit_" + unit).setPopup(unit);
              });
              $('#recruit_tabs').bind('click', function(event) {
                RecruitUnits.select(event.originalTarget || event.srcElement);
                event.stopPropagation();
              });
              $('#unit_overview_town_list').bind('click', function(event) {
                RecruitUnits.selectTown(event);
                event.stopPropagation();
              });
              if (!RecruitUnits.recruit_units) {
                RecruitUnits.recruit_units = $('#recruit_units').detach();
              }
              RecruitUnits.recruit_units.bind('click', function(event) {
                event.stopPropagation();
              });
              $('#recruit_queues .confirm').mousePopup(
                  new MousePopup('Einheiten ausbilden'));
              $('#recruit_box .confirm').mousePopup(
                  new MousePopup('Einheiten zur Bauschleife hinzufügen'));
              $('.help').mousePopup(new MousePopup('Hilfe anzeigen'));
              $('.cancel').mousePopup(new MousePopup('Bauschleifen leeren'));
              RecruitUnits.initSlider();
            });
      });
      this.ot.toggled = 1;
      this.toggle.find('.toggle_icon.recruit.right_d').attr('class',
          'toggle_icon recruit up_d');
      this.ot.find('.toggle_icon.beyond').attr('class',
          'toggle_icon beyond right_d');
    } else {
      RecruitUnits.otcw.empty();
      this.ot.animate({
        height : this.ot.stored_height
      }, 600, 'linear', function() {
        RecruitUnits.otcw.empty().parent().removeAttr('style');
      });
      this.ot.toggled = 0;
      this.toggle.find('.toggle_icon.recruit.up_d').attr('class',
          'toggle_icon recruit right_d');
      this.ot.find('.toggle_icon.beyond').attr('class',
          'toggle_icon beyond right_d');
      $('#recruit_tabs').unbind('click');
      $('#unit_overview_town_list').unbind('click');
      RecruitUnits.recruit_units.unbind('click');
      delete RecruitUnits.recruit_units;
      delete RecruitUnits.recruit_tabs;
      return;
    }
  },
  toggleAllTroopsOfTowns : function() {
    $('tr.place_command').each(
        function() {
          var that = this;
          $.each(GameData.units, function(type, sum) {
            $(that).find('span.count_' + type).html(
                $(that).find('span.total_count_' + type).html());
          });
        });
  },
  updateResAndQueue : function(town_id, unit_id, unit_resources,
      unit_population) {
    var input_value = $('input#town_' + town_id + '_count_' + unit_id).val();
    var wood = input_value * unit_resources.wood;
    var iron = input_value * unit_resources.iron;
    var stone = input_value * unit_resources.stone;
    var town_population = input_value * unit_population;
    var costs = {
      'wood' : wood,
      'stone' : stone,
      'iron' : iron,
      'town_population' : parseInt(town_population)
    };
    if (typeof RecruitUnits.old_value[town_id] == "undefined") {
      RecruitUnits.old_value[town_id] = [];
    }
    if (typeof RecruitUnits.old_value[town_id][unit_id] == "undefined") {
      RecruitUnits.old_value[town_id][unit_id] = 0;
    }
    $
        .each(
            costs,
            function(key, value) {
              var current_res_diff = $(
                  '#town_' + town_id + '_res .' + key + ' .diff').html();
              if (typeof unit_resources[key] == "undefined") {
                var resource_type = parseInt(unit_population);
              } else {
                var resource_type = parseInt(unit_resources[key]);
              }
              if (current_res_diff) {
                if (parseInt(input_value)) {
                  var new_res_diff = (parseInt(current_res_diff)
                      + ((parseInt(value) / parseInt(input_value)) * parseInt(RecruitUnits.old_value[town_id][unit_id])) - parseInt(value));
                } else {
                  var new_res_diff = (parseInt(current_res_diff) + (resource_type * parseInt(RecruitUnits.old_value[town_id][unit_id])));
                }
              } else {
                var new_res_diff = (0 + ((parseInt(value) / parseInt(input_value)) * parseInt(RecruitUnits.old_value[town_id][unit_id])) - parseInt(value));
              }
              $('#town_' + town_id + '_res .' + key + ' .diff').html(
                  new_res_diff);
              $('#town_' + town_id + '_res .' + key + ' .diff').css({
                display : 'block'
              });
              if (parseInt(new_res_diff) < -(parseInt($(
                  '#town_' + town_id + '_res .' + key + ' span.count').html()))) {
                $('#town_' + town_id + '_res .' + key + ' .diff').css('color',
                    '#c00');
              } else {
                $('#town_' + town_id + '_res .' + key + ' .diff').css('color',
                    '#0a0');
              }
            });
    RecruitUnits.old_value[town_id][unit_id] = input_value;
  },
  resetRecruitInTown : function(town_id) {
    $('#town_' + town_id + ' input').each(function() {
      $(this).val('');
    });
    var costs = {
      'wood' : 0,
      'stone' : 0,
      'iron' : 0,
      'town_population' : 0
    };
    $.each(costs, function(key, value) {
      $('#town_' + town_id + '_res .' + key + ' .diff').html(value);
      $('#town_' + town_id + '_res .' + key + ' .diff').css({
        display : 'none'
      });
    });
    RecruitUnits.old_value = [];
  }
};
var CultureOverview = {
  startCelebration : function(celebration_type, town_id) {
    var button = $('#town_' + town_id + ' .type_' + celebration_type);
    if (button.hasClass('disabled')) {
      return false;
    }
    var data = {};
    data.town_id = town_id;
    data.celebration_type = celebration_type;
    Ajax.post('town_overviews', 'start_celebration', data,
        function(return_data) {
          button.toggleClass('disabled');
          var town_id = return_data.town_id;
          $.each(return_data.startable_celebrations, function(type, data) {
            if (!data) {
              var tempbutton = $('#town_' + town_id + ' .type_' + type);
              if (!tempbutton.hasClass('disabled')) {
                tempbutton.addClass('disabled');
              }
            }
          });
          var item = $(
              '#town_' + town_id + '_timer_' + return_data.celebration_type
                  + '.celebration_progressbar').text(return_data.finished_at);
          item.countdown(item.html(), {});
        }.bind(button), {}, 'start_celebration');
    return false;
  }
};
var BuildingOverview = {
  buidling_data : null,
  ele : null,
  col : null,
  special : null,
  regular : null,
  res : {},
  init : function(_building_data) {
    var list = $('table#building_overview tr td.building');
    this.special = $('.special');
    this.regular = $('.regular');
    this.building_data = _building_data;
    list.bind('mouseover', function(ev) {
      BuildingOverview.ele = $('#'
          + ev.currentTarget.className.replace(' ', '_'));
      var current_target = ev.currentTarget.className;
      current_target = current_target.substr(0, current_target.indexOf(' '));
      BuildingOverview.col = $('table#building_overview tr td.'
          + current_target)
      BuildingOverview.highlightColumn(ev)
      $(ev.currentTarget).bind('mouseout', function() {
        BuildingOverview.ele.removeClass('selected');
        BuildingOverview.col.toggleClass('hover')
        $(this).unbind('mouseout')
      });
    });
  },
  highlightColumn : function(ev) {
    var t_id = ev.currentTarget.parentNode.id.replace('town_', '');
    var b_id = ev.currentTarget.className;
    b_id = b_id.substr(0, b_id.indexOf(' '));
    this.res.needed = this.building_data[t_id][b_id].resources_for;
    this.res.needed.town_population = this.building_data[t_id][b_id].population_for;
    var t_info = document
        .getElementById((ev.currentTarget.parentNode.id + '_res'));
    var res_info = t_info.getElementsByTagName('div');
    this.res.current = {
      wood : ~~($(res_info[0]).find('.count').html()),
      stone : ~~($(res_info[1]).find('.count').html()),
      iron : ~~($(res_info[2]).find('.count').html()),
      town_population : ~~(res_info[3].innerHTML.replace(/<.*>/g, ''))
    };
    var i = 0;
    for ( var key in this.res.needed) {
      if (this.res.current[key] < this.res.needed[key]) {
        $(res_info[i]).find('.diff').addClass('notenough');
      } else {
        $(res_info[i]).find('.diff').removeClass('notenough');
      }
      $(res_info[i]).find('.diff').html('-' + this.res.needed[key]);
      i++;
    }
    this.col.toggleClass('hover')
    this.ele.addClass('selected');
  },
  updateResAndLevel : function(t_id, object) {
    var t_info = $('#town_' + t_id + '_res');
    var res_info = t_info.find('.count');
    var i = 0;
    for ( var key in this.res.current) {
      $(res_info[i]).html((this.res.current[key] - this.res.needed[key]));
      if (this.res.needed[key] > 0) {
        $(res_info[i]).removeClass('town_storage_full');
      }
      i++;
    }
    var lvl = ~~(object.parentNode.getElementsByTagName('a')[1].innerHTML
        .replace(/\W/g, ''));
    object.parentNode.getElementsByTagName('a')[1].innerHTML = lvl + 1;
    $(t_info).animate({
      color : '#0a0'
    }, 250, function() {
      $(this).animate({
        color : '#000'
      })
    })
  },
  build : function(building_id, town_id, tear_down, object) {
    var data = {};
    data.building_id = building_id;
    data.town_id = town_id;
    data.tear_down = tear_down ? 1 : 0;
    if ($(object).hasClass('disabled')) {
      return false;
    }
    Ajax.post('town_overviews', 'build_building', data, function(data, flag) {
      if (!tear_down) {
        BuildingOverview.updateResAndLevel(town_id, object);
      }
    });
    return false;
  },
  toggleSpecialBuildings : function(ele) {
    if (this.special == null && this.regular == null) {
      this.special = $('.special');
      this.regular = $('.regular');
    }
    if (this.special.is(':hidden')) {
      ele.className = 'game_arrow_left';
      this.special.show();
      this.regular.css({
        display : 'none'
      });
    } else {
      ele.className = 'game_arrow_right';
      this.regular.show();
      this.special.css({
        display : 'none'
      });
    }
  }
};
var GodsOverview = {
  current_town_id : null,
  c_width : 720,
  c_height : 330,
  powers : null,
  units : [],
  town_temple_level : null,
  town_god : null,
  favor : null,
  init : function(powers, _units) {
    GodsOverview.powers = powers;
    GodsOverview.units = _units;
    $.each(GameData.units, function(unit) {
      $(".unit_" + unit).setPopup(unit);
    });
    $.each(powers, function(index, power) {
      $("#" + index).setPopup(index);
    });
    $('#gods_overview_towns').bind('click', function(event) {
      GodsOverview.selectTown(event);
      event.stopPropagation();
    });
    GodsOverview.initGodPopups();
    $('.town_statue').mousePopup(new MousePopup('Statue gebaut'));
    $('.town_statue_disabled').mousePopup(
        new MousePopup('Keine Statue vorhanden'));
    $('.town_temple_level').mousePopup(new MousePopup('Stufe des Tempels'));
    $('.town_temple_level_disabled').mousePopup(
        new MousePopup('Kein Tempel gebaut'));
  },
  initGodPopups : function() {
    $('.town_god_zeus').mousePopup(
        new MousePopup('<span class="bold">' + 'Zeus' + '</span>'));
    $('.town_god_athena').mousePopup(
        new MousePopup('<span class="bold">' + 'Athene' + '</span>'));
    $('.town_god_hera').mousePopup(
        new MousePopup('<span class="bold">' + 'Hera' + '</span>'));
    $('.town_god_poseidon').mousePopup(
        new MousePopup('<span class="bold">' + 'Poseidon' + '</span>'));
    $('.town_god').mousePopup(new MousePopup('Kein Gott ausgewählt'));
  },
  selectTown : function(ev) {
    var ele = ev.originalTarget || ev.srcElement;
    if (ele.tagName == 'A') {
      return;
    }
    while (ele.parentNode != null
        && (ele.parentNode.tagName != 'UL' || ele.parentNode.id
            .indexOf('wrapper') != -1)) {
      if (ele.className.indexOf('place_unit') != -1) {
        preselect = ele.className.replace('place_unit unit_', '');
      }
      ele = ele.parentNode;
    }
    this.current_town_id = ~~(ele.id.replace(/\D+/g, ''));
    var self = $(ele);
    if (!self.hasClass('selected')) {
      var p = self.position();
      self.attr('style', 'position:absolute;left:' + (p.left + 10) + 'px;top:'
          + p.top + 'px;z-index:5;');
      self.animate({
        left : 10,
        top : self.parent().parent().scrollTop(),
        width : this.c_width,
        height : this.c_height
      }, 500, function() {
        GodsOverview.showAvailablePowers(GodsOverview.current_town_id);
        if (GodsOverview.town_temple_level[GodsOverview.current_town_id] > 0) {
          $('#gods_overview_chose_god').show();
        }
      });
      self.addClass('selected');
    } else {
      self.removeAttr('style').removeClass('selected');
      GodsOverview.hideAvailablePowers(GodsOverview.current_town_id);
      $('#gods_overview_chose_god').hide();
    }
  },
  hideAvailablePowers : function(town_id) {
    $('#gods_overview_castable_powers').hide();
  },
  showAvailablePowers : function(town_id) {
    $('#town_center_' + town_id).append(
        $('#gods_overview_castable_powers').show());
  },
  updateFavorBar : function(favor) {
    $.each(favor, function(index, value) {
      var old_value = $("#" + index + " .god_favor_text").text();
      $("#" + index + " .god_favor_text").text(value);
      if (value < old_value) {
        $("#" + index + " .favor_full").toggleClass('favor_full favor');
      }
    });
  },
  updateTownsCastedPowers : function(town_id, power, finished_at) {
    $('#casted_powers_town_' + town_id)
        .append(
            '<span class="casted_power_'
                + power
                + '" id="cp_town_'
                + town_id
                + '_'
                + power
                + '"><img src="http://static.grepolis.com/images/game/towninfo/powers/'
                + power + '_24x24.png" height="12" width="12" /></span>');
    Layout.initializePowerPopupForTownOverview(power, town_id, finished_at);
  },
  askForChange : function(data) {
    Layout
        .showHint(
            '%s anbeten'.replace('%s', data.new_god_name),
            '<p>'
                + 'Der Wechsel zu %s hat folgende Auswirkungen:'.replace('%s',
                    data.new_god_name)
                + '</p>'
                + '<ul class="temple_list">'
                + (GodsOverview.town_gods[data.town_id] != null ? '<li>'
                    + 'Du verlierst alle mythologischen Einheiten dieser Stadt.'
                    + '</li>'
                    : '')
                + '<li>'
                + 'Unterstützende Truppen mit mythologischen Einheiten verlassen die Stadt.'
                + '</li>'
                + (GodsOverview.town_gods[data.town_id] != null ? '<li>'
                    + 'Du verlierst %d Gunst bei %s.'
                        .replace(
                            '%s',
                            GodsOverview.favor[GodsOverview.town_gods[data.town_id]].god)
                        .replace(
                            '%d',
                            GodsOverview.favor[GodsOverview.town_gods[data.town_id]].current)
                    + '</li>'
                    : '')
                + '</ul>'
                + '<a class="button" onclick="GodsOverview.changeGod('
                + data.town_id
                + ',\''
                + data.new_god_id
                + '\', \''
                + GodsOverview.town_gods[data.town_id]
                + '\')"><span class="left"><span class="right"><span class="middle">'
                + 'Wechseln' + '</span></span></span>'
                + '<span style="clear:both;"></span></a><br /><br /><br />');
  },
  changeGod : function(town_id, new_god_id, old_god_id) {
    Ajax
        .post(
            'town_overviews',
            'change_god',
            {
              'town_id' : town_id,
              'god_id' : new_god_id
            },
            function(data) {
              GodsOverview.town_gods[town_id] = new_god_id;
              $('#player_hint_area').remove();
              Layout.updateBar(data.bar);
              $('#town_' + town_id + ' .current_myth_units.town_inner_field')
                  .html('Keine myth. Einheiten vorhanden');
              $('#town_' + town_id).find('.god_micro').attr('class',
                  'god_micro town_god_' + new_god_id);
              GodsOverview.initGodPopups();
              if (typeof GodsOverview.favor[old_god_id] != "undefined") {
                GodsOverview.favor[old_god_id].current = 0;
              }
              var powers_html = '';
              $
                  .each(
                      data.available_powers,
                      function(key, power) {
                        powers_html += '<div class="power">'
                            + '<a href="#" class="power_icon'
                            + (GodsOverview.favor[power.god_id].current < power.favor ? ' disabled'
                                : '')
                            + '"'
                            + 'onclick="TownInfo.castPower({power: \'power.id\', town_id: GodsOverview.current_town_id, castedFromGodsOverview: true})"'
                            + 'id="' + power.id + '"></a>' + '</div>';
                      });
              $('#castable_powers').html(powers_html);
              $.each(data.available_powers, function(index, power) {
                $("#" + index).setPopup(index);
              });
            });
  }
};
var Sort = {
  sort_by : null,
  sortBy : function(string) {
    this.sort_by = string;
  },
  sortedBy : function(string) {
    return this.sort_by == string;
  },
  qsort : function(array) {
    var greater = new Array(), less = new Array();
    if (array.length <= 1) {
      return array;
    } else {
      var index = Math.floor(Math.random() * (array.length - 1));
      var pivot = array[index];
      array.splice(index, 1);
      for ( var i = 0; i < array.length; i++) {
        var obj = array[i];
        var x = $(obj).find('span.sortable.' + this.sort_by).text();
        var y = $(pivot).find('span.sortable.' + this.sort_by).text();
        if (x.isLTE(y)) {
          less.push(obj);
        } else {
          greater.push(obj);
        }
      }
      return (this.qsort(less).concat(pivot)).concat(this.qsort(greater));
    }
  }
};
var HidesOverview = {
  help : false,
  popup : $('<div id="overview_help" class="small"><div class="top"></div><div class="middle"></div><div class="bottom"></div></div>'),
  init : function() {
    $('#buttons .cancel').mousePopup(new MousePopup('zurücksetzen'));
    $('#buttons .confirm').mousePopup(new MousePopup('Silbermünzen einlagern'));
    $('.help').mousePopup(new MousePopup('Hilfe anzeigen'));
  },
  clearSelection : function(town_id) {
    $('#town_hide_' + town_id).val(0);
  },
  storeIronInTown : function(town_id) {
    var iron_to_store = $('#town_hide_' + town_id).val();
    var value = $('#town_' + town_id + ' ' + 'span.eta').html();
    var current_iron_stored = value.substr(1, (value.indexOf('/') - 1));
    var max_storage = value.substr(value.indexOf('/') + 1, (value
        .lastIndexOf(')') - 1 - value.indexOf('/')));
    if (iron_to_store == 0 || '') {
      HumanMessage.error('Du musst mindestens eine Silbermünze einlagern.');
      return;
    } else {
      Ajax.post('town_overviews', 'store_iron', {
        'town_id' : town_id,
        'iron_to_store' : iron_to_store
      }, function(data) {
        Layout.towns[town_id].resources.iron = data.iron;
        var elem = $('#town_' + town_id + '_res .iron');
        elem.removeClass('town_storage_full');
        elem.html(Layout.towns[town_id].resources.iron);
        $('#town_' + town_id + ' ' + 'span.eta').html(
            '(' + (data.iron_stored + parseInt(current_iron_stored)) + '/'
                + max_storage + ')');
        $('#town_' + town_id + ' ' + 'div#bar').css(
            'width',
            ((data.iron_stored + parseInt(current_iron_stored))
                / parseInt(max_storage) * 100)
                + '%');
        HidesOverview.clearSelection(town_id);
        if (data.bar != '') {
          Layout.updateBar(data.bar);
        }
      });
    }
  },
  showHelp : function(town_id, step) {
    if (typeof (step) == 'undefined') {
      if (this.help) {
        this.hideHelp();
        return;
      } else {
        step = 0;
      }
    }
    this.popup.appendTo('body');
    switch (step) {
    case 0:
      this.help = true;
      this.clearSelection();
      var anchor = $('#town_hide_' + town_id);
      if (anchor.length == 0) {
        var anchor = $('#no_hide_' + town_id);
        this.popup.children('.middle').text(
            'Du musst in dieser Stadt noch eine Höhle bauen.');
      } else {
        this.popup
            .children('.middle')
            .text(
                'Gib die Anzahl der Silbermünzen ein und bestätige die Eingabe mit dem grünen Pfeil.');
      }
      this.popup.addClass('top_align').css({
        top : (anchor.offset().top + 15) + 'px',
        left : anchor.offset().left + 'px'
      }).show();
      break;
    default:
      TradeOverview.hideHelp();
      break;
    }
  },
  hideHelp : function() {
    this.help = false;
    this.popup.hide().remove();
  }
}