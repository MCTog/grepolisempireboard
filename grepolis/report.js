var Reports = {
	folder_id : null,
	markAll : function(status) {
		$(".reports_date INPUT[type='checkbox']").attr('checked', status);
	},
	markAllFarmReports : function(status) {
		$(".farm_reports_date INPUT[type='checkbox']").attr('checked', status);
	},
	markAllResourceTransportReports : function(status) {
		$(".resource_transport_reports_date INPUT[type='checkbox']").attr(
				'checked', status);
	},
	toggleMenu : function(id1, id2) {
		var elmnt = $(id1);
		var list = $(id2);
		var nodes = $('#folder_menu').children('.folder').length;
		var max_height_top = nodes % 4 == 0 ? nodes * 8
				: ((nodes - nodes % 4) + 4) * 8;
		var max_height_bottom = 280;
		var ie6 = navigator.userAgent.toLowerCase().indexOf('msie 6') > -1;
		if (elmnt.css('visibility') != 'hidden' && !ie6) {
			elmnt.animate( {
				maxHeight : "0px"
			}, 'fast', function() {
				elmnt.css('visibility', 'hidden');
			});
			list.animate( {
				maxHeight : max_height_bottom + "px"
			}, 'fast');
		} else if (!ie6) {
			elmnt.css('visibility', 'visible');
			list.animate( {
				maxHeight : max_height_bottom - max_height_top + "px"
			}, 'normal');
			elmnt.animate( {
				maxHeight : max_height_top + "px"
			}, 'normal');
		} else if (elmnt.css('visibility') != 'hidden') {
			elmnt.animate( {
				height : "0px"
			}, 'normal', function() {
				elmnt.css('visibility', 'hidden');
			});
			list.animate( {
				height : max_height_bottom + "px"
			}, 'normal');
		} else {
			elmnt.css('visibility', 'visible');
			list.animate( {
				height : max_height_bottom - max_height_top - 16 + "px"
			}, 'normal');
			elmnt.animate( {
				height : max_height_top + 16 + "px"
			}, 'normal');
		}
	},
	changeFolder : function(folder_id) {
		Reports.folder_id = folder_id;
		var params = {
			folder_id : folder_id
		};
		window.location.href = url('report', '', params);
	},
	moveItemsToFolder : function(folder_id) {
		$('#move_to_folder_id').attr('value', folder_id);
		return submit_form('report_form', 'report', 'move');
	},
	moveItemToFolder : function(report_id, folder_id) {
		Ajax.post('report', 'move_report', {
			report_id : report_id,
			folder_id : folder_id
		}, function(data) {
		}, {}, 'move_report');
	},
	editFolder : function(folder_id) {
		Reports.folder_id = folder_id;
		var params = {
			folder_id : folder_id
		};
		$('#folder_name_' + folder_id).css('display', 'block');
		$('#save_folder_name_' + folder_id).css('display', 'block')
		$('#folder_link_' + folder_id).css('display', 'none');
		Ajax.post('report', 'getFolder', params, function(data) {
			$('#folder_name_' + folder_id).val(data.name);
		}, {}, 'report_folder_lock');
		return false;
	},
	saveFolder : function() {
		var params = {
			folder_id : Reports.folder_id,
			name : $('#folder_name_' + Reports.folder_id).val()
		};
		Ajax.post('report', 'saveFolder', params, function(data) {
			window.location.href = url('report', 'folder');
		}, {}, 'report_folder_lock');
	},
	newFolder : function() {
		var params = {
			folder_id : Reports.folder_id,
			name : $('#new_folder_name').val()
		};
		Ajax.post('report', 'saveFolder', params, function(data) {
			window.location.href = url('report', 'folder');
		}, {}, 'message_folder_lock');
	},
	delFolder : function(folder_id) {
		var params = {
			folder_id : folder_id
		};
		Ajax.post('report', 'delFolder', params, function(data) {
			window.location.href = url('report', 'folder');
		}, {}, 'report_folder_lock');
	},
	saveFilter : function() {
		var params = {
			farm_town_attack_without_casualties : $(
					'#farm_town_attack_without_casualties_filter').attr(
					'checked'),
			trade : $('#trade_filter').attr('checked'),
			animated_combat : $('#animated_combat_filter').attr('checked'),
			indicator_farm_town_attack_without_casualties : $(
					'#indicator_farm_town_attack_without_casualties_filter')
					.attr('checked'),
			indicator_trade : $('#indicator_trade_filter').attr('checked')
		};
		Ajax.post('report', 'saveFilter', params, function(data) {
		}, {}, 'report_filter_lock');
	},
	deleteReport : function(report_id) {
		return submit_post('report', 'delete', {
			'report_id' : report_id
		});
	},
	publishReportDialog : function(report_id) {
		Ajax.post('report', 'publish_report_dialog', {
			'report_id' : report_id
		}, function(data) {
			Reports.showPublishReportDialog(data.html);
		}, {});
		return false;
	},
	showPublishReportDialog : function(html) {
		var dialog_id = 'report_publish_dialog', dialog_size = {
			'w' : 520,
			'h' : 404
		}, div = $('#' + dialog_id);
		if (!div.length) {
			div = $('<div id="' + dialog_id + '"></div>');
			div.css( {
				'position' : 'absolute',
				'width' : dialog_size.w,
				'height' : dialog_size.h,
				'top' : ($('#content').outerHeight() - dialog_size.h) / 2,
				'left' : ($('#content').outerWidth() - dialog_size.w) / 2,
				'zIndex' : '10'
			});
			div.html(tmpl(dialog_id + '_tmpl', {}));
			div.appendTo("#content");
		}
		$('#' + dialog_id + ' .new_window_content_content').html(html);
		$('#' + dialog_id + ' a.cancel').click(function() {
			$('#' + dialog_id).remove();
		});
		$('#' + dialog_id + ' input#publish_report_show_all').click(
				function(evt) {
					$('#' + dialog_id + ' #publish_report_options input').attr(
							'checked', $(evt.target).attr('checked'));
				});
		$('#' + dialog_id + ' #publish_report_options input').click(
				function(evt) {
					$('#' + dialog_id + ' input#publish_report_show_all').attr(
							'checked', false);
				});
		div.show();
	},
	publishReport : function() {
		var params = {};
		$('#publish_report_dialog_form input[type="checkbox"]').each(
				function(idx, elm) {
					params[elm.name] = $(elm).attr('checked');
				});
		$('#publish_report_dialog_form input[type="hidden"]').each(
				function(idx, elm) {
					params[elm.name] = $(elm).val();
				});
		Ajax.post('report', 'publish_report', params, function(data) {
			Reports.showPublishReportDialog(data.html);
		}, {});
		return false;
	},
	unpublishReport : function() {
		var params = {};
		$('#publish_report_dialog_form input[type="hidden"]').each(
				function(idx, elm) {
					params[elm.name] = $(elm).val();
				});
		Ajax.post('report', 'unpublish_report', params, function(data) {
			$('#report_publish_dialog').remove();
			document.location.reload();
		}, {});
		return false;
	}
}