var UnitOrder = {
    unit_id: '',
    slider: null,
    units: null,
    orders: null,
    barracks: false,
    firstOrderCompletedAt: null,
    init: function (units, orders, barracks, selected_unit_id) {
        this.units = units;
        this.orders = orders;
        this.barracks = barracks;
        this.initSlider();
        this.selectUnit(selected_unit_id);
        this.bindForm();
        this.updateOrders();
        $('#current_building_order_queue_count').text(this.orders.length);
        $.each(GameData.units, function (unit) {
            $("#" + unit).setPopup(unit);
        });
    },
    selectUnit: function (unit_id) {
        this.unit_id = unit_id;
        var unit = UnitOrder.units[unit_id];
        this.showUnit(unit);
        $('.unit_active').removeClass('unit_active');
        $('#unit_order_tab_' + unit_id).addClass('unit_active');
    },
    changeCount: function (e) {
        var count = parseInt($('#unit_order_input')[0].value);
        if (isNaN(count)) {
            return;
        }
        var unit = UnitOrder.units[this.unit_id];
        this.showCosts(unit, count);
        $('#unit_order_confirm').css('visibility', count ? '' : 'hidden');
    },
    initSlider: function () {
        var element_slider = $('#unit_order_slider');
        this.slider = new Slider({
            elementMin: $('#unit_order_min'),
            elementMax: $('#unit_order_max'),
            elementDown: $('#unit_order_down'),
            elementUp: $('#unit_order_up'),
            elementInput: $('#unit_order_input'),
            elementSlider: element_slider
        });
        element_slider.bind('change', function () {
            UnitOrder.changeCount(UnitOrder.slider.getValue());
        });
    },
    showUnit: function (unit) {
        $('#unit_order_unit_name').text(unit.name);
        $('#unit_order_unit_hidden')[0].value = unit.id;
        try {
            this.slider.setMax(unit.max_build);
            this.slider.setValue(unit.max_build);
        } catch (e) {}
        var dependencies = $('#unit_order_dependencies');
        if ($(unit.missing_building_dependencies).length || $(unit.missing_research_dependencies).length) {
            dependencies.show();
            var research_text = '';
            var building_text = '';
            if (unit.missing_building_dependencies) {
                jQuery.each(unit.missing_building_dependencies, function (name, level) {
                    building_text += name + ': ' + level + '\n';
                });
            }
            if (unit.missing_research_dependencies.length) {
                research_text = 'Forschung:' + ' ' + unit.missing_research_dependencies.join(', ');
            }
            $('#unit_order_dependencies').text('Benötigt:' + '\n' + building_text + research_text);
        } else {
            dependencies.hide();
        }
        $('#unit_order_unit_big_image').attr('src', Game.img() + '/game/units/' + unit.id + '_90x90.jpg');
        $('#unit_order_unit_big_image').setPopup(unit.id + '_details');
        $('#unit_order_unit_wood').text(unit.resources.wood);
        $('#unit_order_unit_stone').text(unit.resources.stone);
        $('#unit_order_unit_iron').text(unit.resources.iron);
        $('#unit_order_unit_favor').text(unit.favor);
        $('#unit_order_unit_pop').text(unit.population);
        $('#unit_order_unit_build_time').text(readableSeconds(unit.build_time));
        $('#unit_order_att').attr('class', 'unit_order_att_' + unit.attack_type);
        $('#unit_order_unit_attack').text(unit.attack);
        $('#unit_order_unit_speed').text(unit.speed);
        if (unit.attack_type != undefined) {
            $('#unit_order_att').setPopup('unit_type_' + unit.attack_type);
        }
        $('#unit_order_unit_transport').text(unit.capacity);
        $('#unit_order_unit_defense').text(unit.defense);
        $('#unit_order_unit_booty').text(unit.booty);
        $('#unit_order_unit_def_hack').text(unit.def_hack);
        $('#unit_order_unit_def_pierce').text(unit.def_pierce);
        $('#unit_order_unit_def_distance').text(unit.def_distance);
    },
    showCosts: function (unit, count) {
        for (res_id in unit.resources) {
            var value = unit.resources[res_id] * count;
            $('#unit_order_all_' + res_id).text(value);
        }
        $('#unit_order_all_pop').text(unit.population * count);
        $('#unit_order_all_favor').text(unit.favor * count);
        $('#unit_order_all_build_time').text(
        readableSeconds(unit.build_time * count));
    },
    updateCounts: function (units) {
        for (var i in units) {
            var unit = units[i];
            $('#unit_order_max_build_' + unit.id).html('+' + unit.max_build);
            $('#unit_order_count_' + unit.id).html(unit.count);
            $('#unit_order_count_shadow_' + unit.id).html(unit.count);
        }
    },
    bindForm: function () {
        var options = {
            dataType: 'json',
            beforeSubmit: function () {
                $('#unit_order_confirm').hide();
                return parseInt($('#unit_order_input')[0].value) > 0;
            },
            complete: function () {
                $('#unit_order_confirm').show();
            },
            success: function (data) {
                UnitOrder.orders = data.orders;
                UnitOrder.updateOrders();
                UnitOrder.units = data.units;
                var unit = UnitOrder.units[UnitOrder.unit_id];
                UnitOrder.showUnit(unit);
                UnitOrder.updateCounts(data.units);
            }
        }
        $('#unit_order_count').ajaxForm(options);
    },
    updateOrders: function () {
        $('#tasks').html(tmpl("orders_tmpl", {
            orders: UnitOrder.orders,
            barracks: UnitOrder.barracks
        }));
        var order;
        for (i in UnitOrder.orders) {
            order = UnitOrder.orders[i];
            $('#unit_order_' + i + ' .unit_order_task_time').mousePopup(
            new MousePopup(
            s('Fertigstellung %1', order.completed_human)));
            if (order.refund) {
                var r = order.refund;
                var content = s('Rückerstattung Holz: %1 Stein: %2 Silbermünzen: %3 Gunst: %4', r.resources.wood, r.resources.stone, r.resources.iron, r.favor);
                $('#unit_order_' + i + ' .unit_order_cancel').mousePopup(
                new MousePopup(content));
            }
        }
        var unit_order_current = $('#unit_order_0 .unit_order_task_time');
        if (unit_order_current.length > 0 && this.orders[0].units_left > 0) {
            order = this.orders[0];
            var completed_at = order.to_be_completed_at;
            var units_left = order.units_left;
            var build_time = UnitOrder.units[order.unit_id].build_time;
            var start_time_unit = completed_at - (units_left * build_time);
            var end_time_units = completed_at - ((units_left - 1) * build_time);
            ImageCountdown.start(unit_order_current, start_time_unit, end_time_units, {
                'width': '50px',
                'height': '50px',
                'top': 22,
                'left': 21
            }, {
                'width': '50px',
                'height': '3200px'
            });
            unit_order_current.countdown(completed_at, {});
            unit_order_current.bind('finish', function () {
                UnitOrder.finishHandler();
            });
            this.orders[0].units_left--;
            this.orders[0].seconds_left -= build_time;
        }
        $('#current_building_order_queue_count').text(this.orders.length);
    },
    finishHandler: function () {
        Ajax.get(null, 'load', {}, function (data) {
            this.orders = data.orders;
            this.units = data.units;
            this.updateOrders();
            this.updateCounts(data.units);
        }.bind(this));
    },
    togglePossible: function () {
        if ($('#unit_order_show_values').hasClass('unit_order_hide_values')) {
            $('#fight_values_box').fadeOut();
        } else {
            $('#fight_values_box').fadeIn();
        }
        $('#unit_order_show_values').toggleClass('unit_order_hide_values');
    },
    toggleUnits: function () {
        var unit_order_show = $('#unit_order_show');
        if (unit_order_show.hasClass('unit_order_hide')) {
            unit_order_show.mousePopup(new MousePopup('<h4>' + 'Nur erforschte Einheiten anzeigen.' + '</h4>'));
            $('.unit_tab').fadeOut();
        } else {
            unit_order_show.mousePopup(new MousePopup('<h4>' + 'Alle Einheiten anzeigen.' + '</h4>'));
            $('.unit_tab').fadeIn();
        }
        unit_order_show.toggleClass('unit_order_hide');
    }
}