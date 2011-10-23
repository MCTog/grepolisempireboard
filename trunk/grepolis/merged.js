;
(function ($) {
    $.fn.extend({
        autocomplete: function (urlOrData, options) {
            var isUrl = typeof urlOrData == "string";
            options = $.extend({}, $.Autocompleter.defaults, {
                url: isUrl ? urlOrData : null,
                data: isUrl ? null : urlOrData,
                delay: isUrl ? $.Autocompleter.defaults.delay : 10,
                max: options && !options.scroll ? 10 : 150
            }, options);
            options.highlight = options.highlight ||
            function (value) {
                return value;
            };
            options.formatMatch = options.formatMatch || options.formatItem;
            return this.each(function () {
                new $.Autocompleter(this, options);
            });
        },
        result: function (handler) {
            return this.bind("result", handler);
        },
        search: function (handler) {
            return this.trigger("search", [handler]);
        },
        flushCache: function () {
            return this.trigger("flushCache");
        },
        setOptions: function (options) {
            return this.trigger("setOptions", [options]);
        },
        unautocomplete: function () {
            return this.trigger("unautocomplete");
        }
    });
    $.Autocompleter = function (input, options) {
        var KEY = {
            UP: 38,
            DOWN: 40,
            DEL: 46,
            TAB: 9,
            RETURN: 13,
            ESC: 27,
            COMMA: 188,
            PAGEUP: 33,
            PAGEDOWN: 34,
            BACKSPACE: 8
        };
        var $input = $(input).attr("autocomplete", "off").addClass(options.inputClass);
        var timeout;
        var previousValue = "";
        var cache = $.Autocompleter.Cache(options);
        var hasFocus = 0;
        var lastKeyPressCode;
        var config = {
            mouseDownOnSelect: false
        };
        var select = $.Autocompleter.Select(options, input, selectCurrent, config);
        var blockSubmit;
        $.browser.opera && $(input.form).bind("submit.autocomplete", function () {
            if (blockSubmit) {
                blockSubmit = false;
                return false;
            }
        });
        $input.bind(($.browser.opera ? "keypress" : "keydown") + ".autocomplete", function (event) {
            hasFocus = 1;
            lastKeyPressCode = event.keyCode;
            switch (event.keyCode) {
            case KEY.UP:
                event.preventDefault();
                if (select.visible()) {
                    select.prev();
                } else {
                    onChange(0, true);
                }
                break;
            case KEY.DOWN:
                event.preventDefault();
                if (select.visible()) {
                    select.next();
                } else {
                    onChange(0, true);
                }
                break;
            case KEY.PAGEUP:
                event.preventDefault();
                if (select.visible()) {
                    select.pageUp();
                } else {
                    onChange(0, true);
                }
                break;
            case KEY.PAGEDOWN:
                event.preventDefault();
                if (select.visible()) {
                    select.pageDown();
                } else {
                    onChange(0, true);
                }
                break;
            case options.multiple && $.trim(options.multipleSeparator) == "," && KEY.COMMA:
            case KEY.TAB:
            case KEY.RETURN:
                if (selectCurrent()) {
                    event.preventDefault();
                    blockSubmit = true;
                    return false;
                }
                break;
            case KEY.ESC:
                select.hide();
                break;
            default:
                clearTimeout(timeout);
                timeout = setTimeout(onChange, options.delay);
                break;
            }
        }).focus(function () {
            hasFocus++;
        }).blur(function () {
            hasFocus = 0;
            if (!config.mouseDownOnSelect) {
                hideResults();
            }
        }).click(function () {
            if (hasFocus++ > 1 && !select.visible()) {
                onChange(0, true);
            }
        }).bind("search", function () {
            var fn = (arguments.length > 1) ? arguments[1] : null;

            function findValueCallback(q, data) {
                var result;
                if (data && data.length) {
                    for (var i = 0; i < data.length; i++) {
                        if (data[i].result.toLowerCase() == q.toLowerCase()) {
                            result = data[i];
                            break;
                        }
                    }
                }
                if (typeof fn == "function") fn(result);
                else $input.trigger("result", result && [result.data, result.value]);
            }
            $.each(trimWords($input.val()), function (i, value) {
                request(value, findValueCallback, findValueCallback);
            });
        }).bind("flushCache", function () {
            cache.flush();
        }).bind("setOptions", function () {
            $.extend(options, arguments[1]);
            if ("data" in arguments[1]) cache.populate();
        }).bind("unautocomplete", function () {
            select.unbind();
            $input.unbind();
            $(input.form).unbind(".autocomplete");
        });

        function selectCurrent() {
            var selected = select.selected();
            if (!selected) return false;
            var v = selected.result;
            previousValue = v;
            if (options.multiple) {
                var words = trimWords($input.val());
                if (words.length > 1) {
                    var seperator = options.multipleSeparator.length;
                    var cursorAt = $(input).selection().start;
                    var wordAt, progress = 0;
                    $.each(words, function (i, word) {
                        progress += word.length;
                        if (cursorAt <= progress) {
                            wordAt = i;
                            return false;
                        }
                        progress += seperator;
                    });
                    words[wordAt] = v;
                    v = words.join(options.multipleSeparator);
                }
                v += options.multipleSeparator;
            }
            $input.val(v);
            hideResultsNow();
            $input.trigger("result", [selected.data, selected.value]);
            return true;
        }

        function onChange(crap, skipPrevCheck) {
            if (lastKeyPressCode == KEY.DEL) {
                select.hide();
                return;
            }
            var currentValue = $input.val();
            if (!skipPrevCheck && currentValue == previousValue) return;
            previousValue = currentValue;
            currentValue = lastWord(currentValue);
            if (currentValue.length >= options.minChars) {
                $input.addClass(options.loadingClass);
                if (!options.matchCase) currentValue = currentValue.toLowerCase();
                request(currentValue, receiveData, hideResultsNow);
            } else {
                stopLoading();
                select.hide();
            }
        };

        function trimWords(value) {
            if (!value) return [""];
            if (!options.multiple) return [$.trim(value)];
            return $.map(value.split(options.multipleSeparator), function (word) {
                return $.trim(value).length ? $.trim(word) : null;
            });
        }

        function lastWord(value) {
            if (!options.multiple) return value;
            var words = trimWords(value);
            if (words.length == 1) return words[0];
            var cursorAt = $(input).selection().start;
            if (cursorAt == value.length) {
                words = trimWords(value)
            } else {
                words = trimWords(value.replace(value.substring(cursorAt), ""));
            }
            return words[words.length - 1];
        }

        function autoFill(q, sValue) {
            if (options.autoFill && (lastWord($input.val()).toLowerCase() == q.toLowerCase()) && lastKeyPressCode != KEY.BACKSPACE) {
                $input.val($input.val() + sValue.substring(lastWord(previousValue).length));
                $(input).selection(previousValue.length, previousValue.length + sValue.length);
            }
        };

        function hideResults() {
            clearTimeout(timeout);
            timeout = setTimeout(hideResultsNow, 200);
        };

        function hideResultsNow() {
            var wasVisible = select.visible();
            select.hide();
            clearTimeout(timeout);
            stopLoading();
            if (options.mustMatch) {
                $input.search(function (result) {
                    if (!result) {
                        if (options.multiple) {
                            var words = trimWords($input.val()).slice(0, -1);
                            $input.val(words.join(options.multipleSeparator) + (words.length ? options.multipleSeparator : ""));
                        }
                        else {
                            $input.val("");
                            $input.trigger("result", null);
                        }
                    }
                });
            }
        };

        function receiveData(q, data) {
            if (data && data.length && hasFocus) {
                stopLoading();
                select.display(data, q);
                autoFill(q, data[0].value);
                select.show();
            } else {
                hideResultsNow();
            }
        };

        function request(term, success, failure) {
            if (!options.matchCase) term = term.toLowerCase();
            var data = cache.load(term);
            if (data && data.length) {
                success(term, data);
            } else if ((typeof options.url == "string") && (options.url.length > 0)) {
                var extraParams = {
                    timestamp: +new Date()
                };
                $.each(options.extraParams, function (key, param) {
                    extraParams[key] = typeof param == "function" ? param() : param;
                });
                $.ajax({
                    mode: "abort",
                    port: "autocomplete" + input.name,
                    dataType: options.dataType,
                    url: options.url,
                    data: $.extend({
                        q: lastWord(term),
                        limit: options.max
                    }, extraParams),
                    success: function (data) {
                        var parsed = options.parse && options.parse(data) || parse(data);
                        cache.add(term, parsed);
                        success(term, parsed);
                    }
                });
            } else {
                select.emptyList();
                failure(term);
            }
        };

        function parse(data) {
            var parsed = [];
            var rows = data.split("\n");
            for (var i = 0; i < rows.length; i++) {
                var row = $.trim(rows[i]);
                if (row) {
                    row = row.split("|");
                    parsed[parsed.length] = {
                        data: row,
                        value: row[0],
                        result: options.formatResult && options.formatResult(row, row[0]) || row[0]
                    };
                }
            }
            return parsed;
        };

        function stopLoading() {
            $input.removeClass(options.loadingClass);
        };
    };
    $.Autocompleter.defaults = {
        inputClass: "ac_input",
        resultsClass: "ac_results",
        loadingClass: "ac_loading",
        minChars: 1,
        delay: 400,
        matchCase: false,
        matchSubset: true,
        matchContains: false,
        cacheLength: 10,
        max: 100,
        mustMatch: false,
        extraParams: {},
        selectFirst: true,
        formatItem: function (row) {
            return row[0];
        },
        formatMatch: null,
        autoFill: false,
        width: 0,
        multiple: false,
        multipleSeparator: ", ",
        highlight: function (value, term) {
            return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
        },
        scroll: true,
        scrollHeight: 180
    };
    $.Autocompleter.Cache = function (options) {
        var data = {};
        var length = 0;

        function matchSubset(s, sub) {
            if (!options.matchCase) s = s.toLowerCase();
            var i = s.indexOf(sub);
            if (options.matchContains == "word") {
                i = s.toLowerCase().search("\\b" + sub.toLowerCase());
            }
            if (i == -1) return false;
            return i == 0 || options.matchContains;
        };

        function add(q, value) {
            if (length > options.cacheLength) {
                flush();
            }
            if (!data[q]) {
                length++;
            }
            data[q] = value;
        }

        function populate() {
            if (!options.data) return false;
            var stMatchSets = {},
                nullData = 0;
            if (!options.url) options.cacheLength = 1;
            stMatchSets[""] = [];
            for (var i = 0, ol = options.data.length; i < ol; i++) {
                var rawValue = options.data[i];
                rawValue = (typeof rawValue == "string") ? [rawValue] : rawValue;
                var value = options.formatMatch(rawValue, i + 1, options.data.length);
                if (value === false) continue;
                var firstChar = value.charAt(0).toLowerCase();
                if (!stMatchSets[firstChar]) stMatchSets[firstChar] = [];
                var row = {
                    value: value,
                    data: rawValue,
                    result: options.formatResult && options.formatResult(rawValue) || value
                };
                stMatchSets[firstChar].push(row);
                if (nullData++ < options.max) {
                    stMatchSets[""].push(row);
                }
            };
            $.each(stMatchSets, function (i, value) {
                options.cacheLength++;
                add(i, value);
            });
        }
        setTimeout(populate, 25);

        function flush() {
            data = {};
            length = 0;
        }
        return {
            flush: flush,
            add: add,
            populate: populate,
            load: function (q) {
                if (!options.cacheLength || !length) return null;
                if (!options.url && options.matchContains) {
                    var csub = [];
                    for (var k in data) {
                        if (k.length > 0) {
                            var c = data[k];
                            $.each(c, function (i, x) {
                                if (matchSubset(x.value, q)) {
                                    csub.push(x);
                                }
                            });
                        }
                    }
                    return csub;
                } else if (data[q]) {
                    return data[q];
                } else if (options.matchSubset) {
                    for (var i = q.length - 1; i >= options.minChars; i--) {
                        var c = data[q.substr(0, i)];
                        if (c) {
                            var csub = [];
                            $.each(c, function (i, x) {
                                if (matchSubset(x.value, q)) {
                                    csub[csub.length] = x;
                                }
                            });
                            return csub;
                        }
                    }
                }
                return null;
            }
        };
    };
    $.Autocompleter.Select = function (options, input, select, config) {
        var CLASSES = {
            ACTIVE: "ac_over"
        };
        var listItems, active = -1,
            data, term = "",
            needsInit = true,
            element, list;

        function init() {
            if (!needsInit) return;
            element = $("<div/>").hide().addClass(options.resultsClass).css("position", "absolute").appendTo(document.body);
            list = $("<ul/>").appendTo(element).mouseover(function (event) {
                if (target(event).nodeName && target(event).nodeName.toUpperCase() == 'LI') {
                    active = $("li", list).removeClass(CLASSES.ACTIVE).index(target(event));
                    $(target(event)).addClass(CLASSES.ACTIVE);
                }
            }).click(function (event) {
                $(target(event)).addClass(CLASSES.ACTIVE);
                select();
                input.focus();
                return false;
            }).mousedown(function () {
                config.mouseDownOnSelect = true;
            }).mouseup(function () {
                config.mouseDownOnSelect = false;
            });
            if (options.width > 0) element.css("width", options.width);
            needsInit = false;
        }

        function target(event) {
            var element = event.target;
            while (element && element.tagName != "LI")
            element = element.parentNode;
            if (!element) return [];
            return element;
        }

        function moveSelect(step) {
            listItems.slice(active, active + 1).removeClass(CLASSES.ACTIVE);
            movePosition(step);
            var activeItem = listItems.slice(active, active + 1).addClass(CLASSES.ACTIVE);
            if (options.scroll) {
                var offset = 0;
                listItems.slice(0, active).each(function () {
                    offset += this.offsetHeight;
                });
                if ((offset + activeItem[0].offsetHeight - list.scrollTop()) > list[0].clientHeight) {
                    list.scrollTop(offset + activeItem[0].offsetHeight - list.innerHeight());
                } else if (offset < list.scrollTop()) {
                    list.scrollTop(offset);
                }
            }
        };

        function movePosition(step) {
            active += step;
            if (active < 0) {
                active = listItems.size() - 1;
            } else if (active >= listItems.size()) {
                active = 0;
            }
        }

        function limitNumberOfItems(available) {
            return options.max && options.max < available ? options.max : available;
        }

        function fillList() {
            list.empty();
            var max = limitNumberOfItems(data.length);
            for (var i = 0; i < max; i++) {
                if (!data[i]) continue;
                var formatted = options.formatItem(data[i].data, i + 1, max, data[i].value, term);
                if (formatted === false) continue;
                var li = $("<li/>").html(options.highlight(formatted, term)).addClass(i % 2 == 0 ? "ac_even" : "ac_odd").appendTo(list)[0];
                $.data(li, "ac_data", data[i]);
            }
            listItems = list.find("li");
            if (options.selectFirst) {
                listItems.slice(0, 1).addClass(CLASSES.ACTIVE);
                active = 0;
            }
            if ($.fn.bgiframe) list.bgiframe();
        }
        return {
            display: function (d, q) {
                init();
                data = d;
                term = q;
                fillList();
            },
            next: function () {
                moveSelect(1);
            },
            prev: function () {
                moveSelect(-1);
            },
            pageUp: function () {
                if (active != 0 && active - 8 < 0) {
                    moveSelect(-active);
                } else {
                    moveSelect(-8);
                }
            },
            pageDown: function () {
                if (active != listItems.size() - 1 && active + 8 > listItems.size()) {
                    moveSelect(listItems.size() - 1 - active);
                } else {
                    moveSelect(8);
                }
            },
            hide: function () {
                element && element.hide();
                listItems && listItems.removeClass(CLASSES.ACTIVE);
                active = -1;
            },
            visible: function () {
                return element && element.is(":visible");
            },
            current: function () {
                return this.visible() && (listItems.filter("." + CLASSES.ACTIVE)[0] || options.selectFirst && listItems[0]);
            },
            show: function () {
                var offset = $(input).offset();
                element.css({
                    width: typeof options.width == "string" || options.width > 0 ? options.width : $(input).width(),
                    top: offset.top + input.offsetHeight,
                    left: offset.left
                }).show();
                if (options.scroll) {
                    list.scrollTop(0);
                    list.css({
                        maxHeight: options.scrollHeight,
                        overflow: 'auto'
                    });
                    if ($.browser.msie && typeof document.body.style.maxHeight === "undefined") {
                        var listHeight = 0;
                        listItems.each(function () {
                            listHeight += this.offsetHeight;
                        });
                        var scrollbarsVisible = listHeight > options.scrollHeight;
                        list.css('height', scrollbarsVisible ? options.scrollHeight : listHeight);
                        if (!scrollbarsVisible) {
                            listItems.width(list.width() - parseInt(listItems.css("padding-left")) - parseInt(listItems.css("padding-right")));
                        }
                    }
                }
            },
            selected: function () {
                var selected = listItems && listItems.filter("." + CLASSES.ACTIVE).removeClass(CLASSES.ACTIVE);
                return selected && selected.length && $.data(selected[0], "ac_data");
            },
            emptyList: function () {
                list && list.empty();
            },
            unbind: function () {
                element && element.remove();
            }
        };
    };
    $.fn.selection = function (start, end) {
        if (start !== undefined) {
            return this.each(function () {
                if (this.createTextRange) {
                    var selRange = this.createTextRange();
                    if (end === undefined || start == end) {
                        selRange.move("character", start);
                        selRange.select();
                    } else {
                        selRange.collapse(true);
                        selRange.moveStart("character", start);
                        selRange.moveEnd("character", end);
                        selRange.select();
                    }
                } else if (this.setSelectionRange) {
                    this.setSelectionRange(start, end);
                } else if (this.selectionStart) {
                    this.selectionStart = start;
                    this.selectionEnd = end;
                }
            });
        }
        var field = this[0];
        if (field.createTextRange) {
            var range = document.selection.createRange(),
                orig = field.value,
                teststring = "<->",
                textLength = range.text.length;
            range.text = teststring;
            var caretAt = field.value.indexOf(teststring);
            field.value = orig;
            this.selection(caretAt, caretAt + textLength);
            return {
                start: caretAt,
                end: caretAt + textLength
            }
        } else if (field.selectionStart !== undefined) {
            return {
                start: field.selectionStart,
                end: field.selectionEnd
            }
        }
    };
})(jQuery);;
(function ($) {
    $.fn.ajaxSubmit = function (options) {
        if (!this.length) {
            log('ajaxSubmit: skipping submit process - no element selected');
            return this;
        }
        if (typeof options == 'function') options = {
            success: options
        };
        var url = this.attr('action') || window.location.href;
        url = (url.match(/^([^#]+)/) || [])[1];
        url = url || '';
        options = $.extend({
            url: url,
            type: this.attr('method') || 'GET'
        }, options || {});
        var veto = {};
        this.trigger('form-pre-serialize', [this, options, veto]);
        if (veto.veto) {
            log('ajaxSubmit: submit vetoed via form-pre-serialize trigger');
            return this;
        }
        if (options.beforeSerialize && options.beforeSerialize(this, options) === false) {
            log('ajaxSubmit: submit aborted via beforeSerialize callback');
            return this;
        }
        var a = this.formToArray(options.semantic);
        if (options.data) {
            options.extraData = options.data;
            for (var n in options.data) {
                if (options.data[n] instanceof Array) {
                    for (var k in options.data[n])
                    a.push({
                        name: n,
                        value: options.data[n][k]
                    });
                }
                else a.push({
                    name: n,
                    value: options.data[n]
                });
            }
        }
        if (options.beforeSubmit && options.beforeSubmit(a, this, options) === false) {
            log('ajaxSubmit: submit aborted via beforeSubmit callback');
            return this;
        }
        this.trigger('form-submit-validate', [a, this, options, veto]);
        if (veto.veto) {
            log('ajaxSubmit: submit vetoed via form-submit-validate trigger');
            return this;
        }
        var q = $.param(a);
        if (options.type.toUpperCase() == 'GET') {
            options.url += (options.url.indexOf('?') >= 0 ? '&' : '?') + q;
            options.data = null;
        }
        else options.data = q;
        var $form = this,
            callbacks = [];
        if (options.resetForm) callbacks.push(function () {
            $form.resetForm();
        });
        if (options.clearForm) callbacks.push(function () {
            $form.clearForm();
        });
        if (!options.dataType && options.target) {
            var oldSuccess = options.success ||
            function () {};
            callbacks.push(function (data) {
                $(options.target).html(data).each(oldSuccess, arguments);
            });
        }
        else if (options.success) callbacks.push(options.success);
        options.success = function (data, status) {
            for (var i = 0, max = callbacks.length; i < max; i++)
            callbacks[i].apply(options, [data, status, $form]);
        };
        var files = $('input:file', this).fieldValue();
        var found = false;
        for (var j = 0; j < files.length; j++)
        if (files[j]) found = true;
        if (options.iframe || found) {
            if (options.closeKeepAlive) $.get(options.closeKeepAlive, fileUpload);
            else fileUpload();
        }
        else $.ajax(options);
        this.trigger('form-submit-notify', [this, options]);
        return this;

        function fileUpload() {
            var form = $form[0];
            if ($(':input[name=submit]', form).length) {
                alert('Error: Form elements must not be named "submit".');
                return;
            }
            var opts = $.extend({}, $.ajaxSettings, options);
            var s = $.extend(true, {}, $.extend(true, {}, $.ajaxSettings), opts);
            var id = 'jqFormIO' + (new Date().getTime());
            var $io = $('<iframe id="' + id + '" name="' + id + '" src="about:blank" />');
            var io = $io[0];
            $io.css({
                position: 'absolute',
                top: '-1000px',
                left: '-1000px'
            });
            var xhr = {
                aborted: 0,
                responseText: null,
                responseXML: null,
                status: 0,
                statusText: 'n/a',
                getAllResponseHeaders: function () {},
                getResponseHeader: function () {},
                setRequestHeader: function () {},
                abort: function () {
                    this.aborted = 1;
                    $io.attr('src', 'about:blank');
                }
            };
            var g = opts.global;
            if (g && !$.active++) $.event.trigger("ajaxStart");
            if (g) $.event.trigger("ajaxSend", [xhr, opts]);
            if (s.beforeSend && s.beforeSend(xhr, s) === false) {
                s.global && $.active--;
                return;
            }
            if (xhr.aborted) return;
            var cbInvoked = 0;
            var timedOut = 0;
            var sub = form.clk;
            if (sub) {
                var n = sub.name;
                if (n && !sub.disabled) {
                    options.extraData = options.extraData || {};
                    options.extraData[n] = sub.value;
                    if (sub.type == "image") {
                        options.extraData[name + '.x'] = form.clk_x;
                        options.extraData[name + '.y'] = form.clk_y;
                    }
                }
            }
            setTimeout(function () {
                var t = $form.attr('target'),
                    a = $form.attr('action');
                form.setAttribute('target', id);
                if (form.getAttribute('method') != 'POST') form.setAttribute('method', 'POST');
                if (form.getAttribute('action') != opts.url) form.setAttribute('action', opts.url);
                if (!options.skipEncodingOverride) {
                    $form.attr({
                        encoding: 'multipart/form-data',
                        enctype: 'multipart/form-data'
                    });
                }
                if (opts.timeout) setTimeout(function () {
                    timedOut = true;
                    cb();
                }, opts.timeout);
                var extraInputs = [];
                try {
                    if (options.extraData) for (var n in options.extraData) extraInputs.push($('<input type="hidden" name="' + n + '" value="' + options.extraData[n] + '" />').appendTo(form)[0]);
                    $io.appendTo('body');
                    io.attachEvent ? io.attachEvent('onload', cb) : io.addEventListener('load', cb, false);
                    form.submit();
                }
                finally {
                    form.setAttribute('action', a);
                    t ? form.setAttribute('target', t) : $form.removeAttr('target');
                    $(extraInputs).remove();
                }
            }, 10);
            var nullCheckFlag = 0;

            function cb() {
                if (cbInvoked++) return;
                io.detachEvent ? io.detachEvent('onload', cb) : io.removeEventListener('load', cb, false);
                var ok = true;
                try {
                    if (timedOut) throw 'timeout';
                    var data, doc;
                    doc = io.contentWindow ? io.contentWindow.document : io.contentDocument ? io.contentDocument : io.document;
                    if ((doc.body == null || doc.body.innerHTML == '') && !nullCheckFlag) {
                        nullCheckFlag = 1;
                        cbInvoked--;
                        setTimeout(cb, 100);
                        return;
                    }
                    xhr.responseText = doc.body ? doc.body.innerHTML : null;
                    xhr.responseXML = doc.XMLDocument ? doc.XMLDocument : doc;
                    xhr.getResponseHeader = function (header) {
                        var headers = {
                            'content-type': opts.dataType
                        };
                        return headers[header];
                    };
                    if (opts.dataType == 'json' || opts.dataType == 'script') {
                        var ta = doc.getElementsByTagName('textarea')[0];
                        xhr.responseText = ta ? ta.value : xhr.responseText;
                    }
                    else if (opts.dataType == 'xml' && !xhr.responseXML && xhr.responseText != null) {
                        xhr.responseXML = toXml(xhr.responseText);
                    }
                    data = $.httpData(xhr, opts.dataType);
                }
                catch (e) {
                    ok = false;
                    $.handleError(opts, xhr, 'error', e);
                }
                if (ok) {
                    opts.success(data, 'success');
                    if (g) $.event.trigger("ajaxSuccess", [xhr, opts]);
                }
                if (g) $.event.trigger("ajaxComplete", [xhr, opts]);
                if (g && !--$.active) $.event.trigger("ajaxStop");
                if (opts.complete) opts.complete(xhr, ok ? 'success' : 'error');
                setTimeout(function () {
                    $io.remove();
                    xhr.responseXML = null;
                }, 100);
            };

            function toXml(s, doc) {
                if (window.ActiveXObject) {
                    doc = new ActiveXObject('Microsoft.XMLDOM');
                    doc.async = 'false';
                    doc.loadXML(s);
                }
                else doc = (new DOMParser()).parseFromString(s, 'text/xml');
                return (doc && doc.documentElement && doc.documentElement.tagName != 'parsererror') ? doc : null;
            };
        };
    };
    $.fn.ajaxForm = function (options) {
        return this.ajaxFormUnbind().bind('submit.form-plugin', function () {
            $(this).ajaxSubmit(options);
            return false;
        }).each(function () {
            $(":submit,input:image", this).bind('click.form-plugin', function (e) {
                var form = this.form;
                form.clk = this;
                if (this.type == 'image') {
                    if (e.offsetX != undefined) {
                        form.clk_x = e.offsetX;
                        form.clk_y = e.offsetY;
                    } else if (typeof $.fn.offset == 'function') {
                        var offset = $(this).offset();
                        form.clk_x = e.pageX - offset.left;
                        form.clk_y = e.pageY - offset.top;
                    } else {
                        form.clk_x = e.pageX - this.offsetLeft;
                        form.clk_y = e.pageY - this.offsetTop;
                    }
                }
                setTimeout(function () {
                    form.clk = form.clk_x = form.clk_y = null;
                }, 10);
            });
        });
    };
    $.fn.ajaxFormUnbind = function () {
        this.unbind('submit.form-plugin');
        return this.each(function () {
            $(":submit,input:image", this).unbind('click.form-plugin');
        });
    };
    $.fn.formToArray = function (semantic) {
        var a = [];
        if (this.length == 0) return a;
        var form = this[0];
        var els = semantic ? form.getElementsByTagName('*') : form.elements;
        if (!els) return a;
        for (var i = 0, max = els.length; i < max; i++) {
            var el = els[i];
            var n = el.name;
            if (!n) continue;
            if (semantic && form.clk && el.type == "image") {
                if (!el.disabled && form.clk == el) a.push({
                    name: n + '.x',
                    value: form.clk_x
                }, {
                    name: n + '.y',
                    value: form.clk_y
                });
                continue;
            }
            var v = $.fieldValue(el, true);
            if (v && v.constructor == Array) {
                for (var j = 0, jmax = v.length; j < jmax; j++)
                a.push({
                    name: n,
                    value: v[j]
                });
            }
            else if (v !== null && typeof v != 'undefined') a.push({
                name: n,
                value: v
            });
        }
        if (!semantic && form.clk) {
            var inputs = form.getElementsByTagName("input");
            for (var i = 0, max = inputs.length; i < max; i++) {
                var input = inputs[i];
                var n = input.name;
                if (n && !input.disabled && input.type == "image" && form.clk == input) a.push({
                    name: n + '.x',
                    value: form.clk_x
                }, {
                    name: n + '.y',
                    value: form.clk_y
                });
            }
        }
        return a;
    };
    $.fn.formSerialize = function (semantic) {
        return $.param(this.formToArray(semantic));
    };
    $.fn.fieldSerialize = function (successful) {
        var a = [];
        this.each(function () {
            var n = this.name;
            if (!n) return;
            var v = $.fieldValue(this, successful);
            if (v && v.constructor == Array) {
                for (var i = 0, max = v.length; i < max; i++)
                a.push({
                    name: n,
                    value: v[i]
                });
            }
            else if (v !== null && typeof v != 'undefined') a.push({
                name: this.name,
                value: v
            });
        });
        return $.param(a);
    };
    $.fn.fieldValue = function (successful) {
        for (var val = [], i = 0, max = this.length; i < max; i++) {
            var el = this[i];
            var v = $.fieldValue(el, successful);
            if (v === null || typeof v == 'undefined' || (v.constructor == Array && !v.length)) continue;
            v.constructor == Array ? $.merge(val, v) : val.push(v);
        }
        return val;
    };
    $.fieldValue = function (el, successful) {
        var n = el.name,
            t = el.type,
            tag = el.tagName.toLowerCase();
        if (typeof successful == 'undefined') successful = true;
        if (successful && (!n || el.disabled || t == 'reset' || t == 'button' || (t == 'checkbox' || t == 'radio') && !el.checked || (t == 'submit' || t == 'image') && el.form && el.form.clk != el || tag == 'select' && el.selectedIndex == -1)) return null;
        if (tag == 'select') {
            var index = el.selectedIndex;
            if (index < 0) return null;
            var a = [],
                ops = el.options;
            var one = (t == 'select-one');
            var max = (one ? index + 1 : ops.length);
            for (var i = (one ? index : 0); i < max; i++) {
                var op = ops[i];
                if (op.selected) {
                    var v = op.value;
                    if (!v) v = (op.attributes && op.attributes['value'] && !(op.attributes['value'].specified)) ? op.text : op.value;
                    if (one) return v;
                    a.push(v);
                }
            }
            return a;
        }
        return el.value;
    };
    $.fn.clearForm = function () {
        return this.each(function () {
            $('input,select,textarea', this).clearFields();
        });
    };
    $.fn.clearFields = $.fn.clearInputs = function () {
        return this.each(function () {
            var t = this.type,
                tag = this.tagName.toLowerCase();
            if (t == 'text' || t == 'password' || tag == 'textarea') this.value = '';
            else if (t == 'checkbox' || t == 'radio') this.checked = false;
            else if (tag == 'select') this.selectedIndex = -1;
        });
    };
    $.fn.resetForm = function () {
        return this.each(function () {
            if (typeof this.reset == 'function' || (typeof this.reset == 'object' && !this.reset.nodeType)) this.reset();
        });
    };
    $.fn.enable = function (b) {
        if (b == undefined) b = true;
        return this.each(function () {
            this.disabled = !b;
        });
    };
    $.fn.selected = function (select) {
        if (select == undefined) select = true;
        return this.each(function () {
            var t = this.type;
            if (t == 'checkbox' || t == 'radio') this.checked = select;
            else if (this.tagName.toLowerCase() == 'option') {
                var $sel = $(this).parent('select');
                if (select && $sel[0] && $sel[0].type == 'select-one') {
                    $sel.find('option').selected(false);
                }
                this.selected = select;
            }
        });
    };

    function log() {
        if ($.fn.ajaxSubmit.debug && window.console && window.console.log) window.console.log('[jquery.form] ' + Array.prototype.join.call(arguments, ''));
    };
})(jQuery);

(function ($) {
    function toIntegersAtLease(n) {
        return n < 10 ? '0' + n : n;
    }
    Date.prototype.toJSON = function (date) {
        return this.getUTCFullYear() + '-' + toIntegersAtLease(this.getUTCMonth()) + '-' + toIntegersAtLease(this.getUTCDate());
    };
    var escapeable = /["\\\x00-\x1f\x7f-\x9f]/g;
    var meta = {
        '\b': '\\b',
        '\t': '\\t',
        '\n': '\\n',
        '\f': '\\f',
        '\r': '\\r',
        '"': '\\"',
        '\\': '\\\\'
    };
    $.quoteString = function (string) {
        if (escapeable.test(string)) {
            return '"' + string.replace(escapeable, function (a) {
                var c = meta[a];
                if (typeof c === 'string') {
                    return c;
                }
                c = a.charCodeAt();
                return '\\u00' + Math.floor(c / 16).toString(16) + (c % 16).toString(16);
            }) + '"';
        }
        return '"' + string + '"';
    };
    $.toJSON = function (o, compact) {
        var type = typeof(o);
        if (type == "undefined") return "undefined";
        else if (type == "number" || type == "boolean") return o + "";
        else if (o === null) return "null";
        if (type == "string") {
            return $.quoteString(o);
        }
        if (type == "object" && typeof o.toJSON == "function") return o.toJSON(compact);
        if (type != "function" && typeof(o.length) == "number") {
            var ret = [];
            for (var i = 0; i < o.length; i++) {
                ret.push($.toJSON(o[i], compact));
            }
            if (compact) return "[" + ret.join(",") + "]";
            else return "[" + ret.join(", ") + "]";
        }
        if (type == "function") {
            throw new TypeError("Unable to convert object of type 'function' to json.");
        }
        var ret = [];
        for (var k in o) {
            var name;
            type = typeof(k);
            if (type == "number") name = '"' + k + '"';
            else if (type == "string") name = $.quoteString(k);
            else continue;
            var val = $.toJSON(o[k], compact);
            if (typeof(val) != "string") {
                continue;
            }
            if (compact) ret.push(name + ":" + val);
            else ret.push(name + ": " + val);
        }
        return "{" + ret.join(", ") + "}";
    };
    $.compactJSON = function (o) {
        return $.toJSON(o, true);
    };
    $.evalJSON = function (src) {
        return eval("(" + src + ")");
    };
    $.secureEvalJSON = function (src) {
        var filtered = src;
        filtered = filtered.replace(/\\["\\\/bfnrtu]/g, '@');
        filtered = filtered.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']');
        filtered = filtered.replace(/(?:^|:|,)(?:\s*\[)+/g, '');
        if (/^[\],:{}\s]*$/.test(filtered)) return eval("(" + src + ")");
        else throw new SyntaxError("Error parsing JSON, source is not valid.");
    };
})(jQuery);

jQuery.fn.extend({
    everyTime: function (interval, label, fn, times, belay) {
        return this.each(function () {
            jQuery.timer.add(this, interval, label, fn, times, belay);
        });
    },
    oneTime: function (interval, label, fn) {
        return this.each(function () {
            jQuery.timer.add(this, interval, label, fn, 1);
        });
    },
    stopTime: function (label, fn) {
        return this.each(function () {
            jQuery.timer.remove(this, label, fn);
        });
    }
});
jQuery.event.special
jQuery.extend({
    timer: {
        global: [],
        guid: 1,
        dataKey: "jQuery.timer",
        regex: /^([0-9]+(?:\.[0-9]*)?)\s*(.*s)?$/,
        powers: {
            'ms': 1,
            'cs': 10,
            'ds': 100,
            's': 1000,
            'das': 10000,
            'hs': 100000,
            'ks': 1000000
        },
        timeParse: function (value) {
            if (value == undefined || value == null) return null;
            var result = this.regex.exec(jQuery.trim(value.toString()));
            if (result[2]) {
                var num = parseFloat(result[1]);
                var mult = this.powers[result[2]] || 1;
                return num * mult;
            } else {
                return value;
            }
        },
        add: function (element, interval, label, fn, times, belay) {
            var counter = 0;
            if (jQuery.isFunction(label)) {
                if (!times) times = fn;
                fn = label;
                label = interval;
            }
            interval = jQuery.timer.timeParse(interval);
            if (typeof interval != 'number' || isNaN(interval) || interval <= 0) return;
            if (times && times.constructor != Number) {
                belay = !! times;
                times = 0;
            }
            times = times || 0;
            belay = belay || false;
            var timers = jQuery.data(element, this.dataKey) || jQuery.data(element, this.dataKey, {});
            if (!timers[label]) timers[label] = {};
            fn.timerID = fn.timerID || this.guid++;
            var handler = function () {
                if (belay && this.inProgress) return;
                this.inProgress = true;
                if ((++counter > times && times !== 0) || fn.call(element, counter) === false) jQuery.timer.remove(element, label, fn);
                this.inProgress = false;
            };
            handler.timerID = fn.timerID;
            if (!timers[label][fn.timerID]) timers[label][fn.timerID] = window.setInterval(handler, interval);
            this.global.push(element);
        },
        remove: function (element, label, fn) {
            var timers = jQuery.data(element, this.dataKey),
                ret;
            if (timers) {
                if (!label) {
                    for (label in timers)
                    this.remove(element, label, fn);
                } else if (timers[label]) {
                    if (fn) {
                        if (fn.timerID) {
                            window.clearInterval(timers[label][fn.timerID]);
                            delete timers[label][fn.timerID];
                        }
                    } else {
                        for (var fn in timers[label]) {
                            window.clearInterval(timers[label][fn]);
                            delete timers[label][fn];
                        }
                    }
                    for (ret in timers[label]) break;
                    if (!ret) {
                        ret = null;
                        delete timers[label];
                    }
                }
                for (ret in timers) break;
                if (!ret) jQuery.removeData(element, this.dataKey);
            }
        }
    }
});
jQuery(window).bind("unload", function () {
    jQuery.each(jQuery.timer.global, function (index, item) {
        jQuery.timer.remove(item);
    });
});

jQuery.ui || (function (b) {
    var a = b.browser.mozilla && (parseFloat(b.browser.version) < 1.9);
    b.ui = {
        version: "1.8rc3",
        plugin: {
            add: function (d, e, g) {
                var f = b.ui[d].prototype;
                for (var c in g) {
                    f.plugins[c] = f.plugins[c] || [];
                    f.plugins[c].push([e, g[c]])
                }
            },
            call: function (c, e, d) {
                var g = c.plugins[e];
                if (!g || !c.element[0].parentNode) {
                    return
                }
                for (var f = 0; f < g.length; f++) {
                    if (c.options[g[f][0]]) {
                        g[f][1].apply(c.element, d)
                    }
                }
            }
        },
        contains: function (d, c) {
            return document.compareDocumentPosition ? d.compareDocumentPosition(c) & 16 : d !== c && d.contains(c)
        },
        hasScroll: function (f, d) {
            if (b(f).css("overflow") == "hidden") {
                return false
            }
            var c = (d && d == "left") ? "scrollLeft" : "scrollTop",
                e = false;
            if (f[c] > 0) {
                return true
            }
            f[c] = 1;
            e = (f[c] > 0);
            f[c] = 0;
            return e
        },
        isOverAxis: function (d, c, e) {
            return (d > c) && (d < (c + e))
        },
        isOver: function (h, d, g, f, c, e) {
            return b.ui.isOverAxis(h, g, c) && b.ui.isOverAxis(d, f, e)
        },
        keyCode: {
            BACKSPACE: 8,
            CAPS_LOCK: 20,
            COMMA: 188,
            CONTROL: 17,
            DELETE: 46,
            DOWN: 40,
            END: 35,
            ENTER: 13,
            ESCAPE: 27,
            HOME: 36,
            INSERT: 45,
            LEFT: 37,
            NUMPAD_ADD: 107,
            NUMPAD_DECIMAL: 110,
            NUMPAD_DIVIDE: 111,
            NUMPAD_ENTER: 108,
            NUMPAD_MULTIPLY: 106,
            NUMPAD_SUBTRACT: 109,
            PAGE_DOWN: 34,
            PAGE_UP: 33,
            PERIOD: 190,
            RIGHT: 39,
            SHIFT: 16,
            SPACE: 32,
            TAB: 9,
            UP: 38
        }
    };
    b.fn.extend({
        _focus: b.fn.focus,
        focus: function (c, d) {
            return typeof c === "number" ? this.each(function () {
                var e = this;
                setTimeout(function () {
                    b(e).focus();
                    (d && d.call(e))
                }, c)
            }) : this._focus.apply(this, arguments)
        },
        enableSelection: function () {
            return this.attr("unselectable", "off").css("MozUserSelect", "").unbind("selectstart.ui")
        },
        disableSelection: function () {
            return this.attr("unselectable", "on").css("MozUserSelect", "none").bind("selectstart.ui", function () {
                return false
            })
        },
        scrollParent: function () {
            var c;
            if ((b.browser.msie && (/(static|relative)/).test(this.css("position"))) || (/absolute/).test(this.css("position"))) {
                c = this.parents().filter(function () {
                    return (/(relative|absolute|fixed)/).test(b.curCSS(this, "position", 1)) && (/(auto|scroll)/).test(b.curCSS(this, "overflow", 1) + b.curCSS(this, "overflow-y", 1) + b.curCSS(this, "overflow-x", 1))
                }).eq(0)
            } else {
                c = this.parents().filter(function () {
                    return (/(auto|scroll)/).test(b.curCSS(this, "overflow", 1) + b.curCSS(this, "overflow-y", 1) + b.curCSS(this, "overflow-x", 1))
                }).eq(0)
            }
            return (/fixed/).test(this.css("position")) || !c.length ? b(document) : c
        },
        zIndex: function (f) {
            if (f !== undefined) {
                return this.css("zIndex", f)
            }
            if (this.length) {
                var d = b(this[0]),
                    c, e;
                while (d.length && d[0] !== document) {
                    c = d.css("position");
                    if (c == "absolute" || c == "relative" || c == "fixed") {
                        e = parseInt(d.css("zIndex"));
                        if (!isNaN(e) && e != 0) {
                            return e
                        }
                    }
                    d = d.parent()
                }
            }
            return 0
        }
    });
    b.extend(b.expr[":"], {
        data: function (e, d, c) {
            return !!b.data(e, c[3])
        },
        focusable: function (d) {
            var e = d.nodeName.toLowerCase(),
                c = b.attr(d, "tabindex");
            return (/input|select|textarea|button|object/.test(e) ? !d.disabled : "a" == e || "area" == e ? d.href || !isNaN(c) : !isNaN(c)) && !b(d)["area" == e ? "parents" : "closest"](":hidden").length
        },
        tabbable: function (d) {
            var c = b.attr(d, "tabindex");
            return (isNaN(c) || c >= 0) && b(d).is(":focusable")
        }
    })
})(jQuery);;
(function (b) {
    var a = b.fn.remove;
    b.fn.remove = function (c, d) {
        return this.each(function () {
            if (!d) {
                if (!c || b.filter(c, [this]).length) {
                    b("*", this).add(this).each(function () {
                        b(this).triggerHandler("remove")
                    })
                }
            }
            return a.call(b(this), c, d)
        })
    };
    b.widget = function (d, f, c) {
        var e = d.split(".")[0],
            h;
        d = d.split(".")[1];
        h = e + "-" + d;
        if (!c) {
            c = f;
            f = b.Widget
        }
        b.expr[":"][h] = function (i) {
            return !!b.data(i, d)
        };
        b[e] = b[e] || {};
        b[e][d] = function (i, j) {
            if (arguments.length) {
                this._createWidget(i, j)
            }
        };
        var g = new f();
        g.options = b.extend({}, g.options);
        b[e][d].prototype = b.extend(true, g, {
            namespace: e,
            widgetName: d,
            widgetEventPrefix: b[e][d].prototype.widgetEventPrefix || d,
            widgetBaseClass: h
        }, c);
        b.widget.bridge(d, b[e][d])
    };
    b.widget.bridge = function (d, c) {
        b.fn[d] = function (g) {
            var e = typeof g === "string",
                f = Array.prototype.slice.call(arguments, 1),
                h = this;
            g = !e && f.length ? b.extend.apply(null, [true, g].concat(f)) : g;
            if (e && g.substring(0, 1) === "_") {
                return h
            }
            if (e) {
                this.each(function () {
                    var i = b.data(this, d),
                        j = i && b.isFunction(i[g]) ? i[g].apply(i, f) : i;
                    if (j !== i && j !== undefined) {
                        h = j;
                        return false
                    }
                })
            } else {
                this.each(function () {
                    var i = b.data(this, d);
                    if (i) {
                        if (g) {
                            i.option(g)
                        }
                        i._init()
                    } else {
                        b.data(this, d, new c(g, this))
                    }
                })
            }
            return h
        }
    };
    b.Widget = function (c, d) {
        if (arguments.length) {
            this._createWidget(c, d)
        }
    };
    b.Widget.prototype = {
        widgetName: "widget",
        widgetEventPrefix: "",
        options: {
            disabled: false
        },
        _createWidget: function (d, e) {
            this.element = b(e).data(this.widgetName, this);
            this.options = b.extend(true, {}, this.options, b.metadata && b.metadata.get(e)[this.widgetName], d);
            var c = this;
            this.element.bind("remove." + this.widgetName, function () {
                c.destroy()
            });
            this._create();
            this._init()
        },
        _create: function () {},
        _init: function () {},
        destroy: function () {
            this.element.unbind("." + this.widgetName).removeData(this.widgetName);
            this.widget().unbind("." + this.widgetName).removeAttr("aria-disabled").removeClass(this.widgetBaseClass + "-disabled " + this.namespace + "-state-disabled")
        },
        widget: function () {
            return this.element
        },
        option: function (e, f) {
            var d = e,
                c = this;
            if (arguments.length === 0) {
                return b.extend({}, c.options)
            }
            if (typeof e === "string") {
                if (f === undefined) {
                    return this.options[e]
                }
                d = {};
                d[e] = f
            }
            b.each(d, function (g, h) {
                c._setOption(g, h)
            });
            return c
        },
        _setOption: function (c, d) {
            this.options[c] = d;
            if (c === "disabled") {
                this.widget()[d ? "addClass" : "removeClass"](this.widgetBaseClass + "-disabled " + this.namespace + "-state-disabled").attr("aria-disabled", d)
            }
            return this
        },
        enable: function () {
            return this._setOption("disabled", false)
        },
        disable: function () {
            return this._setOption("disabled", true)
        },
        _trigger: function (d, e, f) {
            var h = this.options[d];
            e = b.Event(e);
            e.type = (d === this.widgetEventPrefix ? d : this.widgetEventPrefix + d).toLowerCase();
            f = f || {};
            if (e.originalEvent) {
                for (var c = b.event.props.length, g; c;) {
                    g = b.event.props[--c];
                    e[g] = e.originalEvent[g]
                }
            }
            this.element.trigger(e, f);
            return !(b.isFunction(h) && h.call(this.element[0], e, f) === false || e.isDefaultPrevented())
        }
    }
})(jQuery);;
(function (a) {
    a.widget("ui.mouse", {
        options: {
            cancel: ":input,option",
            distance: 1,
            delay: 0
        },
        _mouseInit: function () {
            var b = this;
            this.element.bind("mousedown." + this.widgetName, function (c) {
                return b._mouseDown(c)
            }).bind("click." + this.widgetName, function (c) {
                if (b._preventClickEvent) {
                    b._preventClickEvent = false;
                    c.stopImmediatePropagation();
                    return false
                }
            });
            this.started = false
        },
        _mouseDestroy: function () {
            this.element.unbind("." + this.widgetName)
        },
        _mouseDown: function (d) {
            d.originalEvent = d.originalEvent || {};
            if (d.originalEvent.mouseHandled) {
                return
            }(this._mouseStarted && this._mouseUp(d));
            this._mouseDownEvent = d;
            var c = this,
                e = (d.which == 1),
                b = (typeof this.options.cancel == "string" ? a(d.target).parents().add(d.target).filter(this.options.cancel).length : false);
            if (!e || b || !this._mouseCapture(d)) {
                return true
            }
            this.mouseDelayMet = !this.options.delay;
            if (!this.mouseDelayMet) {
                this._mouseDelayTimer = setTimeout(function () {
                    c.mouseDelayMet = true
                }, this.options.delay)
            }
            if (this._mouseDistanceMet(d) && this._mouseDelayMet(d)) {
                this._mouseStarted = (this._mouseStart(d) !== false);
                if (!this._mouseStarted) {
                    d.preventDefault();
                    return true
                }
            }
            this._mouseMoveDelegate = function (f) {
                return c._mouseMove(f)
            };
            this._mouseUpDelegate = function (f) {
                return c._mouseUp(f)
            };
            a(document).bind("mousemove." + this.widgetName, this._mouseMoveDelegate).bind("mouseup." + this.widgetName, this._mouseUpDelegate);
            (a.browser.safari || d.preventDefault());
            d.originalEvent.mouseHandled = true;
            return true
        },
        _mouseMove: function (b) {
            if (a.browser.msie && !b.button) {
                return this._mouseUp(b)
            }
            if (this._mouseStarted) {
                this._mouseDrag(b);
                return b.preventDefault()
            }
            if (this._mouseDistanceMet(b) && this._mouseDelayMet(b)) {
                this._mouseStarted = (this._mouseStart(this._mouseDownEvent, b) !== false);
                (this._mouseStarted ? this._mouseDrag(b) : this._mouseUp(b))
            }
            return !this._mouseStarted
        },
        _mouseUp: function (b) {
            a(document).unbind("mousemove." + this.widgetName, this._mouseMoveDelegate).unbind("mouseup." + this.widgetName, this._mouseUpDelegate);
            if (this._mouseStarted) {
                this._mouseStarted = false;
                this._preventClickEvent = (b.target == this._mouseDownEvent.target);
                this._mouseStop(b)
            }
            return false
        },
        _mouseDistanceMet: function (b) {
            return (Math.max(Math.abs(this._mouseDownEvent.pageX - b.pageX), Math.abs(this._mouseDownEvent.pageY - b.pageY)) >= this.options.distance)
        },
        _mouseDelayMet: function (b) {
            return this.mouseDelayMet
        },
        _mouseStart: function (b) {},
        _mouseDrag: function (b) {},
        _mouseStop: function (b) {},
        _mouseCapture: function (b) {
            return true
        }
    })
})(jQuery);;
(function (f) {
    f.ui = f.ui || {};
    var c = /left|center|right/,
        e = "center",
        d = /top|center|bottom/,
        g = "center",
        a = f.fn.position;
    f.fn.position = function (i) {
        if (!i || !i.of) {
            return a.apply(this, arguments)
        }
        i = f.extend({}, i);
        var l = f(i.of),
            n = (i.collision || "flip").split(" "),
            m = i.offset ? i.offset.split(" ") : [0, 0],
            k, h, j;
        if (i.of.nodeType === 9) {
            k = l.width();
            h = l.height();
            j = {
                top: 0,
                left: 0
            }
        } else {
            if (i.of.scrollTo && i.of.document) {
                k = l.width();
                h = l.height();
                j = {
                    top: l.scrollTop(),
                    left: l.scrollLeft()
                }
            } else {
                if (i.of.preventDefault) {
                    i.at = "left top";
                    k = h = 0;
                    j = {
                        top: i.of.pageY,
                        left: i.of.pageX
                    }
                } else {
                    k = l.outerWidth();
                    h = l.outerHeight();
                    j = l.offset()
                }
            }
        }
        f.each(["my", "at"], function () {
            var o = (i[this] || "").split(" ");
            if (o.length === 1) {
                o = c.test(o[0]) ? o.concat([g]) : d.test(o[0]) ? [e].concat(o) : [e, g]
            }
            o[0] = c.test(o[0]) ? o[0] : e;
            o[1] = d.test(o[1]) ? o[1] : g;
            i[this] = o
        });
        if (n.length === 1) {
            n[1] = n[0]
        }
        m[0] = parseInt(m[0], 10) || 0;
        if (m.length === 1) {
            m[1] = m[0]
        }
        m[1] = parseInt(m[1], 10) || 0;
        if (i.at[0] === "right") {
            j.left += k
        } else {
            if (i.at[0] === e) {
                j.left += k / 2
            }
        }
        if (i.at[1] === "bottom") {
            j.top += h
        } else {
            if (i.at[1] === g) {
                j.top += h / 2
            }
        }
        j.left += m[0];
        j.top += m[1];
        return this.each(function () {
            var t = f(this),
                s = t.outerWidth(),
                r = t.outerHeight(),
                p = f.extend({}, j),
                u, o, q;
            if (i.my[0] === "right") {
                p.left -= s
            } else {
                if (i.my[0] === e) {
                    p.left -= s / 2
                }
            }
            if (i.my[1] === "bottom") {
                p.top -= r
            } else {
                if (i.my[1] === g) {
                    p.top -= r / 2
                }
            }
            f.each(["left", "top"], function (w, v) {
                if (f.ui.position[n[w]]) {
                    f.ui.position[n[w]][v](p, {
                        targetWidth: k,
                        targetHeight: h,
                        elemWidth: s,
                        elemHeight: r,
                        offset: m,
                        my: i.my,
                        at: i.at
                    })
                }
            });
            if (f.fn.bgiframe) {
                t.bgiframe()
            }
            t.offset(f.extend(p, {
                using: i.using
            }))
        })
    };
    f.ui.position = {
        fit: {
            left: function (h, i) {
                var k = f(window),
                    j = h.left + i.elemWidth - k.width() - k.scrollLeft();
                h.left = j > 0 ? h.left - j : Math.max(0, h.left)
            },
            top: function (h, i) {
                var k = f(window),
                    j = h.top + i.elemHeight - k.height() - k.scrollTop();
                h.top = j > 0 ? h.top - j : Math.max(0, h.top)
            }
        },
        flip: {
            left: function (i, j) {
                if (j.at[0] === "center") {
                    return
                }
                var l = f(window),
                    k = i.left + j.elemWidth - l.width() - l.scrollLeft(),
                    h = j.my[0] === "left" ? -j.elemWidth : j.my[0] === "right" ? j.elemWidth : 0,
                    m = -2 * j.offset[0];
                i.left += i.left < 0 ? h + j.targetWidth + m : k > 0 ? h - j.targetWidth + m : 0
            },
            top: function (i, k) {
                if (k.at[1] === "center") {
                    return
                }
                var m = f(window),
                    l = i.top + k.elemHeight - m.height() - m.scrollTop(),
                    h = k.my[1] === "top" ? -k.elemHeight : k.my[1] === "bottom" ? k.elemHeight : 0,
                    j = k.at[1] === "top" ? k.targetHeight : -k.targetHeight,
                    n = -2 * k.offset[1];
                i.top += i.top < 0 ? h + k.targetHeight + n : l > 0 ? h + j + n : 0
            }
        }
    };
    if (!f.offset.setOffset) {
        f.offset.setOffset = function (l, i) {
            if (/static/.test(jQuery.curCSS(l, "position"))) {
                l.style.position = "relative"
            }
            var k = jQuery(l),
                n = k.offset(),
                h = parseInt(jQuery.curCSS(l, "top", true), 10) || 0,
                m = parseInt(jQuery.curCSS(l, "left", true), 10) || 0,
                j = {
                    top: (i.top - n.top) + h,
                    left: (i.left - n.left) + m
                };
            if ("using" in i) {
                i.using.call(l, j)
            } else {
                k.css(j)
            }
        };
        var b = f.fn.offset;
        f.fn.offset = function (h) {
            var i = this[0];
            if (!i || !i.ownerDocument) {
                return null
            }
            if (h) {
                return this.each(function () {
                    f.offset.setOffset(this, h)
                })
            }
            return b.call(this)
        }
    }
})(jQuery);;
(function (a) {
    a.widget("ui.draggable", a.ui.mouse, {
        widgetEventPrefix: "drag",
        options: {
            addClasses: true,
            appendTo: "parent",
            axis: false,
            connectToSortable: false,
            containment: false,
            cursor: "auto",
            cursorAt: false,
            grid: false,
            handle: false,
            helper: "original",
            iframeFix: false,
            opacity: false,
            refreshPositions: false,
            revert: false,
            revertDuration: 500,
            scope: "default",
            scroll: true,
            scrollSensitivity: 20,
            scrollSpeed: 20,
            snap: false,
            snapMode: "both",
            snapTolerance: 20,
            stack: false,
            zIndex: false
        },
        _create: function () {
            if (this.options.helper == "original" && !(/^(?:r|a|f)/).test(this.element.css("position"))) {
                this.element[0].style.position = "relative"
            }(this.options.addClasses && this.element.addClass("ui-draggable"));
            (this.options.disabled && this.element.addClass("ui-draggable-disabled"));
            this._mouseInit()
        },
        destroy: function () {
            if (!this.element.data("draggable")) {
                return
            }
            this.element.removeData("draggable").unbind(".draggable").removeClass("ui-draggable ui-draggable-dragging ui-draggable-disabled");
            this._mouseDestroy();
            return this
        },
        _mouseCapture: function (b) {
            var c = this.options;
            if (this.helper || c.disabled || a(b.target).is(".ui-resizable-handle")) {
                return false
            }
            this.handle = this._getHandle(b);
            if (!this.handle) {
                return false
            }
            return true
        },
        _mouseStart: function (b) {
            var c = this.options;
            this.helper = this._createHelper(b);
            this._cacheHelperProportions();
            if (a.ui.ddmanager) {
                a.ui.ddmanager.current = this
            }
            this._cacheMargins();
            this.cssPosition = this.helper.css("position");
            this.scrollParent = this.helper.scrollParent();
            this.offset = this.positionAbs = this.element.offset();
            this.offset = {
                top: this.offset.top - this.margins.top,
                left: this.offset.left - this.margins.left
            };
            a.extend(this.offset, {
                click: {
                    left: b.pageX - this.offset.left,
                    top: b.pageY - this.offset.top
                },
                parent: this._getParentOffset(),
                relative: this._getRelativeOffset()
            });
            this.originalPosition = this.position = this._generatePosition(b);
            this.originalPageX = b.pageX;
            this.originalPageY = b.pageY;
            (c.cursorAt && this._adjustOffsetFromHelper(c.cursorAt));
            if (c.containment) {
                this._setContainment()
            }
            if (this._trigger("start", b) === false) {
                this._clear();
                return false
            }
            this._cacheHelperProportions();
            if (a.ui.ddmanager && !c.dropBehaviour) {
                a.ui.ddmanager.prepareOffsets(this, b)
            }
            this.helper.addClass("ui-draggable-dragging");
            this._mouseDrag(b, true);
            return true
        },
        _mouseDrag: function (b, d) {
            this.position = this._generatePosition(b);
            this.positionAbs = this._convertPositionTo("absolute");
            if (!d) {
                var c = this._uiHash();
                if (this._trigger("drag", b, c) === false) {
                    this._mouseUp({});
                    return false
                }
                this.position = c.position
            }
            if (!this.options.axis || this.options.axis != "y") {
                this.helper[0].style.left = this.position.left + "px"
            }
            if (!this.options.axis || this.options.axis != "x") {
                this.helper[0].style.top = this.position.top + "px"
            }
            if (a.ui.ddmanager) {
                a.ui.ddmanager.drag(this, b)
            }
            return false
        },
        _mouseStop: function (c) {
            var d = false;
            if (a.ui.ddmanager && !this.options.dropBehaviour) {
                d = a.ui.ddmanager.drop(this, c)
            }
            if (this.dropped) {
                d = this.dropped;
                this.dropped = false
            }
            if (!this.element[0] || !this.element[0].parentNode) {
                return false
            }
            if ((this.options.revert == "invalid" && !d) || (this.options.revert == "valid" && d) || this.options.revert === true || (a.isFunction(this.options.revert) && this.options.revert.call(this.element, d))) {
                var b = this;
                a(this.helper).animate(this.originalPosition, parseInt(this.options.revertDuration, 10), function () {
                    if (b._trigger("stop", c) !== false) {
                        b._clear()
                    }
                })
            } else {
                if (this._trigger("stop", c) !== false) {
                    this._clear()
                }
            }
            return false
        },
        cancel: function () {
            if (this.helper.is(".ui-draggable-dragging")) {
                this._mouseUp({})
            } else {
                this._clear()
            }
            return this
        },
        _getHandle: function (b) {
            var c = !this.options.handle || !a(this.options.handle, this.element).length ? true : false;
            a(this.options.handle, this.element).find("*").andSelf().each(function () {
                if (this == b.target) {
                    c = true
                }
            });
            return c
        },
        _createHelper: function (c) {
            var d = this.options;
            var b = a.isFunction(d.helper) ? a(d.helper.apply(this.element[0], [c])) : (d.helper == "clone" ? this.element.clone() : this.element);
            if (!b.parents("body").length) {
                b.appendTo((d.appendTo == "parent" ? this.element[0].parentNode : d.appendTo))
            }
            if (b[0] != this.element[0] && !(/(fixed|absolute)/).test(b.css("position"))) {
                b.css("position", "absolute")
            }
            return b
        },
        _adjustOffsetFromHelper: function (b) {
            if (typeof b == "string") {
                b = b.split(" ")
            }
            if (a.isArray(b)) {
                b = {
                    left: +b[0],
                    top: +b[1] || 0
                }
            }
            if ("left" in b) {
                this.offset.click.left = b.left + this.margins.left
            }
            if ("right" in b) {
                this.offset.click.left = this.helperProportions.width - b.right + this.margins.left
            }
            if ("top" in b) {
                this.offset.click.top = b.top + this.margins.top
            }
            if ("bottom" in b) {
                this.offset.click.top = this.helperProportions.height - b.bottom + this.margins.top
            }
        },
        _getParentOffset: function () {
            this.offsetParent = this.helper.offsetParent();
            var b = this.offsetParent.offset();
            if (this.cssPosition == "absolute" && this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) {
                b.left += this.scrollParent.scrollLeft();
                b.top += this.scrollParent.scrollTop()
            }
            if ((this.offsetParent[0] == document.body) || (this.offsetParent[0].tagName && this.offsetParent[0].tagName.toLowerCase() == "html" && a.browser.msie)) {
                b = {
                    top: 0,
                    left: 0
                }
            }
            return {
                top: b.top + (parseInt(this.offsetParent.css("borderTopWidth"), 10) || 0),
                left: b.left + (parseInt(this.offsetParent.css("borderLeftWidth"), 10) || 0)
            }
        },
        _getRelativeOffset: function () {
            if (this.cssPosition == "relative") {
                var b = this.element.position();
                return {
                    top: b.top - (parseInt(this.helper.css("top"), 10) || 0) + this.scrollParent.scrollTop(),
                    left: b.left - (parseInt(this.helper.css("left"), 10) || 0) + this.scrollParent.scrollLeft()
                }
            } else {
                return {
                    top: 0,
                    left: 0
                }
            }
        },
        _cacheMargins: function () {
            this.margins = {
                left: (parseInt(this.element.css("marginLeft"), 10) || 0),
                top: (parseInt(this.element.css("marginTop"), 10) || 0)
            }
        },
        _cacheHelperProportions: function () {
            this.helperProportions = {
                width: this.helper.outerWidth(),
                height: this.helper.outerHeight()
            }
        },
        _setContainment: function () {
            var e = this.options;
            if (e.containment == "parent") {
                e.containment = this.helper[0].parentNode
            }
            if (e.containment == "document" || e.containment == "window") {
                this.containment = [0 - this.offset.relative.left - this.offset.parent.left, 0 - this.offset.relative.top - this.offset.parent.top, a(e.containment == "document" ? document : window).width() - this.helperProportions.width - this.margins.left, (a(e.containment == "document" ? document : window).height() || document.body.parentNode.scrollHeight) - this.helperProportions.height - this.margins.top]
            }
            if (!(/^(document|window|parent)$/).test(e.containment) && e.containment.constructor != Array) {
                var c = a(e.containment)[0];
                if (!c) {
                    return
                }
                var d = a(e.containment).offset();
                var b = (a(c).css("overflow") != "hidden");
                this.containment = [d.left + (parseInt(a(c).css("borderLeftWidth"), 10) || 0) + (parseInt(a(c).css("paddingLeft"), 10) || 0) - this.margins.left, d.top + (parseInt(a(c).css("borderTopWidth"), 10) || 0) + (parseInt(a(c).css("paddingTop"), 10) || 0) - this.margins.top, d.left + (b ? Math.max(c.scrollWidth, c.offsetWidth) : c.offsetWidth) - (parseInt(a(c).css("borderLeftWidth"), 10) || 0) - (parseInt(a(c).css("paddingRight"), 10) || 0) - this.helperProportions.width - this.margins.left, d.top + (b ? Math.max(c.scrollHeight, c.offsetHeight) : c.offsetHeight) - (parseInt(a(c).css("borderTopWidth"), 10) || 0) - (parseInt(a(c).css("paddingBottom"), 10) || 0) - this.helperProportions.height - this.margins.top]
            } else {
                if (e.containment.constructor == Array) {
                    this.containment = e.containment
                }
            }
        },
        _convertPositionTo: function (f, h) {
            if (!h) {
                h = this.position
            }
            var c = f == "absolute" ? 1 : -1;
            var e = this.options,
                b = this.cssPosition == "absolute" && !(this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) ? this.offsetParent : this.scrollParent,
                g = (/(html|body)/i).test(b[0].tagName);
            return {
                top: (h.top + this.offset.relative.top * c + this.offset.parent.top * c - (a.browser.safari && a.browser.version < 526 && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollTop() : (g ? 0 : b.scrollTop())) * c)),
                left: (h.left + this.offset.relative.left * c + this.offset.parent.left * c - (a.browser.safari && a.browser.version < 526 && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollLeft() : g ? 0 : b.scrollLeft()) * c))
            }
        },
        _generatePosition: function (e) {
            var h = this.options,
                b = this.cssPosition == "absolute" && !(this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) ? this.offsetParent : this.scrollParent,
                i = (/(html|body)/i).test(b[0].tagName);
            var d = e.pageX;
            var c = e.pageY;
            if (this.originalPosition) {
                if (this.containment) {
                    if (e.pageX - this.offset.click.left < this.containment[0]) {
                        d = this.containment[0] + this.offset.click.left
                    }
                    if (e.pageY - this.offset.click.top < this.containment[1]) {
                        c = this.containment[1] + this.offset.click.top
                    }
                    if (e.pageX - this.offset.click.left > this.containment[2]) {
                        d = this.containment[2] + this.offset.click.left
                    }
                    if (e.pageY - this.offset.click.top > this.containment[3]) {
                        c = this.containment[3] + this.offset.click.top
                    }
                }
                if (h.grid) {
                    var g = this.originalPageY + Math.round((c - this.originalPageY) / h.grid[1]) * h.grid[1];
                    c = this.containment ? (!(g - this.offset.click.top < this.containment[1] || g - this.offset.click.top > this.containment[3]) ? g : (!(g - this.offset.click.top < this.containment[1]) ? g - h.grid[1] : g + h.grid[1])) : g;
                    var f = this.originalPageX + Math.round((d - this.originalPageX) / h.grid[0]) * h.grid[0];
                    d = this.containment ? (!(f - this.offset.click.left < this.containment[0] || f - this.offset.click.left > this.containment[2]) ? f : (!(f - this.offset.click.left < this.containment[0]) ? f - h.grid[0] : f + h.grid[0])) : f
                }
            }
            return {
                top: (c - this.offset.click.top - this.offset.relative.top - this.offset.parent.top + (a.browser.safari && a.browser.version < 526 && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollTop() : (i ? 0 : b.scrollTop())))),
                left: (d - this.offset.click.left - this.offset.relative.left - this.offset.parent.left + (a.browser.safari && a.browser.version < 526 && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollLeft() : i ? 0 : b.scrollLeft())))
            }
        },
        _clear: function () {
            this.helper.removeClass("ui-draggable-dragging");
            if (this.helper[0] != this.element[0] && !this.cancelHelperRemoval) {
                this.helper.remove()
            }
            this.helper = null;
            this.cancelHelperRemoval = false
        },
        _trigger: function (b, c, d) {
            d = d || this._uiHash();
            a.ui.plugin.call(this, b, [c, d]);
            if (b == "drag") {
                this.positionAbs = this._convertPositionTo("absolute")
            }
            return a.Widget.prototype._trigger.call(this, b, c, d)
        },
        plugins: {},
        _uiHash: function (b) {
            return {
                helper: this.helper,
                position: this.position,
                originalPosition: this.originalPosition,
                offset: this.positionAbs
            }
        }
    });
    a.extend(a.ui.draggable, {
        version: "1.8rc3"
    });
    a.ui.plugin.add("draggable", "connectToSortable", {
        start: function (c, e) {
            var d = a(this).data("draggable"),
                f = d.options,
                b = a.extend({}, e, {
                    item: d.element
                });
            d.sortables = [];
            a(f.connectToSortable).each(function () {
                var g = a.data(this, "sortable");
                if (g && !g.options.disabled) {
                    d.sortables.push({
                        instance: g,
                        shouldRevert: g.options.revert
                    });
                    g._refreshItems();
                    g._trigger("activate", c, b)
                }
            })
        },
        stop: function (c, e) {
            var d = a(this).data("draggable"),
                b = a.extend({}, e, {
                    item: d.element
                });
            a.each(d.sortables, function () {
                if (this.instance.isOver) {
                    this.instance.isOver = 0;
                    d.cancelHelperRemoval = true;
                    this.instance.cancelHelperRemoval = false;
                    if (this.shouldRevert) {
                        this.instance.options.revert = true
                    }
                    this.instance._mouseStop(c);
                    this.instance.options.helper = this.instance.options._helper;
                    if (d.options.helper == "original") {
                        this.instance.currentItem.css({
                            top: "auto",
                            left: "auto"
                        })
                    }
                } else {
                    this.instance.cancelHelperRemoval = false;
                    this.instance._trigger("deactivate", c, b)
                }
            })
        },
        drag: function (c, f) {
            var e = a(this).data("draggable"),
                b = this;
            var d = function (i) {
                var n = this.offset.click.top,
                    m = this.offset.click.left;
                var g = this.positionAbs.top,
                    k = this.positionAbs.left;
                var j = i.height,
                    l = i.width;
                var p = i.top,
                    h = i.left;
                return a.ui.isOver(g + n, k + m, p, h, j, l)
            };
            a.each(e.sortables, function (g) {
                this.instance.positionAbs = e.positionAbs;
                this.instance.helperProportions = e.helperProportions;
                this.instance.offset.click = e.offset.click;
                if (this.instance._intersectsWith(this.instance.containerCache)) {
                    if (!this.instance.isOver) {
                        this.instance.isOver = 1;
                        this.instance.currentItem = a(b).clone().appendTo(this.instance.element).data("sortable-item", true);
                        this.instance.options._helper = this.instance.options.helper;
                        this.instance.options.helper = function () {
                            return f.helper[0]
                        };
                        c.target = this.instance.currentItem[0];
                        this.instance._mouseCapture(c, true);
                        this.instance._mouseStart(c, true, true);
                        this.instance.offset.click.top = e.offset.click.top;
                        this.instance.offset.click.left = e.offset.click.left;
                        this.instance.offset.parent.left -= e.offset.parent.left - this.instance.offset.parent.left;
                        this.instance.offset.parent.top -= e.offset.parent.top - this.instance.offset.parent.top;
                        e._trigger("toSortable", c);
                        e.dropped = this.instance.element;
                        e.currentItem = e.element;
                        this.instance.fromOutside = e
                    }
                    if (this.instance.currentItem) {
                        this.instance._mouseDrag(c)
                    }
                } else {
                    if (this.instance.isOver) {
                        this.instance.isOver = 0;
                        this.instance.cancelHelperRemoval = true;
                        this.instance.options.revert = false;
                        this.instance._trigger("out", c, this.instance._uiHash(this.instance));
                        this.instance._mouseStop(c, true);
                        this.instance.options.helper = this.instance.options._helper;
                        this.instance.currentItem.remove();
                        if (this.instance.placeholder) {
                            this.instance.placeholder.remove()
                        }
                        e._trigger("fromSortable", c);
                        e.dropped = false
                    }
                }
            })
        }
    });
    a.ui.plugin.add("draggable", "cursor", {
        start: function (c, d) {
            var b = a("body"),
                e = a(this).data("draggable").options;
            if (b.css("cursor")) {
                e._cursor = b.css("cursor")
            }
            b.css("cursor", e.cursor)
        },
        stop: function (b, c) {
            var d = a(this).data("draggable").options;
            if (d._cursor) {
                a("body").css("cursor", d._cursor)
            }
        }
    });
    a.ui.plugin.add("draggable", "iframeFix", {
        start: function (b, c) {
            var d = a(this).data("draggable").options;
            a(d.iframeFix === true ? "iframe" : d.iframeFix).each(function () {
                a('<div class="ui-draggable-iframeFix" style="background: #fff;"></div>').css({
                    width: this.offsetWidth + "px",
                    height: this.offsetHeight + "px",
                    position: "absolute",
                    opacity: "0.001",
                    zIndex: 1000
                }).css(a(this).offset()).appendTo("body")
            })
        },
        stop: function (b, c) {
            a("div.ui-draggable-iframeFix").each(function () {
                this.parentNode.removeChild(this)
            })
        }
    });
    a.ui.plugin.add("draggable", "opacity", {
        start: function (c, d) {
            var b = a(d.helper),
                e = a(this).data("draggable").options;
            if (b.css("opacity")) {
                e._opacity = b.css("opacity")
            }
            b.css("opacity", e.opacity)
        },
        stop: function (b, c) {
            var d = a(this).data("draggable").options;
            if (d._opacity) {
                a(c.helper).css("opacity", d._opacity)
            }
        }
    });
    a.ui.plugin.add("draggable", "scroll", {
        start: function (c, d) {
            var b = a(this).data("draggable");
            if (b.scrollParent[0] != document && b.scrollParent[0].tagName != "HTML") {
                b.overflowOffset = b.scrollParent.offset()
            }
        },
        drag: function (d, e) {
            var c = a(this).data("draggable"),
                f = c.options,
                b = false;
            if (c.scrollParent[0] != document && c.scrollParent[0].tagName != "HTML") {
                if (!f.axis || f.axis != "x") {
                    if ((c.overflowOffset.top + c.scrollParent[0].offsetHeight) - d.pageY < f.scrollSensitivity) {
                        c.scrollParent[0].scrollTop = b = c.scrollParent[0].scrollTop + f.scrollSpeed
                    } else {
                        if (d.pageY - c.overflowOffset.top < f.scrollSensitivity) {
                            c.scrollParent[0].scrollTop = b = c.scrollParent[0].scrollTop - f.scrollSpeed
                        }
                    }
                }
                if (!f.axis || f.axis != "y") {
                    if ((c.overflowOffset.left + c.scrollParent[0].offsetWidth) - d.pageX < f.scrollSensitivity) {
                        c.scrollParent[0].scrollLeft = b = c.scrollParent[0].scrollLeft + f.scrollSpeed
                    } else {
                        if (d.pageX - c.overflowOffset.left < f.scrollSensitivity) {
                            c.scrollParent[0].scrollLeft = b = c.scrollParent[0].scrollLeft - f.scrollSpeed
                        }
                    }
                }
            } else {
                if (!f.axis || f.axis != "x") {
                    if (d.pageY - a(document).scrollTop() < f.scrollSensitivity) {
                        b = a(document).scrollTop(a(document).scrollTop() - f.scrollSpeed)
                    } else {
                        if (a(window).height() - (d.pageY - a(document).scrollTop()) < f.scrollSensitivity) {
                            b = a(document).scrollTop(a(document).scrollTop() + f.scrollSpeed)
                        }
                    }
                }
                if (!f.axis || f.axis != "y") {
                    if (d.pageX - a(document).scrollLeft() < f.scrollSensitivity) {
                        b = a(document).scrollLeft(a(document).scrollLeft() - f.scrollSpeed)
                    } else {
                        if (a(window).width() - (d.pageX - a(document).scrollLeft()) < f.scrollSensitivity) {
                            b = a(document).scrollLeft(a(document).scrollLeft() + f.scrollSpeed)
                        }
                    }
                }
            }
            if (b !== false && a.ui.ddmanager && !f.dropBehaviour) {
                a.ui.ddmanager.prepareOffsets(c, d)
            }
        }
    });
    a.ui.plugin.add("draggable", "snap", {
        start: function (c, d) {
            var b = a(this).data("draggable"),
                e = b.options;
            b.snapElements = [];
            a(e.snap.constructor != String ? (e.snap.items || ":data(draggable)") : e.snap).each(function () {
                var g = a(this);
                var f = g.offset();
                if (this != b.element[0]) {
                    b.snapElements.push({
                        item: this,
                        width: g.outerWidth(),
                        height: g.outerHeight(),
                        top: f.top,
                        left: f.left
                    })
                }
            })
        },
        drag: function (u, p) {
            var g = a(this).data("draggable"),
                q = g.options;
            var y = q.snapTolerance;
            var x = p.offset.left,
                w = x + g.helperProportions.width,
                f = p.offset.top,
                e = f + g.helperProportions.height;
            for (var v = g.snapElements.length - 1; v >= 0; v--) {
                var s = g.snapElements[v].left,
                    n = s + g.snapElements[v].width,
                    m = g.snapElements[v].top,
                    A = m + g.snapElements[v].height;
                if (!((s - y < x && x < n + y && m - y < f && f < A + y) || (s - y < x && x < n + y && m - y < e && e < A + y) || (s - y < w && w < n + y && m - y < f && f < A + y) || (s - y < w && w < n + y && m - y < e && e < A + y))) {
                    if (g.snapElements[v].snapping) {
                        (g.options.snap.release && g.options.snap.release.call(g.element, u, a.extend(g._uiHash(), {
                            snapItem: g.snapElements[v].item
                        })))
                    }
                    g.snapElements[v].snapping = false;
                    continue
                }
                if (q.snapMode != "inner") {
                    var c = Math.abs(m - e) <= y;
                    var z = Math.abs(A - f) <= y;
                    var j = Math.abs(s - w) <= y;
                    var k = Math.abs(n - x) <= y;
                    if (c) {
                        p.position.top = g._convertPositionTo("relative", {
                            top: m - g.helperProportions.height,
                            left: 0
                        }).top - g.margins.top
                    }
                    if (z) {
                        p.position.top = g._convertPositionTo("relative", {
                            top: A,
                            left: 0
                        }).top - g.margins.top
                    }
                    if (j) {
                        p.position.left = g._convertPositionTo("relative", {
                            top: 0,
                            left: s - g.helperProportions.width
                        }).left - g.margins.left
                    }
                    if (k) {
                        p.position.left = g._convertPositionTo("relative", {
                            top: 0,
                            left: n
                        }).left - g.margins.left
                    }
                }
                var h = (c || z || j || k);
                if (q.snapMode != "outer") {
                    var c = Math.abs(m - f) <= y;
                    var z = Math.abs(A - e) <= y;
                    var j = Math.abs(s - x) <= y;
                    var k = Math.abs(n - w) <= y;
                    if (c) {
                        p.position.top = g._convertPositionTo("relative", {
                            top: m,
                            left: 0
                        }).top - g.margins.top
                    }
                    if (z) {
                        p.position.top = g._convertPositionTo("relative", {
                            top: A - g.helperProportions.height,
                            left: 0
                        }).top - g.margins.top
                    }
                    if (j) {
                        p.position.left = g._convertPositionTo("relative", {
                            top: 0,
                            left: s
                        }).left - g.margins.left
                    }
                    if (k) {
                        p.position.left = g._convertPositionTo("relative", {
                            top: 0,
                            left: n - g.helperProportions.width
                        }).left - g.margins.left
                    }
                }
                if (!g.snapElements[v].snapping && (c || z || j || k || h)) {
                    (g.options.snap.snap && g.options.snap.snap.call(g.element, u, a.extend(g._uiHash(), {
                        snapItem: g.snapElements[v].item
                    })))
                }
                g.snapElements[v].snapping = (c || z || j || k || h)
            }
        }
    });
    a.ui.plugin.add("draggable", "stack", {
        start: function (c, d) {
            var f = a(this).data("draggable").options;
            var e = a.makeArray(a(f.stack)).sort(function (h, g) {
                return (parseInt(a(h).css("zIndex"), 10) || 0) - (parseInt(a(g).css("zIndex"), 10) || 0)
            });
            if (!e.length) {
                return
            }
            var b = parseInt(e[0].style.zIndex) || 0;
            a(e).each(function (g) {
                this.style.zIndex = b + g
            });
            this[0].style.zIndex = b + e.length
        }
    });
    a.ui.plugin.add("draggable", "zIndex", {
        start: function (c, d) {
            var b = a(d.helper),
                e = a(this).data("draggable").options;
            if (b.css("zIndex")) {
                e._zIndex = b.css("zIndex")
            }
            b.css("zIndex", e.zIndex)
        },
        stop: function (b, c) {
            var d = a(this).data("draggable").options;
            if (d._zIndex) {
                a(c.helper).css("zIndex", d._zIndex)
            }
        }
    })
})(jQuery);;
(function (a) {
    a.widget("ui.droppable", {
        widgetEventPrefix: "drop",
        options: {
            accept: "*",
            activeClass: false,
            addClasses: true,
            greedy: false,
            hoverClass: false,
            scope: "default",
            tolerance: "intersect"
        },
        _create: function () {
            var c = this.options,
                b = c.accept;
            this.isover = 0;
            this.isout = 1;
            this.accept = a.isFunction(b) ? b : function (e) {
                return e.is(b)
            };
            this.proportions = {
                width: this.element[0].offsetWidth,
                height: this.element[0].offsetHeight
            };
            a.ui.ddmanager.droppables[c.scope] = a.ui.ddmanager.droppables[c.scope] || [];
            a.ui.ddmanager.droppables[c.scope].push(this);
            (c.addClasses && this.element.addClass("ui-droppable"))
        },
        destroy: function () {
            var b = a.ui.ddmanager.droppables[this.options.scope];
            for (var c = 0; c < b.length; c++) {
                if (b[c] == this) {
                    b.splice(c, 1)
                }
            }
            this.element.removeClass("ui-droppable ui-droppable-disabled").removeData("droppable").unbind(".droppable");
            return this
        },
        _setOption: function (b, c) {
            if (b == "accept") {
                this.accept = a.isFunction(c) ? c : function (e) {
                    return e.is(c)
                }
            }
            a.Widget.prototype._setOption.apply(this, arguments)
        },
        _activate: function (c) {
            var b = a.ui.ddmanager.current;
            if (this.options.activeClass) {
                this.element.addClass(this.options.activeClass)
            }(b && this._trigger("activate", c, this.ui(b)))
        },
        _deactivate: function (c) {
            var b = a.ui.ddmanager.current;
            if (this.options.activeClass) {
                this.element.removeClass(this.options.activeClass)
            }(b && this._trigger("deactivate", c, this.ui(b)))
        },
        _over: function (c) {
            var b = a.ui.ddmanager.current;
            if (!b || (b.currentItem || b.element)[0] == this.element[0]) {
                return
            }
            if (this.accept.call(this.element[0], (b.currentItem || b.element))) {
                if (this.options.hoverClass) {
                    this.element.addClass(this.options.hoverClass)
                }
                this._trigger("over", c, this.ui(b))
            }
        },
        _out: function (c) {
            var b = a.ui.ddmanager.current;
            if (!b || (b.currentItem || b.element)[0] == this.element[0]) {
                return
            }
            if (this.accept.call(this.element[0], (b.currentItem || b.element))) {
                if (this.options.hoverClass) {
                    this.element.removeClass(this.options.hoverClass)
                }
                this._trigger("out", c, this.ui(b))
            }
        },
        _drop: function (c, d) {
            var b = d || a.ui.ddmanager.current;
            if (!b || (b.currentItem || b.element)[0] == this.element[0]) {
                return false
            }
            var e = false;
            this.element.find(":data(droppable)").not(".ui-draggable-dragging").each(function () {
                var f = a.data(this, "droppable");
                if (f.options.greedy && !f.options.disabled && f.options.scope == b.options.scope && f.accept.call(f.element[0], (b.currentItem || b.element)) && a.ui.intersect(b, a.extend(f, {
                    offset: f.element.offset()
                }), f.options.tolerance)) {
                    e = true;
                    return false
                }
            });
            if (e) {
                return false
            }
            if (this.accept.call(this.element[0], (b.currentItem || b.element))) {
                if (this.options.activeClass) {
                    this.element.removeClass(this.options.activeClass)
                }
                if (this.options.hoverClass) {
                    this.element.removeClass(this.options.hoverClass)
                }
                this._trigger("drop", c, this.ui(b));
                return this.element
            }
            return false
        },
        ui: function (b) {
            return {
                draggable: (b.currentItem || b.element),
                helper: b.helper,
                position: b.position,
                offset: b.positionAbs
            }
        }
    });
    a.extend(a.ui.droppable, {
        version: "1.8rc3"
    });
    a.ui.intersect = function (q, j, o) {
        if (!j.offset) {
            return false
        }
        var e = (q.positionAbs || q.position.absolute).left,
            d = e + q.helperProportions.width,
            n = (q.positionAbs || q.position.absolute).top,
            m = n + q.helperProportions.height;
        var g = j.offset.left,
            c = g + j.proportions.width,
            p = j.offset.top,
            k = p + j.proportions.height;
        switch (o) {
        case "fit":
            return (g < e && d < c && p < n && m < k);
            break;
        case "intersect":
            return (g < e + (q.helperProportions.width / 2) && d - (q.helperProportions.width / 2) < c && p < n + (q.helperProportions.height / 2) && m - (q.helperProportions.height / 2) < k);
            break;
        case "pointer":
            var h = ((q.positionAbs || q.position.absolute).left + (q.clickOffset || q.offset.click).left),
                i = ((q.positionAbs || q.position.absolute).top + (q.clickOffset || q.offset.click).top),
                f = a.ui.isOver(i, h, p, g, j.proportions.height, j.proportions.width);
            return f;
            break;
        case "touch":
            return ((n >= p && n <= k) || (m >= p && m <= k) || (n < p && m > k)) && ((e >= g && e <= c) || (d >= g && d <= c) || (e < g && d > c));
            break;
        default:
            return false;
            break
        }
    };
    a.ui.ddmanager = {
        current: null,
        droppables: {
            "default": []
        },
        prepareOffsets: function (e, g) {
            var b = a.ui.ddmanager.droppables[e.options.scope] || [];
            var f = g ? g.type : null;
            var h = (e.currentItem || e.element).find(":data(droppable)").andSelf();
            droppablesLoop: for (var d = 0; d < b.length; d++) {
                if (b[d].options.disabled || (e && !b[d].accept.call(b[d].element[0], (e.currentItem || e.element)))) {
                    continue
                }
                for (var c = 0; c < h.length; c++) {
                    if (h[c] == b[d].element[0]) {
                        b[d].proportions.height = 0;
                        continue droppablesLoop
                    }
                }
                b[d].visible = b[d].element.css("display") != "none";
                if (!b[d].visible) {
                    continue
                }
                b[d].offset = b[d].element.offset();
                b[d].proportions = {
                    width: b[d].element[0].offsetWidth,
                    height: b[d].element[0].offsetHeight
                };
                if (f == "mousedown") {
                    b[d]._activate.call(b[d], g)
                }
            }
        },
        drop: function (b, c) {
            var d = false;
            a.each(a.ui.ddmanager.droppables[b.options.scope] || [], function () {
                if (!this.options) {
                    return
                }
                if (!this.options.disabled && this.visible && a.ui.intersect(b, this, this.options.tolerance)) {
                    d = d || this._drop.call(this, c)
                }
                if (!this.options.disabled && this.visible && this.accept.call(this.element[0], (b.currentItem || b.element))) {
                    this.isout = 1;
                    this.isover = 0;
                    this._deactivate.call(this, c)
                }
            });
            return d
        },
        drag: function (b, c) {
            if (b.options.refreshPositions) {
                a.ui.ddmanager.prepareOffsets(b, c)
            }
            a.each(a.ui.ddmanager.droppables[b.options.scope] || [], function () {
                if (this.options.disabled || this.greedyChild || !this.visible) {
                    return
                }
                var e = a.ui.intersect(b, this, this.options.tolerance);
                var g = !e && this.isover == 1 ? "isout" : (e && this.isover == 0 ? "isover" : null);
                if (!g) {
                    return
                }
                var f;
                if (this.options.greedy) {
                    var d = this.element.parents(":data(droppable):eq(0)");
                    if (d.length) {
                        f = a.data(d[0], "droppable");
                        f.greedyChild = (g == "isover" ? 1 : 0)
                    }
                }
                if (f && g == "isover") {
                    f.isover = 0;
                    f.isout = 1;
                    f._out.call(f, c)
                }
                this[g] = 1;
                this[g == "isout" ? "isover" : "isout"] = 0;
                this[g == "isover" ? "_over" : "_out"].call(this, c);
                if (f && g == "isout") {
                    f.isout = 0;
                    f.isover = 1;
                    f._over.call(f, c)
                }
            })
        }
    }
})(jQuery);;
(function (c) {
    c.widget("ui.resizable", c.ui.mouse, {
        widgetEventPrefix: "resize",
        options: {
            alsoResize: false,
            animate: false,
            animateDuration: "slow",
            animateEasing: "swing",
            aspectRatio: false,
            autoHide: false,
            containment: false,
            ghost: false,
            grid: false,
            handles: "e,s,se",
            helper: false,
            maxHeight: null,
            maxWidth: null,
            minHeight: 10,
            minWidth: 10,
            zIndex: 1000
        },
        _create: function () {
            var e = this,
                j = this.options;
            this.element.addClass("ui-resizable");
            c.extend(this, {
                _aspectRatio: !! (j.aspectRatio),
                aspectRatio: j.aspectRatio,
                originalElement: this.element,
                _proportionallyResizeElements: [],
                _helper: j.helper || j.ghost || j.animate ? j.helper || "ui-resizable-helper" : null
            });
            if (this.element[0].nodeName.match(/canvas|textarea|input|select|button|img/i)) {
                if (/relative/.test(this.element.css("position")) && c.browser.opera) {
                    this.element.css({
                        position: "relative",
                        top: "auto",
                        left: "auto"
                    })
                }
                this.element.wrap(c('<div class="ui-wrapper" style="overflow: hidden;"></div>').css({
                    position: this.element.css("position"),
                    width: this.element.outerWidth(),
                    height: this.element.outerHeight(),
                    top: this.element.css("top"),
                    left: this.element.css("left")
                }));
                this.element = this.element.parent().data("resizable", this.element.data("resizable"));
                this.elementIsWrapper = true;
                this.element.css({
                    marginLeft: this.originalElement.css("marginLeft"),
                    marginTop: this.originalElement.css("marginTop"),
                    marginRight: this.originalElement.css("marginRight"),
                    marginBottom: this.originalElement.css("marginBottom")
                });
                this.originalElement.css({
                    marginLeft: 0,
                    marginTop: 0,
                    marginRight: 0,
                    marginBottom: 0
                });
                this.originalResizeStyle = this.originalElement.css("resize");
                this.originalElement.css("resize", "none");
                this._proportionallyResizeElements.push(this.originalElement.css({
                    position: "static",
                    zoom: 1,
                    display: "block"
                }));
                this.originalElement.css({
                    margin: this.originalElement.css("margin")
                });
                this._proportionallyResize()
            }
            this.handles = j.handles || (!c(".ui-resizable-handle", this.element).length ? "e,s,se" : {
                n: ".ui-resizable-n",
                e: ".ui-resizable-e",
                s: ".ui-resizable-s",
                w: ".ui-resizable-w",
                se: ".ui-resizable-se",
                sw: ".ui-resizable-sw",
                ne: ".ui-resizable-ne",
                nw: ".ui-resizable-nw"
            });
            if (this.handles.constructor == String) {
                if (this.handles == "all") {
                    this.handles = "n,e,s,w,se,sw,ne,nw"
                }
                var k = this.handles.split(",");
                this.handles = {};
                for (var f = 0; f < k.length; f++) {
                    var h = c.trim(k[f]),
                        d = "ui-resizable-" + h;
                    var g = c('<div class="ui-resizable-handle ' + d + '"></div>');
                    if (/sw|se|ne|nw/.test(h)) {
                        g.css({
                            zIndex: ++j.zIndex
                        })
                    }
                    if ("se" == h) {
                        g.addClass("ui-icon ui-icon-gripsmall-diagonal-se")
                    }
                    this.handles[h] = ".ui-resizable-" + h;
                    this.element.append(g)
                }
            }
            this._renderAxis = function (p) {
                p = p || this.element;
                for (var m in this.handles) {
                    if (this.handles[m].constructor == String) {
                        this.handles[m] = c(this.handles[m], this.element).show()
                    }
                    if (this.elementIsWrapper && this.originalElement[0].nodeName.match(/textarea|input|select|button/i)) {
                        var n = c(this.handles[m], this.element),
                            o = 0;
                        o = /sw|ne|nw|se|n|s/.test(m) ? n.outerHeight() : n.outerWidth();
                        var l = ["padding", /ne|nw|n/.test(m) ? "Top" : /se|sw|s/.test(m) ? "Bottom" : /^e$/.test(m) ? "Right" : "Left"].join("");
                        p.css(l, o);
                        this._proportionallyResize()
                    }
                    if (!c(this.handles[m]).length) {
                        continue
                    }
                }
            };
            this._renderAxis(this.element);
            this._handles = c(".ui-resizable-handle", this.element).disableSelection();
            this._handles.mouseover(function () {
                if (!e.resizing) {
                    if (this.className) {
                        var i = this.className.match(/ui-resizable-(se|sw|ne|nw|n|e|s|w)/i)
                    }
                    e.axis = i && i[1] ? i[1] : "se"
                }
            });
            if (j.autoHide) {
                this._handles.hide();
                c(this.element).addClass("ui-resizable-autohide").hover(function () {
                    c(this).removeClass("ui-resizable-autohide");
                    e._handles.show()
                }, function () {
                    if (!e.resizing) {
                        c(this).addClass("ui-resizable-autohide");
                        e._handles.hide()
                    }
                })
            }
            this._mouseInit()
        },
        destroy: function () {
            this._mouseDestroy();
            var d = function (f) {
                c(f).removeClass("ui-resizable ui-resizable-disabled ui-resizable-resizing").removeData("resizable").unbind(".resizable").find(".ui-resizable-handle").remove()
            };
            if (this.elementIsWrapper) {
                d(this.element);
                var e = this.element;
                e.after(this.originalElement.css({
                    position: e.css("position"),
                    width: e.outerWidth(),
                    height: e.outerHeight(),
                    top: e.css("top"),
                    left: e.css("left")
                })).remove()
            }
            this.originalElement.css("resize", this.originalResizeStyle);
            d(this.originalElement);
            return this
        },
        _mouseCapture: function (e) {
            var f = false;
            for (var d in this.handles) {
                if (c(this.handles[d])[0] == e.target) {
                    f = true
                }
            }
            return !this.options.disabled && f
        },
        _mouseStart: function (f) {
            var i = this.options,
                e = this.element.position(),
                d = this.element;
            this.resizing = true;
            this.documentScroll = {
                top: c(document).scrollTop(),
                left: c(document).scrollLeft()
            };
            if (d.is(".ui-draggable") || (/absolute/).test(d.css("position"))) {
                d.css({
                    position: "absolute",
                    top: e.top,
                    left: e.left
                })
            }
            if (c.browser.opera && (/relative/).test(d.css("position"))) {
                d.css({
                    position: "relative",
                    top: "auto",
                    left: "auto"
                })
            }
            this._renderProxy();
            var j = b(this.helper.css("left")),
                g = b(this.helper.css("top"));
            if (i.containment) {
                j += c(i.containment).scrollLeft() || 0;
                g += c(i.containment).scrollTop() || 0
            }
            this.offset = this.helper.offset();
            this.position = {
                left: j,
                top: g
            };
            this.size = this._helper ? {
                width: d.outerWidth(),
                height: d.outerHeight()
            } : {
                width: d.width(),
                height: d.height()
            };
            this.originalSize = this._helper ? {
                width: d.outerWidth(),
                height: d.outerHeight()
            } : {
                width: d.width(),
                height: d.height()
            };
            this.originalPosition = {
                left: j,
                top: g
            };
            this.sizeDiff = {
                width: d.outerWidth() - d.width(),
                height: d.outerHeight() - d.height()
            };
            this.originalMousePosition = {
                left: f.pageX,
                top: f.pageY
            };
            this.aspectRatio = (typeof i.aspectRatio == "number") ? i.aspectRatio : ((this.originalSize.width / this.originalSize.height) || 1);
            var h = c(".ui-resizable-" + this.axis).css("cursor");
            c("body").css("cursor", h == "auto" ? this.axis + "-resize" : h);
            d.addClass("ui-resizable-resizing");
            this._propagate("start", f);
            return true
        },
        _mouseDrag: function (d) {
            var g = this.helper,
                f = this.options,
                l = {},
                p = this,
                i = this.originalMousePosition,
                m = this.axis;
            var q = (d.pageX - i.left) || 0,
                n = (d.pageY - i.top) || 0;
            var h = this._change[m];
            if (!h) {
                return false
            }
            var k = h.apply(this, [d, q, n]),
                j = c.browser.msie && c.browser.version < 7,
                e = this.sizeDiff;
            if (this._aspectRatio || d.shiftKey) {
                k = this._updateRatio(k, d)
            }
            k = this._respectSize(k, d);
            this._propagate("resize", d);
            g.css({
                top: this.position.top + "px",
                left: this.position.left + "px",
                width: this.size.width + "px",
                height: this.size.height + "px"
            });
            if (!this._helper && this._proportionallyResizeElements.length) {
                this._proportionallyResize()
            }
            this._updateCache(k);
            this._trigger("resize", d, this.ui());
            return false
        },
        _mouseStop: function (g) {
            this.resizing = false;
            var h = this.options,
                l = this;
            if (this._helper) {
                var f = this._proportionallyResizeElements,
                    d = f.length && (/textarea/i).test(f[0].nodeName),
                    e = d && c.ui.hasScroll(f[0], "left") ? 0 : l.sizeDiff.height,
                    j = d ? 0 : l.sizeDiff.width;
                var m = {
                    width: (l.size.width - j),
                    height: (l.size.height - e)
                },
                    i = (parseInt(l.element.css("left"), 10) + (l.position.left - l.originalPosition.left)) || null,
                    k = (parseInt(l.element.css("top"), 10) + (l.position.top - l.originalPosition.top)) || null;
                if (!h.animate) {
                    this.element.css(c.extend(m, {
                        top: k,
                        left: i
                    }))
                }
                l.helper.height(l.size.height);
                l.helper.width(l.size.width);
                if (this._helper && !h.animate) {
                    this._proportionallyResize()
                }
            }
            c("body").css("cursor", "auto");
            this.element.removeClass("ui-resizable-resizing");
            this._propagate("stop", g);
            if (this._helper) {
                this.helper.remove()
            }
            return false
        },
        _updateCache: function (d) {
            var e = this.options;
            this.offset = this.helper.offset();
            if (a(d.left)) {
                this.position.left = d.left
            }
            if (a(d.top)) {
                this.position.top = d.top
            }
            if (a(d.height)) {
                this.size.height = d.height
            }
            if (a(d.width)) {
                this.size.width = d.width
            }
        },
        _updateRatio: function (g, f) {
            var h = this.options,
                i = this.position,
                e = this.size,
                d = this.axis;
            if (g.height) {
                g.width = (e.height * this.aspectRatio)
            } else {
                if (g.width) {
                    g.height = (e.width / this.aspectRatio)
                }
            }
            if (d == "sw") {
                g.left = i.left + (e.width - g.width);
                g.top = null
            }
            if (d == "nw") {
                g.top = i.top + (e.height - g.height);
                g.left = i.left + (e.width - g.width)
            }
            return g
        },
        _respectSize: function (k, f) {
            var i = this.helper,
                h = this.options,
                q = this._aspectRatio || f.shiftKey,
                p = this.axis,
                s = a(k.width) && h.maxWidth && (h.maxWidth < k.width),
                l = a(k.height) && h.maxHeight && (h.maxHeight < k.height),
                g = a(k.width) && h.minWidth && (h.minWidth > k.width),
                r = a(k.height) && h.minHeight && (h.minHeight > k.height);
            if (g) {
                k.width = h.minWidth
            }
            if (r) {
                k.height = h.minHeight
            }
            if (s) {
                k.width = h.maxWidth
            }
            if (l) {
                k.height = h.maxHeight
            }
            var e = this.originalPosition.left + this.originalSize.width,
                n = this.position.top + this.size.height;
            var j = /sw|nw|w/.test(p),
                d = /nw|ne|n/.test(p);
            if (g && j) {
                k.left = e - h.minWidth
            }
            if (s && j) {
                k.left = e - h.maxWidth
            }
            if (r && d) {
                k.top = n - h.minHeight
            }
            if (l && d) {
                k.top = n - h.maxHeight
            }
            var m = !k.width && !k.height;
            if (m && !k.left && k.top) {
                k.top = null
            } else {
                if (m && !k.top && k.left) {
                    k.left = null
                }
            }
            return k
        },
        _proportionallyResize: function () {
            var j = this.options;
            if (!this._proportionallyResizeElements.length) {
                return
            }
            var f = this.helper || this.element;
            for (var e = 0; e < this._proportionallyResizeElements.length; e++) {
                var g = this._proportionallyResizeElements[e];
                if (!this.borderDif) {
                    var d = [g.css("borderTopWidth"), g.css("borderRightWidth"), g.css("borderBottomWidth"), g.css("borderLeftWidth")],
                        h = [g.css("paddingTop"), g.css("paddingRight"), g.css("paddingBottom"), g.css("paddingLeft")];
                    this.borderDif = c.map(d, function (k, m) {
                        var l = parseInt(k, 10) || 0,
                            n = parseInt(h[m], 10) || 0;
                        return l + n
                    })
                }
                if (c.browser.msie && !(!(c(f).is(":hidden") || c(f).parents(":hidden").length))) {
                    continue
                }
                g.css({
                    height: (f.height() - this.borderDif[0] - this.borderDif[2]) || 0,
                    width: (f.width() - this.borderDif[1] - this.borderDif[3]) || 0
                })
            }
        },
        _renderProxy: function () {
            var e = this.element,
                h = this.options;
            this.elementOffset = e.offset();
            if (this._helper) {
                this.helper = this.helper || c('<div style="overflow:hidden;"></div>');
                var d = c.browser.msie && c.browser.version < 7,
                    f = (d ? 1 : 0),
                    g = (d ? 2 : -1);
                this.helper.addClass(this._helper).css({
                    width: this.element.outerWidth() + g,
                    height: this.element.outerHeight() + g,
                    position: "absolute",
                    left: this.elementOffset.left - f + "px",
                    top: this.elementOffset.top - f + "px",
                    zIndex: ++h.zIndex
                });
                this.helper.appendTo("body").disableSelection()
            } else {
                this.helper = this.element
            }
        },
        _change: {
            e: function (f, e, d) {
                return {
                    width: this.originalSize.width + e
                }
            },
            w: function (g, e, d) {
                var i = this.options,
                    f = this.originalSize,
                    h = this.originalPosition;
                return {
                    left: h.left + e,
                    width: f.width - e
                }
            },
            n: function (g, e, d) {
                var i = this.options,
                    f = this.originalSize,
                    h = this.originalPosition;
                return {
                    top: h.top + d,
                    height: f.height - d
                }
            },
            s: function (f, e, d) {
                return {
                    height: this.originalSize.height + d
                }
            },
            se: function (f, e, d) {
                return c.extend(this._change.s.apply(this, arguments), this._change.e.apply(this, [f, e, d]))
            },
            sw: function (f, e, d) {
                return c.extend(this._change.s.apply(this, arguments), this._change.w.apply(this, [f, e, d]))
            },
            ne: function (f, e, d) {
                return c.extend(this._change.n.apply(this, arguments), this._change.e.apply(this, [f, e, d]))
            },
            nw: function (f, e, d) {
                return c.extend(this._change.n.apply(this, arguments), this._change.w.apply(this, [f, e, d]))
            }
        },
        _propagate: function (e, d) {
            c.ui.plugin.call(this, e, [d, this.ui()]);
            (e != "resize" && this._trigger(e, d, this.ui()))
        },
        plugins: {},
        ui: function () {
            return {
                originalElement: this.originalElement,
                element: this.element,
                helper: this.helper,
                position: this.position,
                size: this.size,
                originalSize: this.originalSize,
                originalPosition: this.originalPosition
            }
        }
    });
    c.extend(c.ui.resizable, {
        version: "1.8rc3"
    });
    c.ui.plugin.add("resizable", "alsoResize", {
        start: function (e, f) {
            var d = c(this).data("resizable"),
                h = d.options;
            var g = function (i) {
                c(i).each(function () {
                    c(this).data("resizable-alsoresize", {
                        width: parseInt(c(this).width(), 10),
                        height: parseInt(c(this).height(), 10),
                        left: parseInt(c(this).css("left"), 10),
                        top: parseInt(c(this).css("top"), 10)
                    })
                })
            };
            if (typeof(h.alsoResize) == "object" && !h.alsoResize.parentNode) {
                if (h.alsoResize.length) {
                    h.alsoResize = h.alsoResize[0];
                    g(h.alsoResize)
                } else {
                    c.each(h.alsoResize, function (i, j) {
                        g(i)
                    })
                }
            } else {
                g(h.alsoResize)
            }
        },
        resize: function (f, h) {
            var e = c(this).data("resizable"),
                i = e.options,
                g = e.originalSize,
                k = e.originalPosition;
            var j = {
                height: (e.size.height - g.height) || 0,
                width: (e.size.width - g.width) || 0,
                top: (e.position.top - k.top) || 0,
                left: (e.position.left - k.left) || 0
            },
                d = function (l, m) {
                    c(l).each(function () {
                        var p = c(this),
                            q = c(this).data("resizable-alsoresize"),
                            o = {},
                            n = m && m.length ? m : ["width", "height", "top", "left"];
                        c.each(n || ["width", "height", "top", "left"], function (r, t) {
                            var s = (q[t] || 0) + (j[t] || 0);
                            if (s && s >= 0) {
                                o[t] = s || null
                            }
                        });
                        if (/relative/.test(p.css("position")) && c.browser.opera) {
                            e._revertToRelativePosition = true;
                            p.css({
                                position: "absolute",
                                top: "auto",
                                left: "auto"
                            })
                        }
                        p.css(o)
                    })
                };
            if (typeof(i.alsoResize) == "object" && !i.alsoResize.nodeType) {
                c.each(i.alsoResize, function (l, m) {
                    d(l, m)
                })
            } else {
                d(i.alsoResize)
            }
        },
        stop: function (e, f) {
            var d = c(this).data("resizable");
            if (d._revertToRelativePosition && c.browser.opera) {
                d._revertToRelativePosition = false;
                el.css({
                    position: "relative"
                })
            }
            c(this).removeData("resizable-alsoresize-start")
        }
    });
    c.ui.plugin.add("resizable", "animate", {
        stop: function (h, m) {
            var n = c(this).data("resizable"),
                i = n.options;
            var g = n._proportionallyResizeElements,
                d = g.length && (/textarea/i).test(g[0].nodeName),
                e = d && c.ui.hasScroll(g[0], "left") ? 0 : n.sizeDiff.height,
                k = d ? 0 : n.sizeDiff.width;
            var f = {
                width: (n.size.width - k),
                height: (n.size.height - e)
            },
                j = (parseInt(n.element.css("left"), 10) + (n.position.left - n.originalPosition.left)) || null,
                l = (parseInt(n.element.css("top"), 10) + (n.position.top - n.originalPosition.top)) || null;
            n.element.animate(c.extend(f, l && j ? {
                top: l,
                left: j
            } : {}), {
                duration: i.animateDuration,
                easing: i.animateEasing,
                step: function () {
                    var o = {
                        width: parseInt(n.element.css("width"), 10),
                        height: parseInt(n.element.css("height"), 10),
                        top: parseInt(n.element.css("top"), 10),
                        left: parseInt(n.element.css("left"), 10)
                    };
                    if (g && g.length) {
                        c(g[0]).css({
                            width: o.width,
                            height: o.height
                        })
                    }
                    n._updateCache(o);
                    n._propagate("resize", h)
                }
            })
        }
    });
    c.ui.plugin.add("resizable", "containment", {
        start: function (e, q) {
            var s = c(this).data("resizable"),
                i = s.options,
                k = s.element;
            var f = i.containment,
                j = (f instanceof c) ? f.get(0) : (/parent/.test(f)) ? k.parent().get(0) : f;
            if (!j) {
                return
            }
            s.containerElement = c(j);
            if (/document/.test(f) || f == document) {
                s.containerOffset = {
                    left: 0,
                    top: 0
                };
                s.containerPosition = {
                    left: 0,
                    top: 0
                };
                s.parentData = {
                    element: c(document),
                    left: 0,
                    top: 0,
                    width: c(document).width(),
                    height: c(document).height() || document.body.parentNode.scrollHeight
                }
            } else {
                var m = c(j),
                    h = [];
                c(["Top", "Right", "Left", "Bottom"]).each(function (p, o) {
                    h[p] = b(m.css("padding" + o))
                });
                s.containerOffset = m.offset();
                s.containerPosition = m.position();
                s.containerSize = {
                    height: (m.innerHeight() - h[3]),
                    width: (m.innerWidth() - h[1])
                };
                var n = s.containerOffset,
                    d = s.containerSize.height,
                    l = s.containerSize.width,
                    g = (c.ui.hasScroll(j, "left") ? j.scrollWidth : l),
                    r = (c.ui.hasScroll(j) ? j.scrollHeight : d);
                s.parentData = {
                    element: j,
                    left: n.left,
                    top: n.top,
                    width: g,
                    height: r
                }
            }
        },
        resize: function (f, p) {
            var s = c(this).data("resizable"),
                h = s.options,
                e = s.containerSize,
                n = s.containerOffset,
                l = s.size,
                m = s.position,
                q = s._aspectRatio || f.shiftKey,
                d = {
                    top: 0,
                    left: 0
                },
                g = s.containerElement;
            if (g[0] != document && (/static/).test(g.css("position"))) {
                d = n
            }
            if (m.left < (s._helper ? n.left : 0)) {
                s.size.width = s.size.width + (s._helper ? (s.position.left - n.left) : (s.position.left - d.left));
                if (q) {
                    s.size.height = s.size.width / h.aspectRatio
                }
                s.position.left = h.helper ? n.left : 0
            }
            if (m.top < (s._helper ? n.top : 0)) {
                s.size.height = s.size.height + (s._helper ? (s.position.top - n.top) : s.position.top);
                if (q) {
                    s.size.width = s.size.height * h.aspectRatio
                }
                s.position.top = s._helper ? n.top : 0
            }
            s.offset.left = s.parentData.left + s.position.left;
            s.offset.top = s.parentData.top + s.position.top;
            var k = Math.abs((s._helper ? s.offset.left - d.left : (s.offset.left - d.left)) + s.sizeDiff.width),
                r = Math.abs((s._helper ? s.offset.top - d.top : (s.offset.top - n.top)) + s.sizeDiff.height);
            var j = s.containerElement.get(0) == s.element.parent().get(0),
                i = /relative|absolute/.test(s.containerElement.css("position"));
            if (j && i) {
                k -= s.parentData.left
            }
            if (k + s.size.width >= s.parentData.width) {
                s.size.width = s.parentData.width - k;
                if (q) {
                    s.size.height = s.size.width / s.aspectRatio
                }
            }
            if (r + s.size.height >= s.parentData.height) {
                s.size.height = s.parentData.height - r;
                if (q) {
                    s.size.width = s.size.height * s.aspectRatio
                }
            }
        },
        stop: function (e, m) {
            var p = c(this).data("resizable"),
                f = p.options,
                k = p.position,
                l = p.containerOffset,
                d = p.containerPosition,
                g = p.containerElement;
            var i = c(p.helper),
                q = i.offset(),
                n = i.outerWidth() - p.sizeDiff.width,
                j = i.outerHeight() - p.sizeDiff.height;
            if (p._helper && !f.animate && (/relative/).test(g.css("position"))) {
                c(this).css({
                    left: q.left - d.left - l.left,
                    width: n,
                    height: j
                })
            }
            if (p._helper && !f.animate && (/static/).test(g.css("position"))) {
                c(this).css({
                    left: q.left - d.left - l.left,
                    width: n,
                    height: j
                })
            }
        }
    });
    c.ui.plugin.add("resizable", "ghost", {
        start: function (f, g) {
            var d = c(this).data("resizable"),
                h = d.options,
                e = d.size;
            d.ghost = d.originalElement.clone();
            d.ghost.css({
                opacity: 0.25,
                display: "block",
                position: "relative",
                height: e.height,
                width: e.width,
                margin: 0,
                left: 0,
                top: 0
            }).addClass("ui-resizable-ghost").addClass(typeof h.ghost == "string" ? h.ghost : "");
            d.ghost.appendTo(d.helper)
        },
        resize: function (e, f) {
            var d = c(this).data("resizable"),
                g = d.options;
            if (d.ghost) {
                d.ghost.css({
                    position: "relative",
                    height: d.size.height,
                    width: d.size.width
                })
            }
        },
        stop: function (e, f) {
            var d = c(this).data("resizable"),
                g = d.options;
            if (d.ghost && d.helper) {
                d.helper.get(0).removeChild(d.ghost.get(0))
            }
        }
    });
    c.ui.plugin.add("resizable", "grid", {
        resize: function (d, l) {
            var n = c(this).data("resizable"),
                g = n.options,
                j = n.size,
                h = n.originalSize,
                i = n.originalPosition,
                m = n.axis,
                k = g._aspectRatio || d.shiftKey;
            g.grid = typeof g.grid == "number" ? [g.grid, g.grid] : g.grid;
            var f = Math.round((j.width - h.width) / (g.grid[0] || 1)) * (g.grid[0] || 1),
                e = Math.round((j.height - h.height) / (g.grid[1] || 1)) * (g.grid[1] || 1);
            if (/^(se|s|e)$/.test(m)) {
                n.size.width = h.width + f;
                n.size.height = h.height + e
            } else {
                if (/^(ne)$/.test(m)) {
                    n.size.width = h.width + f;
                    n.size.height = h.height + e;
                    n.position.top = i.top - e
                } else {
                    if (/^(sw)$/.test(m)) {
                        n.size.width = h.width + f;
                        n.size.height = h.height + e;
                        n.position.left = i.left - f
                    } else {
                        n.size.width = h.width + f;
                        n.size.height = h.height + e;
                        n.position.top = i.top - e;
                        n.position.left = i.left - f
                    }
                }
            }
        }
    });
    var b = function (d) {
        return parseInt(d, 10) || 0
    };
    var a = function (d) {
        return !isNaN(parseInt(d, 10))
    }
})(jQuery);;
(function (a) {
    a.widget("ui.selectable", a.ui.mouse, {
        options: {
            appendTo: "body",
            autoRefresh: true,
            distance: 0,
            filter: "*",
            tolerance: "touch"
        },
        _create: function () {
            var b = this;
            this.element.addClass("ui-selectable");
            this.dragged = false;
            var c;
            this.refresh = function () {
                c = a(b.options.filter, b.element[0]);
                c.each(function () {
                    var d = a(this);
                    var e = d.offset();
                    a.data(this, "selectable-item", {
                        element: this,
                        $element: d,
                        left: e.left,
                        top: e.top,
                        right: e.left + d.outerWidth(),
                        bottom: e.top + d.outerHeight(),
                        startselected: false,
                        selected: d.hasClass("ui-selected"),
                        selecting: d.hasClass("ui-selecting"),
                        unselecting: d.hasClass("ui-unselecting")
                    })
                })
            };
            this.refresh();
            this.selectees = c.addClass("ui-selectee");
            this._mouseInit();
            this.helper = a(document.createElement("div")).css({
                border: "1px dotted black"
            }).addClass("ui-selectable-helper")
        },
        destroy: function () {
            this.selectees.removeClass("ui-selectee").removeData("selectable-item");
            this.element.removeClass("ui-selectable ui-selectable-disabled").removeData("selectable").unbind(".selectable");
            this._mouseDestroy();
            return this
        },
        _mouseStart: function (d) {
            var b = this;
            this.opos = [d.pageX, d.pageY];
            if (this.options.disabled) {
                return
            }
            var c = this.options;
            this.selectees = a(c.filter, this.element[0]);
            this._trigger("start", d);
            a(c.appendTo).append(this.helper);
            this.helper.css({
                "z-index": 100,
                position: "absolute",
                left: d.clientX,
                top: d.clientY,
                width: 0,
                height: 0
            });
            if (c.autoRefresh) {
                this.refresh()
            }
            this.selectees.filter(".ui-selected").each(function () {
                var e = a.data(this, "selectable-item");
                e.startselected = true;
                if (!d.metaKey) {
                    e.$element.removeClass("ui-selected");
                    e.selected = false;
                    e.$element.addClass("ui-unselecting");
                    e.unselecting = true;
                    b._trigger("unselecting", d, {
                        unselecting: e.element
                    })
                }
            });
            a(d.target).parents().andSelf().each(function () {
                var e = a.data(this, "selectable-item");
                if (e) {
                    e.$element.removeClass("ui-unselecting").addClass("ui-selecting");
                    e.unselecting = false;
                    e.selecting = true;
                    e.selected = true;
                    b._trigger("selecting", d, {
                        selecting: e.element
                    });
                    return false
                }
            })
        },
        _mouseDrag: function (i) {
            var c = this;
            this.dragged = true;
            if (this.options.disabled) {
                return
            }
            var e = this.options;
            var d = this.opos[0],
                h = this.opos[1],
                b = i.pageX,
                g = i.pageY;
            if (d > b) {
                var f = b;
                b = d;
                d = f
            }
            if (h > g) {
                var f = g;
                g = h;
                h = f
            }
            this.helper.css({
                left: d,
                top: h,
                width: b - d,
                height: g - h
            });
            this.selectees.each(function () {
                var j = a.data(this, "selectable-item");
                if (!j || j.element == c.element[0]) {
                    return
                }
                var k = false;
                if (e.tolerance == "touch") {
                    k = (!(j.left > b || j.right < d || j.top > g || j.bottom < h))
                } else {
                    if (e.tolerance == "fit") {
                        k = (j.left > d && j.right < b && j.top > h && j.bottom < g)
                    }
                }
                if (k) {
                    if (j.selected) {
                        j.$element.removeClass("ui-selected");
                        j.selected = false
                    }
                    if (j.unselecting) {
                        j.$element.removeClass("ui-unselecting");
                        j.unselecting = false
                    }
                    if (!j.selecting) {
                        j.$element.addClass("ui-selecting");
                        j.selecting = true;
                        c._trigger("selecting", i, {
                            selecting: j.element
                        })
                    }
                } else {
                    if (j.selecting) {
                        if (i.metaKey && j.startselected) {
                            j.$element.removeClass("ui-selecting");
                            j.selecting = false;
                            j.$element.addClass("ui-selected");
                            j.selected = true
                        } else {
                            j.$element.removeClass("ui-selecting");
                            j.selecting = false;
                            if (j.startselected) {
                                j.$element.addClass("ui-unselecting");
                                j.unselecting = true
                            }
                            c._trigger("unselecting", i, {
                                unselecting: j.element
                            })
                        }
                    }
                    if (j.selected) {
                        if (!i.metaKey && !j.startselected) {
                            j.$element.removeClass("ui-selected");
                            j.selected = false;
                            j.$element.addClass("ui-unselecting");
                            j.unselecting = true;
                            c._trigger("unselecting", i, {
                                unselecting: j.element
                            })
                        }
                    }
                }
            });
            return false
        },
        _mouseStop: function (d) {
            var b = this;
            this.dragged = false;
            var c = this.options;
            a(".ui-unselecting", this.element[0]).each(function () {
                var e = a.data(this, "selectable-item");
                e.$element.removeClass("ui-unselecting");
                e.unselecting = false;
                e.startselected = false;
                b._trigger("unselected", d, {
                    unselected: e.element
                })
            });
            a(".ui-selecting", this.element[0]).each(function () {
                var e = a.data(this, "selectable-item");
                e.$element.removeClass("ui-selecting").addClass("ui-selected");
                e.selecting = false;
                e.selected = true;
                e.startselected = true;
                b._trigger("selected", d, {
                    selected: e.element
                })
            });
            this._trigger("stop", d);
            this.helper.remove();
            return false
        }
    });
    a.extend(a.ui.selectable, {
        version: "1.8rc3"
    })
})(jQuery);;
(function (a) {
    a.widget("ui.sortable", a.ui.mouse, {
        widgetEventPrefix: "sort",
        options: {
            appendTo: "parent",
            axis: false,
            connectWith: false,
            containment: false,
            cursor: "auto",
            cursorAt: false,
            dropOnEmpty: true,
            forcePlaceholderSize: false,
            forceHelperSize: false,
            grid: false,
            handle: false,
            helper: "original",
            items: "> *",
            opacity: false,
            placeholder: false,
            revert: false,
            scroll: true,
            scrollSensitivity: 20,
            scrollSpeed: 20,
            scope: "default",
            tolerance: "intersect",
            zIndex: 1000
        },
        _create: function () {
            var b = this.options;
            this.containerCache = {};
            this.element.addClass("ui-sortable");
            this.refresh();
            this.floating = this.items.length ? (/left|right/).test(this.items[0].item.css("float")) : false;
            this.offset = this.element.offset();
            this._mouseInit()
        },
        destroy: function () {
            this.element.removeClass("ui-sortable ui-sortable-disabled").removeData("sortable").unbind(".sortable");
            this._mouseDestroy();
            for (var b = this.items.length - 1; b >= 0; b--) {
                this.items[b].item.removeData("sortable-item")
            }
            return this
        },
        _mouseCapture: function (e, f) {
            if (this.reverting) {
                return false
            }
            if (this.options.disabled || this.options.type == "static") {
                return false
            }
            this._refreshItems(e);
            var d = null,
                c = this,
                b = a(e.target).parents().each(function () {
                    if (a.data(this, "sortable-item") == c) {
                        d = a(this);
                        return false
                    }
                });
            if (a.data(e.target, "sortable-item") == c) {
                d = a(e.target)
            }
            if (!d) {
                return false
            }
            if (this.options.handle && !f) {
                var g = false;
                a(this.options.handle, d).find("*").andSelf().each(function () {
                    if (this == e.target) {
                        g = true
                    }
                });
                if (!g) {
                    return false
                }
            }
            this.currentItem = d;
            this._removeCurrentsFromItems();
            return true
        },
        _mouseStart: function (e, f, b) {
            var g = this.options,
                c = this;
            this.currentContainer = this;
            this.refreshPositions();
            this.helper = this._createHelper(e);
            this._cacheHelperProportions();
            this._cacheMargins();
            this.scrollParent = this.helper.scrollParent();
            this.offset = this.currentItem.offset();
            this.offset = {
                top: this.offset.top - this.margins.top,
                left: this.offset.left - this.margins.left
            };
            this.helper.css("position", "absolute");
            this.cssPosition = this.helper.css("position");
            a.extend(this.offset, {
                click: {
                    left: e.pageX - this.offset.left,
                    top: e.pageY - this.offset.top
                },
                parent: this._getParentOffset(),
                relative: this._getRelativeOffset()
            });
            this.originalPosition = this._generatePosition(e);
            this.originalPageX = e.pageX;
            this.originalPageY = e.pageY;
            (g.cursorAt && this._adjustOffsetFromHelper(g.cursorAt));
            this.domPosition = {
                prev: this.currentItem.prev()[0],
                parent: this.currentItem.parent()[0]
            };
            if (this.helper[0] != this.currentItem[0]) {
                this.currentItem.hide()
            }
            this._createPlaceholder();
            if (g.containment) {
                this._setContainment()
            }
            if (g.cursor) {
                if (a("body").css("cursor")) {
                    this._storedCursor = a("body").css("cursor")
                }
                a("body").css("cursor", g.cursor)
            }
            if (g.opacity) {
                if (this.helper.css("opacity")) {
                    this._storedOpacity = this.helper.css("opacity")
                }
                this.helper.css("opacity", g.opacity)
            }
            if (g.zIndex) {
                if (this.helper.css("zIndex")) {
                    this._storedZIndex = this.helper.css("zIndex")
                }
                this.helper.css("zIndex", g.zIndex)
            }
            if (this.scrollParent[0] != document && this.scrollParent[0].tagName != "HTML") {
                this.overflowOffset = this.scrollParent.offset()
            }
            this._trigger("start", e, this._uiHash());
            if (!this._preserveHelperProportions) {
                this._cacheHelperProportions()
            }
            if (!b) {
                for (var d = this.containers.length - 1; d >= 0; d--) {
                    this.containers[d]._trigger("activate", e, c._uiHash(this))
                }
            }
            if (a.ui.ddmanager) {
                a.ui.ddmanager.current = this
            }
            if (a.ui.ddmanager && !g.dropBehaviour) {
                a.ui.ddmanager.prepareOffsets(this, e)
            }
            this.dragging = true;
            this.helper.addClass("ui-sortable-helper");
            this._mouseDrag(e);
            return true
        },
        _mouseDrag: function (f) {
            this.position = this._generatePosition(f);
            this.positionAbs = this._convertPositionTo("absolute");
            if (!this.lastPositionAbs) {
                this.lastPositionAbs = this.positionAbs
            }
            if (this.options.scroll) {
                var g = this.options,
                    b = false;
                if (this.scrollParent[0] != document && this.scrollParent[0].tagName != "HTML") {
                    if ((this.overflowOffset.top + this.scrollParent[0].offsetHeight) - f.pageY < g.scrollSensitivity) {
                        this.scrollParent[0].scrollTop = b = this.scrollParent[0].scrollTop + g.scrollSpeed
                    } else {
                        if (f.pageY - this.overflowOffset.top < g.scrollSensitivity) {
                            this.scrollParent[0].scrollTop = b = this.scrollParent[0].scrollTop - g.scrollSpeed
                        }
                    }
                    if ((this.overflowOffset.left + this.scrollParent[0].offsetWidth) - f.pageX < g.scrollSensitivity) {
                        this.scrollParent[0].scrollLeft = b = this.scrollParent[0].scrollLeft + g.scrollSpeed
                    } else {
                        if (f.pageX - this.overflowOffset.left < g.scrollSensitivity) {
                            this.scrollParent[0].scrollLeft = b = this.scrollParent[0].scrollLeft - g.scrollSpeed
                        }
                    }
                } else {
                    if (f.pageY - a(document).scrollTop() < g.scrollSensitivity) {
                        b = a(document).scrollTop(a(document).scrollTop() - g.scrollSpeed)
                    } else {
                        if (a(window).height() - (f.pageY - a(document).scrollTop()) < g.scrollSensitivity) {
                            b = a(document).scrollTop(a(document).scrollTop() + g.scrollSpeed)
                        }
                    }
                    if (f.pageX - a(document).scrollLeft() < g.scrollSensitivity) {
                        b = a(document).scrollLeft(a(document).scrollLeft() - g.scrollSpeed)
                    } else {
                        if (a(window).width() - (f.pageX - a(document).scrollLeft()) < g.scrollSensitivity) {
                            b = a(document).scrollLeft(a(document).scrollLeft() + g.scrollSpeed)
                        }
                    }
                }
                if (b !== false && a.ui.ddmanager && !g.dropBehaviour) {
                    a.ui.ddmanager.prepareOffsets(this, f)
                }
            }
            this.positionAbs = this._convertPositionTo("absolute");
            if (!this.options.axis || this.options.axis != "y") {
                this.helper[0].style.left = this.position.left + "px"
            }
            if (!this.options.axis || this.options.axis != "x") {
                this.helper[0].style.top = this.position.top + "px"
            }
            for (var d = this.items.length - 1; d >= 0; d--) {
                var e = this.items[d],
                    c = e.item[0],
                    h = this._intersectsWithPointer(e);
                if (!h) {
                    continue
                }
                if (c != this.currentItem[0] && this.placeholder[h == 1 ? "next" : "prev"]()[0] != c && !a.ui.contains(this.placeholder[0], c) && (this.options.type == "semi-dynamic" ? !a.ui.contains(this.element[0], c) : true)) {
                    this.direction = h == 1 ? "down" : "up";
                    if (this.options.tolerance == "pointer" || this._intersectsWithSides(e)) {
                        this._rearrange(f, e)
                    } else {
                        break
                    }
                    this._trigger("change", f, this._uiHash());
                    break
                }
            }
            this._contactContainers(f);
            if (a.ui.ddmanager) {
                a.ui.ddmanager.drag(this, f)
            }
            this._trigger("sort", f, this._uiHash());
            this.lastPositionAbs = this.positionAbs;
            return false
        },
        _mouseStop: function (c, d) {
            if (!c) {
                return
            }
            if (a.ui.ddmanager && !this.options.dropBehaviour) {
                a.ui.ddmanager.drop(this, c)
            }
            if (this.options.revert) {
                var b = this;
                var e = b.placeholder.offset();
                b.reverting = true;
                a(this.helper).animate({
                    left: e.left - this.offset.parent.left - b.margins.left + (this.offsetParent[0] == document.body ? 0 : this.offsetParent[0].scrollLeft),
                    top: e.top - this.offset.parent.top - b.margins.top + (this.offsetParent[0] == document.body ? 0 : this.offsetParent[0].scrollTop)
                }, parseInt(this.options.revert, 10) || 500, function () {
                    b._clear(c)
                })
            } else {
                this._clear(c, d)
            }
            return false
        },
        cancel: function () {
            var b = this;
            if (this.dragging) {
                this._mouseUp();
                if (this.options.helper == "original") {
                    this.currentItem.css(this._storedCSS).removeClass("ui-sortable-helper")
                } else {
                    this.currentItem.show()
                }
                for (var c = this.containers.length - 1; c >= 0; c--) {
                    this.containers[c]._trigger("deactivate", null, b._uiHash(this));
                    if (this.containers[c].containerCache.over) {
                        this.containers[c]._trigger("out", null, b._uiHash(this));
                        this.containers[c].containerCache.over = 0
                    }
                }
            }
            if (this.placeholder[0].parentNode) {
                this.placeholder[0].parentNode.removeChild(this.placeholder[0])
            }
            if (this.options.helper != "original" && this.helper && this.helper[0].parentNode) {
                this.helper.remove()
            }
            a.extend(this, {
                helper: null,
                dragging: false,
                reverting: false,
                _noFinalSort: null
            });
            if (this.domPosition.prev) {
                a(this.domPosition.prev).after(this.currentItem)
            } else {
                a(this.domPosition.parent).prepend(this.currentItem)
            }
            return this
        },
        serialize: function (d) {
            var b = this._getItemsAsjQuery(d && d.connected);
            var c = [];
            d = d || {};
            a(b).each(function () {
                var e = (a(d.item || this).attr(d.attribute || "id") || "").match(d.expression || (/(.+)[-=_](.+)/));
                if (e) {
                    c.push((d.key || e[1] + "[]") + "=" + (d.key && d.expression ? e[1] : e[2]))
                }
            });
            return c.join("&")
        },
        toArray: function (d) {
            var b = this._getItemsAsjQuery(d && d.connected);
            var c = [];
            d = d || {};
            b.each(function () {
                c.push(a(d.item || this).attr(d.attribute || "id") || "")
            });
            return c
        },
        _intersectsWith: function (m) {
            var e = this.positionAbs.left,
                d = e + this.helperProportions.width,
                k = this.positionAbs.top,
                j = k + this.helperProportions.height;
            var f = m.left,
                c = f + m.width,
                n = m.top,
                i = n + m.height;
            var o = this.offset.click.top,
                h = this.offset.click.left;
            var g = (k + o) > n && (k + o) < i && (e + h) > f && (e + h) < c;
            if (this.options.tolerance == "pointer" || this.options.forcePointerForContainers || (this.options.tolerance != "pointer" && this.helperProportions[this.floating ? "width" : "height"] > m[this.floating ? "width" : "height"])) {
                return g
            } else {
                return (f < e + (this.helperProportions.width / 2) && d - (this.helperProportions.width / 2) < c && n < k + (this.helperProportions.height / 2) && j - (this.helperProportions.height / 2) < i)
            }
        },
        _intersectsWithPointer: function (d) {
            var e = a.ui.isOverAxis(this.positionAbs.top + this.offset.click.top, d.top, d.height),
                c = a.ui.isOverAxis(this.positionAbs.left + this.offset.click.left, d.left, d.width),
                g = e && c,
                b = this._getDragVerticalDirection(),
                f = this._getDragHorizontalDirection();
            if (!g) {
                return false
            }
            return this.floating ? (((f && f == "right") || b == "down") ? 2 : 1) : (b && (b == "down" ? 2 : 1))
        },
        _intersectsWithSides: function (e) {
            var c = a.ui.isOverAxis(this.positionAbs.top + this.offset.click.top, e.top + (e.height / 2), e.height),
                d = a.ui.isOverAxis(this.positionAbs.left + this.offset.click.left, e.left + (e.width / 2), e.width),
                b = this._getDragVerticalDirection(),
                f = this._getDragHorizontalDirection();
            if (this.floating && f) {
                return ((f == "right" && d) || (f == "left" && !d))
            } else {
                return b && ((b == "down" && c) || (b == "up" && !c))
            }
        },
        _getDragVerticalDirection: function () {
            var b = this.positionAbs.top - this.lastPositionAbs.top;
            return b != 0 && (b > 0 ? "down" : "up")
        },
        _getDragHorizontalDirection: function () {
            var b = this.positionAbs.left - this.lastPositionAbs.left;
            return b != 0 && (b > 0 ? "right" : "left")
        },
        refresh: function (b) {
            this._refreshItems(b);
            this.refreshPositions();
            return this
        },
        _connectWith: function () {
            var b = this.options;
            return b.connectWith.constructor == String ? [b.connectWith] : b.connectWith
        },
        _getItemsAsjQuery: function (b) {
            var l = this;
            var g = [];
            var e = [];
            var h = this._connectWith();
            if (h && b) {
                for (var d = h.length - 1; d >= 0; d--) {
                    var k = a(h[d]);
                    for (var c = k.length - 1; c >= 0; c--) {
                        var f = a.data(k[c], "sortable");
                        if (f && f != this && !f.options.disabled) {
                            e.push([a.isFunction(f.options.items) ? f.options.items.call(f.element) : a(f.options.items, f.element).not(".ui-sortable-helper").not(".ui-sortable-placeholder"), f])
                        }
                    }
                }
            }
            e.push([a.isFunction(this.options.items) ? this.options.items.call(this.element, null, {
                options: this.options,
                item: this.currentItem
            }) : a(this.options.items, this.element).not(".ui-sortable-helper").not(".ui-sortable-placeholder"), this]);
            for (var d = e.length - 1; d >= 0; d--) {
                e[d][0].each(function () {
                    g.push(this)
                })
            }
            return a(g)
        },
        _removeCurrentsFromItems: function () {
            var d = this.currentItem.find(":data(sortable-item)");
            for (var c = 0; c < this.items.length; c++) {
                for (var b = 0; b < d.length; b++) {
                    if (d[b] == this.items[c].item[0]) {
                        this.items.splice(c, 1)
                    }
                }
            }
        },
        _refreshItems: function (b) {
            this.items = [];
            this.containers = [this];
            var h = this.items;
            var p = this;
            var f = [
                [a.isFunction(this.options.items) ? this.options.items.call(this.element[0], b, {
                    item: this.currentItem
                }) : a(this.options.items, this.element), this]
            ];
            var l = this._connectWith();
            if (l) {
                for (var e = l.length - 1; e >= 0; e--) {
                    var m = a(l[e]);
                    for (var d = m.length - 1; d >= 0; d--) {
                        var g = a.data(m[d], "sortable");
                        if (g && g != this && !g.options.disabled) {
                            f.push([a.isFunction(g.options.items) ? g.options.items.call(g.element[0], b, {
                                item: this.currentItem
                            }) : a(g.options.items, g.element), g]);
                            this.containers.push(g)
                        }
                    }
                }
            }
            for (var e = f.length - 1; e >= 0; e--) {
                var k = f[e][1];
                var c = f[e][0];
                for (var d = 0, n = c.length; d < n; d++) {
                    var o = a(c[d]);
                    o.data("sortable-item", k);
                    h.push({
                        item: o,
                        instance: k,
                        width: 0,
                        height: 0,
                        left: 0,
                        top: 0
                    })
                }
            }
        },
        refreshPositions: function (b) {
            if (this.offsetParent && this.helper) {
                this.offset.parent = this._getParentOffset()
            }
            for (var d = this.items.length - 1; d >= 0; d--) {
                var e = this.items[d];
                var c = this.options.toleranceElement ? a(this.options.toleranceElement, e.item) : e.item;
                if (!b) {
                    e.width = c.outerWidth();
                    e.height = c.outerHeight()
                }
                var f = c.offset();
                e.left = f.left;
                e.top = f.top
            }
            if (this.options.custom && this.options.custom.refreshContainers) {
                this.options.custom.refreshContainers.call(this)
            } else {
                for (var d = this.containers.length - 1; d >= 0; d--) {
                    var f = this.containers[d].element.offset();
                    this.containers[d].containerCache.left = f.left;
                    this.containers[d].containerCache.top = f.top;
                    this.containers[d].containerCache.width = this.containers[d].element.outerWidth();
                    this.containers[d].containerCache.height = this.containers[d].element.outerHeight()
                }
            }
            return this
        },
        _createPlaceholder: function (d) {
            var b = d || this,
                e = b.options;
            if (!e.placeholder || e.placeholder.constructor == String) {
                var c = e.placeholder;
                e.placeholder = {
                    element: function () {
                        var f = a(document.createElement(b.currentItem[0].nodeName)).addClass(c || b.currentItem[0].className + " ui-sortable-placeholder").removeClass("ui-sortable-helper")[0];
                        if (!c) {
                            f.style.visibility = "hidden"
                        }
                        return f
                    },
                    update: function (f, g) {
                        if (c && !e.forcePlaceholderSize) {
                            return
                        }
                        if (!g.height()) {
                            g.height(b.currentItem.innerHeight() - parseInt(b.currentItem.css("paddingTop") || 0, 10) - parseInt(b.currentItem.css("paddingBottom") || 0, 10))
                        }
                        if (!g.width()) {
                            g.width(b.currentItem.innerWidth() - parseInt(b.currentItem.css("paddingLeft") || 0, 10) - parseInt(b.currentItem.css("paddingRight") || 0, 10))
                        }
                    }
                }
            }
            b.placeholder = a(e.placeholder.element.call(b.element, b.currentItem));
            b.currentItem.after(b.placeholder);
            e.placeholder.update(b, b.placeholder)
        },
        _contactContainers: function (b) {
            var d = null,
                k = null;
            for (var f = this.containers.length - 1; f >= 0; f--) {
                if (a.ui.contains(this.currentItem[0], this.containers[f].element[0])) {
                    continue
                }
                if (this._intersectsWith(this.containers[f].containerCache)) {
                    if (d && a.ui.contains(this.containers[f].element[0], d.element[0])) {
                        continue
                    }
                    d = this.containers[f];
                    k = f
                } else {
                    if (this.containers[f].containerCache.over) {
                        this.containers[f]._trigger("out", b, this._uiHash(this));
                        this.containers[f].containerCache.over = 0
                    }
                }
            }
            if (!d) {
                return
            }
            if (this.currentContainer != this.containers[k]) {
                var h = 10000;
                var g = null;
                var c = this.positionAbs[this.containers[k].floating ? "left" : "top"];
                for (var e = this.items.length - 1; e >= 0; e--) {
                    if (!a.ui.contains(this.containers[k].element[0], this.items[e].item[0])) {
                        continue
                    }
                    var l = this.items[e][this.containers[k].floating ? "left" : "top"];
                    if (Math.abs(l - c) < h) {
                        h = Math.abs(l - c);
                        g = this.items[e]
                    }
                }
                if (!g && !this.options.dropOnEmpty) {
                    return
                }
                this.currentContainer = this.containers[k];
                g ? this._rearrange(b, g, null, true) : this._rearrange(b, null, this.containers[k].element, true);
                this._trigger("change", b, this._uiHash());
                this.containers[k]._trigger("change", b, this._uiHash(this));
                this.options.placeholder.update(this.currentContainer, this.placeholder);
                this.containers[k]._trigger("over", b, this._uiHash(this));
                this.containers[k].containerCache.over = 1
            }
        },
        _createHelper: function (c) {
            var d = this.options;
            var b = a.isFunction(d.helper) ? a(d.helper.apply(this.element[0], [c, this.currentItem])) : (d.helper == "clone" ? this.currentItem.clone() : this.currentItem);
            if (!b.parents("body").length) {
                a(d.appendTo != "parent" ? d.appendTo : this.currentItem[0].parentNode)[0].appendChild(b[0])
            }
            if (b[0] == this.currentItem[0]) {
                this._storedCSS = {
                    width: this.currentItem[0].style.width,
                    height: this.currentItem[0].style.height,
                    position: this.currentItem.css("position"),
                    top: this.currentItem.css("top"),
                    left: this.currentItem.css("left")
                }
            }
            if (b[0].style.width == "" || d.forceHelperSize) {
                b.width(this.currentItem.width())
            }
            if (b[0].style.height == "" || d.forceHelperSize) {
                b.height(this.currentItem.height())
            }
            return b
        },
        _adjustOffsetFromHelper: function (b) {
            if (typeof b == "string") {
                b = b.split(" ")
            }
            if (a.isArray(b)) {
                b = {
                    left: +b[0],
                    top: +b[1] || 0
                }
            }
            if ("left" in b) {
                this.offset.click.left = b.left + this.margins.left
            }
            if ("right" in b) {
                this.offset.click.left = this.helperProportions.width - b.right + this.margins.left
            }
            if ("top" in b) {
                this.offset.click.top = b.top + this.margins.top
            }
            if ("bottom" in b) {
                this.offset.click.top = this.helperProportions.height - b.bottom + this.margins.top
            }
        },
        _getParentOffset: function () {
            this.offsetParent = this.helper.offsetParent();
            var b = this.offsetParent.offset();
            if (this.cssPosition == "absolute" && this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) {
                b.left += this.scrollParent.scrollLeft();
                b.top += this.scrollParent.scrollTop()
            }
            if ((this.offsetParent[0] == document.body) || (this.offsetParent[0].tagName && this.offsetParent[0].tagName.toLowerCase() == "html" && a.browser.msie)) {
                b = {
                    top: 0,
                    left: 0
                }
            }
            return {
                top: b.top + (parseInt(this.offsetParent.css("borderTopWidth"), 10) || 0),
                left: b.left + (parseInt(this.offsetParent.css("borderLeftWidth"), 10) || 0)
            }
        },
        _getRelativeOffset: function () {
            if (this.cssPosition == "relative") {
                var b = this.currentItem.position();
                return {
                    top: b.top - (parseInt(this.helper.css("top"), 10) || 0) + this.scrollParent.scrollTop(),
                    left: b.left - (parseInt(this.helper.css("left"), 10) || 0) + this.scrollParent.scrollLeft()
                }
            } else {
                return {
                    top: 0,
                    left: 0
                }
            }
        },
        _cacheMargins: function () {
            this.margins = {
                left: (parseInt(this.currentItem.css("marginLeft"), 10) || 0),
                top: (parseInt(this.currentItem.css("marginTop"), 10) || 0)
            }
        },
        _cacheHelperProportions: function () {
            this.helperProportions = {
                width: this.helper.outerWidth(),
                height: this.helper.outerHeight()
            }
        },
        _setContainment: function () {
            var e = this.options;
            if (e.containment == "parent") {
                e.containment = this.helper[0].parentNode
            }
            if (e.containment == "document" || e.containment == "window") {
                this.containment = [0 - this.offset.relative.left - this.offset.parent.left, 0 - this.offset.relative.top - this.offset.parent.top, a(e.containment == "document" ? document : window).width() - this.helperProportions.width - this.margins.left, (a(e.containment == "document" ? document : window).height() || document.body.parentNode.scrollHeight) - this.helperProportions.height - this.margins.top]
            }
            if (!(/^(document|window|parent)$/).test(e.containment)) {
                var c = a(e.containment)[0];
                var d = a(e.containment).offset();
                var b = (a(c).css("overflow") != "hidden");
                this.containment = [d.left + (parseInt(a(c).css("borderLeftWidth"), 10) || 0) + (parseInt(a(c).css("paddingLeft"), 10) || 0) - this.margins.left, d.top + (parseInt(a(c).css("borderTopWidth"), 10) || 0) + (parseInt(a(c).css("paddingTop"), 10) || 0) - this.margins.top, d.left + (b ? Math.max(c.scrollWidth, c.offsetWidth) : c.offsetWidth) - (parseInt(a(c).css("borderLeftWidth"), 10) || 0) - (parseInt(a(c).css("paddingRight"), 10) || 0) - this.helperProportions.width - this.margins.left, d.top + (b ? Math.max(c.scrollHeight, c.offsetHeight) : c.offsetHeight) - (parseInt(a(c).css("borderTopWidth"), 10) || 0) - (parseInt(a(c).css("paddingBottom"), 10) || 0) - this.helperProportions.height - this.margins.top]
            }
        },
        _convertPositionTo: function (f, h) {
            if (!h) {
                h = this.position
            }
            var c = f == "absolute" ? 1 : -1;
            var e = this.options,
                b = this.cssPosition == "absolute" && !(this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) ? this.offsetParent : this.scrollParent,
                g = (/(html|body)/i).test(b[0].tagName);
            return {
                top: (h.top + this.offset.relative.top * c + this.offset.parent.top * c - (a.browser.safari && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollTop() : (g ? 0 : b.scrollTop())) * c)),
                left: (h.left + this.offset.relative.left * c + this.offset.parent.left * c - (a.browser.safari && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollLeft() : g ? 0 : b.scrollLeft()) * c))
            }
        },
        _generatePosition: function (e) {
            var h = this.options,
                b = this.cssPosition == "absolute" && !(this.scrollParent[0] != document && a.ui.contains(this.scrollParent[0], this.offsetParent[0])) ? this.offsetParent : this.scrollParent,
                i = (/(html|body)/i).test(b[0].tagName);
            if (this.cssPosition == "relative" && !(this.scrollParent[0] != document && this.scrollParent[0] != this.offsetParent[0])) {
                this.offset.relative = this._getRelativeOffset()
            }
            var d = e.pageX;
            var c = e.pageY;
            if (this.originalPosition) {
                if (this.containment) {
                    if (e.pageX - this.offset.click.left < this.containment[0]) {
                        d = this.containment[0] + this.offset.click.left
                    }
                    if (e.pageY - this.offset.click.top < this.containment[1]) {
                        c = this.containment[1] + this.offset.click.top
                    }
                    if (e.pageX - this.offset.click.left > this.containment[2]) {
                        d = this.containment[2] + this.offset.click.left
                    }
                    if (e.pageY - this.offset.click.top > this.containment[3]) {
                        c = this.containment[3] + this.offset.click.top
                    }
                }
                if (h.grid) {
                    var g = this.originalPageY + Math.round((c - this.originalPageY) / h.grid[1]) * h.grid[1];
                    c = this.containment ? (!(g - this.offset.click.top < this.containment[1] || g - this.offset.click.top > this.containment[3]) ? g : (!(g - this.offset.click.top < this.containment[1]) ? g - h.grid[1] : g + h.grid[1])) : g;
                    var f = this.originalPageX + Math.round((d - this.originalPageX) / h.grid[0]) * h.grid[0];
                    d = this.containment ? (!(f - this.offset.click.left < this.containment[0] || f - this.offset.click.left > this.containment[2]) ? f : (!(f - this.offset.click.left < this.containment[0]) ? f - h.grid[0] : f + h.grid[0])) : f
                }
            }
            return {
                top: (c - this.offset.click.top - this.offset.relative.top - this.offset.parent.top + (a.browser.safari && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollTop() : (i ? 0 : b.scrollTop())))),
                left: (d - this.offset.click.left - this.offset.relative.left - this.offset.parent.left + (a.browser.safari && this.cssPosition == "fixed" ? 0 : (this.cssPosition == "fixed" ? -this.scrollParent.scrollLeft() : i ? 0 : b.scrollLeft())))
            }
        },
        _rearrange: function (g, f, c, e) {
            c ? c[0].appendChild(this.placeholder[0]) : f.item[0].parentNode.insertBefore(this.placeholder[0], (this.direction == "down" ? f.item[0] : f.item[0].nextSibling));
            this.counter = this.counter ? ++this.counter : 1;
            var d = this,
                b = this.counter;
            window.setTimeout(function () {
                if (b == d.counter) {
                    d.refreshPositions(!e)
                }
            }, 0)
        },
        _clear: function (d, e) {
            this.reverting = false;
            var f = [],
                b = this;
            if (!this._noFinalSort && this.currentItem[0].parentNode) {
                this.placeholder.before(this.currentItem)
            }
            this._noFinalSort = null;
            if (this.helper[0] == this.currentItem[0]) {
                for (var c in this._storedCSS) {
                    if (this._storedCSS[c] == "auto" || this._storedCSS[c] == "static") {
                        this._storedCSS[c] = ""
                    }
                }
                this.currentItem.css(this._storedCSS).removeClass("ui-sortable-helper")
            } else {
                this.currentItem.show()
            }
            if (this.fromOutside && !e) {
                f.push(function (g) {
                    this._trigger("receive", g, this._uiHash(this.fromOutside))
                })
            }
            if ((this.fromOutside || this.domPosition.prev != this.currentItem.prev().not(".ui-sortable-helper")[0] || this.domPosition.parent != this.currentItem.parent()[0]) && !e) {
                f.push(function (g) {
                    this._trigger("update", g, this._uiHash())
                })
            }
            if (!a.ui.contains(this.element[0], this.currentItem[0])) {
                if (!e) {
                    f.push(function (g) {
                        this._trigger("remove", g, this._uiHash())
                    })
                }
                for (var c = this.containers.length - 1; c >= 0; c--) {
                    if (a.ui.contains(this.containers[c].element[0], this.currentItem[0]) && !e) {
                        f.push((function (g) {
                            return function (h) {
                                g._trigger("receive", h, this._uiHash(this))
                            }
                        }).call(this, this.containers[c]));
                        f.push((function (g) {
                            return function (h) {
                                g._trigger("update", h, this._uiHash(this))
                            }
                        }).call(this, this.containers[c]))
                    }
                }
            }
            for (var c = this.containers.length - 1; c >= 0; c--) {
                if (!e) {
                    f.push((function (g) {
                        return function (h) {
                            g._trigger("deactivate", h, this._uiHash(this))
                        }
                    }).call(this, this.containers[c]))
                }
                if (this.containers[c].containerCache.over) {
                    f.push((function (g) {
                        return function (h) {
                            g._trigger("out", h, this._uiHash(this))
                        }
                    }).call(this, this.containers[c]));
                    this.containers[c].containerCache.over = 0
                }
            }
            if (this._storedCursor) {
                a("body").css("cursor", this._storedCursor)
            }
            if (this._storedOpacity) {
                this.helper.css("opacity", this._storedOpacity)
            }
            if (this._storedZIndex) {
                this.helper.css("zIndex", this._storedZIndex == "auto" ? "" : this._storedZIndex)
            }
            this.dragging = false;
            if (this.cancelHelperRemoval) {
                if (!e) {
                    this._trigger("beforeStop", d, this._uiHash());
                    for (var c = 0; c < f.length; c++) {
                        f[c].call(this, d)
                    }
                    this._trigger("stop", d, this._uiHash())
                }
                return false
            }
            if (!e) {
                this._trigger("beforeStop", d, this._uiHash())
            }
            this.placeholder[0].parentNode.removeChild(this.placeholder[0]);
            if (this.helper[0] != this.currentItem[0]) {
                this.helper.remove()
            }
            this.helper = null;
            if (!e) {
                for (var c = 0; c < f.length; c++) {
                    f[c].call(this, d)
                }
                this._trigger("stop", d, this._uiHash())
            }
            this.fromOutside = false;
            return true
        },
        _trigger: function () {
            if (a.Widget.prototype._trigger.apply(this, arguments) === false) {
                this.cancel()
            }
        },
        _uiHash: function (c) {
            var b = c || this;
            return {
                helper: b.helper,
                placeholder: b.placeholder || a([]),
                position: b.position,
                originalPosition: b.originalPosition,
                offset: b.positionAbs,
                item: b.currentItem,
                sender: c ? c.element : null
            }
        }
    });
    a.extend(a.ui.sortable, {
        version: "1.8rc3"
    })
})(jQuery);;
(function (a) {
    a.widget("ui.accordion", {
        options: {
            active: 0,
            animated: "slide",
            autoHeight: true,
            clearStyle: false,
            collapsible: false,
            event: "click",
            fillSpace: false,
            header: "> li > :first-child,> :not(li):even",
            icons: {
                header: "ui-icon-triangle-1-e",
                headerSelected: "ui-icon-triangle-1-s"
            },
            navigation: false,
            navigationFilter: function () {
                return this.href.toLowerCase() == location.href.toLowerCase()
            }
        },
        _create: function () {
            var d = this.options,
                b = this;
            this.running = 0;
            this.element.addClass("ui-accordion ui-widget ui-helper-reset");
            if (this.element[0].nodeName == "UL") {
                this.element.children("li").addClass("ui-accordion-li-fix")
            }
            this.headers = this.element.find(d.header).addClass("ui-accordion-header ui-helper-reset ui-state-default ui-corner-all").bind("mouseenter.accordion", function () {
                a(this).addClass("ui-state-hover")
            }).bind("mouseleave.accordion", function () {
                a(this).removeClass("ui-state-hover")
            }).bind("focus.accordion", function () {
                a(this).addClass("ui-state-focus")
            }).bind("blur.accordion", function () {
                a(this).removeClass("ui-state-focus")
            });
            this.headers.next().addClass("ui-accordion-content ui-helper-reset ui-widget-content ui-corner-bottom");
            if (d.navigation) {
                var c = this.element.find("a").filter(d.navigationFilter);
                if (c.length) {
                    var e = c.closest(".ui-accordion-header");
                    if (e.length) {
                        this.active = e
                    } else {
                        this.active = c.closest(".ui-accordion-content").prev()
                    }
                }
            }
            this.active = this._findActive(this.active || d.active).toggleClass("ui-state-default").toggleClass("ui-state-active").toggleClass("ui-corner-all").toggleClass("ui-corner-top");
            this.active.next().addClass("ui-accordion-content-active");
            this._createIcons();
            if (a.browser.msie) {
                this.element.find("a").css("zoom", "1")
            }
            this.resize();
            this.element.attr("role", "tablist");
            this.headers.attr("role", "tab").bind("keydown", function (f) {
                return b._keydown(f)
            }).next().attr("role", "tabpanel");
            this.headers.not(this.active || "").attr("aria-expanded", "false").attr("tabIndex", "-1").next().hide();
            if (!this.active.length) {
                this.headers.eq(0).attr("tabIndex", "0")
            } else {
                this.active.attr("aria-expanded", "true").attr("tabIndex", "0")
            }
            if (!a.browser.safari) {
                this.headers.find("a").attr("tabIndex", "-1")
            }
            if (d.event) {
                this.headers.bind((d.event) + ".accordion", function (f) {
                    b._clickHandler.call(b, f, this);
                    f.preventDefault()
                })
            }
        },
        _createIcons: function () {
            var b = this.options;
            if (b.icons) {
                a("<span/>").addClass("ui-icon " + b.icons.header).prependTo(this.headers);
                this.active.find(".ui-icon").toggleClass(b.icons.header).toggleClass(b.icons.headerSelected);
                this.element.addClass("ui-accordion-icons")
            }
        },
        _destroyIcons: function () {
            this.headers.children(".ui-icon").remove();
            this.element.removeClass("ui-accordion-icons")
        },
        destroy: function () {
            var c = this.options;
            this.element.removeClass("ui-accordion ui-widget ui-helper-reset").removeAttr("role").unbind(".accordion").removeData("accordion");
            this.headers.unbind(".accordion").removeClass("ui-accordion-header ui-helper-reset ui-state-default ui-corner-all ui-state-active ui-corner-top").removeAttr("role").removeAttr("aria-expanded").removeAttr("tabindex");
            this.headers.find("a").removeAttr("tabindex");
            this._destroyIcons();
            var b = this.headers.next().css("display", "").removeAttr("role").removeClass("ui-helper-reset ui-widget-content ui-corner-bottom ui-accordion-content ui-accordion-content-active");
            if (c.autoHeight || c.fillHeight) {
                b.css("height", "")
            }
            return this
        },
        _setOption: function (b, c) {
            a.Widget.prototype._setOption.apply(this, arguments);
            if (b == "active") {
                this.activate(c)
            }
            if (b == "icons") {
                this._destroyIcons();
                if (c) {
                    this._createIcons()
                }
            }
        },
        _keydown: function (e) {
            var g = this.options,
                f = a.ui.keyCode;
            if (g.disabled || e.altKey || e.ctrlKey) {
                return
            }
            var d = this.headers.length;
            var b = this.headers.index(e.target);
            var c = false;
            switch (e.keyCode) {
            case f.RIGHT:
            case f.DOWN:
                c = this.headers[(b + 1) % d];
                break;
            case f.LEFT:
            case f.UP:
                c = this.headers[(b - 1 + d) % d];
                break;
            case f.SPACE:
            case f.ENTER:
                this._clickHandler({
                    target: e.target
                }, e.target);
                e.preventDefault()
            }
            if (c) {
                a(e.target).attr("tabIndex", "-1");
                a(c).attr("tabIndex", "0");
                c.focus();
                return false
            }
            return true
        },
        resize: function () {
            var d = this.options,
                c;
            if (d.fillSpace) {
                if (a.browser.msie) {
                    var b = this.element.parent().css("overflow");
                    this.element.parent().css("overflow", "hidden")
                }
                c = this.element.parent().height();
                if (a.browser.msie) {
                    this.element.parent().css("overflow", b)
                }
                this.headers.each(function () {
                    c -= a(this).outerHeight(true)
                });
                this.headers.next().each(function () {
                    a(this).height(Math.max(0, c - a(this).innerHeight() + a(this).height()))
                }).css("overflow", "auto")
            } else {
                if (d.autoHeight) {
                    c = 0;
                    this.headers.next().each(function () {
                        c = Math.max(c, a(this).height())
                    }).height(c)
                }
            }
            return this
        },
        activate: function (b) {
            this.options.active = b;
            var c = this._findActive(b)[0];
            this._clickHandler({
                target: c
            }, c);
            return this
        },
        _findActive: function (b) {
            return b ? typeof b == "number" ? this.headers.filter(":eq(" + b + ")") : this.headers.not(this.headers.not(b)) : b === false ? a([]) : this.headers.filter(":eq(0)")
        },
        _clickHandler: function (b, f) {
            var d = this.options;
            if (d.disabled) {
                return
            }
            if (!b.target) {
                if (!d.collapsible) {
                    return
                }
                this.active.removeClass("ui-state-active ui-corner-top").addClass("ui-state-default ui-corner-all").find(".ui-icon").removeClass(d.icons.headerSelected).addClass(d.icons.header);
                this.active.next().addClass("ui-accordion-content-active");
                var h = this.active.next(),
                    e = {
                        options: d,
                        newHeader: a([]),
                        oldHeader: d.active,
                        newContent: a([]),
                        oldContent: h
                    },
                    c = (this.active = a([]));
                this._toggle(c, h, e);
                return
            }
            var g = a(b.currentTarget || f);
            var i = g[0] == this.active[0];
            d.active = d.collapsible && i ? false : a(".ui-accordion-header", this.element).index(g);
            if (this.running || (!d.collapsible && i)) {
                return
            }
            this.active.removeClass("ui-state-active ui-corner-top").addClass("ui-state-default ui-corner-all").find(".ui-icon").removeClass(d.icons.headerSelected).addClass(d.icons.header);
            if (!i) {
                g.removeClass("ui-state-default ui-corner-all").addClass("ui-state-active ui-corner-top").find(".ui-icon").removeClass(d.icons.header).addClass(d.icons.headerSelected);
                g.next().addClass("ui-accordion-content-active")
            }
            var c = g.next(),
                h = this.active.next(),
                e = {
                    options: d,
                    newHeader: i && d.collapsible ? a([]) : g,
                    oldHeader: this.active,
                    newContent: i && d.collapsible ? a([]) : c,
                    oldContent: h
                },
                j = this.headers.index(this.active[0]) > this.headers.index(g[0]);
            this.active = i ? a([]) : g;
            this._toggle(c, h, e, i, j);
            return
        },
        _toggle: function (b, i, g, j, k) {
            var d = this.options,
                m = this;
            this.toShow = b;
            this.toHide = i;
            this.data = g;
            var c = function () {
                if (!m) {
                    return
                }
                return m._completed.apply(m, arguments)
            };
            this._trigger("changestart", null, this.data);
            this.running = i.size() === 0 ? b.size() : i.size();
            if (d.animated) {
                var f = {};
                if (d.collapsible && j) {
                    f = {
                        toShow: a([]),
                        toHide: i,
                        complete: c,
                        down: k,
                        autoHeight: d.autoHeight || d.fillSpace
                    }
                } else {
                    f = {
                        toShow: b,
                        toHide: i,
                        complete: c,
                        down: k,
                        autoHeight: d.autoHeight || d.fillSpace
                    }
                }
                if (!d.proxied) {
                    d.proxied = d.animated
                }
                if (!d.proxiedDuration) {
                    d.proxiedDuration = d.duration
                }
                d.animated = a.isFunction(d.proxied) ? d.proxied(f) : d.proxied;
                d.duration = a.isFunction(d.proxiedDuration) ? d.proxiedDuration(f) : d.proxiedDuration;
                var l = a.ui.accordion.animations,
                    e = d.duration,
                    h = d.animated;
                if (h && !l[h] && !a.easing[h]) {
                    h = "slide"
                }
                if (!l[h]) {
                    l[h] = function (n) {
                        this.slide(n, {
                            easing: h,
                            duration: e || 700
                        })
                    }
                }
                l[h](f)
            } else {
                if (d.collapsible && j) {
                    b.toggle()
                } else {
                    i.hide();
                    b.show()
                }
                c(true)
            }
            i.prev().attr("aria-expanded", "false").attr("tabIndex", "-1").blur();
            b.prev().attr("aria-expanded", "true").attr("tabIndex", "0").focus()
        },
        _completed: function (b) {
            var c = this.options;
            this.running = b ? 0 : --this.running;
            if (this.running) {
                return
            }
            if (c.clearStyle) {
                this.toShow.add(this.toHide).css({
                    height: "",
                    overflow: ""
                })
            }
            this.toHide.removeClass("ui-accordion-content-active");
            this._trigger("change", null, this.data)
        }
    });
    a.extend(a.ui.accordion, {
        version: "1.8rc3",
        animations: {
            slide: function (j, h) {
                j = a.extend({
                    easing: "swing",
                    duration: 300
                }, j, h);
                if (!j.toHide.size()) {
                    j.toShow.animate({
                        height: "show"
                    }, j);
                    return
                }
                if (!j.toShow.size()) {
                    j.toHide.animate({
                        height: "hide"
                    }, j);
                    return
                }
                var c = j.toShow.css("overflow"),
                    g = 0,
                    d = {},
                    f = {},
                    e = ["height", "paddingTop", "paddingBottom"],
                    b;
                var i = j.toShow;
                b = i[0].style.width;
                i.width(parseInt(i.parent().width(), 10) - parseInt(i.css("paddingLeft"), 10) - parseInt(i.css("paddingRight"), 10) - (parseInt(i.css("borderLeftWidth"), 10) || 0) - (parseInt(i.css("borderRightWidth"), 10) || 0));
                a.each(e, function (k, m) {
                    f[m] = "hide";
                    var l = ("" + a.css(j.toShow[0], m)).match(/^([\d+-.]+)(.*)$/);
                    d[m] = {
                        value: l[1],
                        unit: l[2] || "px"
                    }
                });
                j.toShow.css({
                    height: 0,
                    overflow: "hidden"
                }).show();
                j.toHide.filter(":hidden").each(j.complete).end().filter(":visible").animate(f, {
                    step: function (k, l) {
                        if (l.prop == "height") {
                            g = (l.end - l.start === 0) ? 0 : (l.now - l.start) / (l.end - l.start)
                        }
                        j.toShow[0].style[l.prop] = (g * d[l.prop].value) + d[l.prop].unit
                    },
                    duration: j.duration,
                    easing: j.easing,
                    complete: function () {
                        if (!j.autoHeight) {
                            j.toShow.css("height", "")
                        }
                        j.toShow.css("width", b);
                        j.toShow.css({
                            overflow: c
                        });
                        j.complete()
                    }
                })
            },
            bounceslide: function (b) {
                this.slide(b, {
                    easing: b.down ? "easeOutBounce" : "swing",
                    duration: b.down ? 1000 : 200
                })
            }
        }
    })
})(jQuery);;
(function (b) {
    var a = "ui-dialog ui-widget ui-widget-content ui-corner-all ";
    b.widget("ui.dialog", {
        options: {
            autoOpen: true,
            buttons: {},
            closeOnEscape: true,
            closeText: "close",
            dialogClass: "",
            draggable: true,
            hide: null,
            height: "auto",
            maxHeight: false,
            maxWidth: false,
            minHeight: 150,
            minWidth: 150,
            modal: false,
            position: "center",
            resizable: true,
            show: null,
            stack: true,
            title: "",
            width: 300,
            zIndex: 1000
        },
        _create: function () {
            this.originalTitle = this.element.attr("title");
            var k = this,
                l = k.options,
                i = l.title || k.originalTitle || "&#160;",
                d = b.ui.dialog.getTitleId(k.element),
                j = (k.uiDialog = b("<div></div>")).appendTo(document.body).hide().addClass(a + l.dialogClass).css({
                    zIndex: l.zIndex
                }).attr("tabIndex", -1).css("outline", 0).keydown(function (m) {
                    if (l.closeOnEscape && m.keyCode && m.keyCode == b.ui.keyCode.ESCAPE) {
                        k.close(m);
                        m.preventDefault()
                    }
                }).attr({
                    role: "dialog",
                    "aria-labelledby": d
                }).mousedown(function (m) {
                    k.moveToTop(false, m)
                }),
                f = k.element.show().removeAttr("title").addClass("ui-dialog-content ui-widget-content").appendTo(j),
                e = (k.uiDialogTitlebar = b("<div></div>")).addClass("ui-dialog-titlebar ui-widget-header ui-corner-all ui-helper-clearfix").prependTo(j),
                h = b('<a href="#"></a>').addClass("ui-dialog-titlebar-close ui-corner-all").attr("role", "button").hover(function () {
                    h.addClass("ui-state-hover")
                }, function () {
                    h.removeClass("ui-state-hover")
                }).focus(function () {
                    h.addClass("ui-state-focus")
                }).blur(function () {
                    h.removeClass("ui-state-focus")
                }).click(function (m) {
                    k.close(m);
                    return false
                }).appendTo(e),
                g = (k.uiDialogTitlebarCloseText = b("<span></span>")).addClass("ui-icon ui-icon-closethick").text(l.closeText).appendTo(h),
                c = b("<span></span>").addClass("ui-dialog-title").attr("id", d).html(i).prependTo(e);
            if (b.isFunction(l.beforeclose) && !b.isFunction(l.beforeClose)) {
                l.beforeClose = l.beforeclose
            }
            e.find("*").add(e).disableSelection();
            (l.draggable && b.fn.draggable && k._makeDraggable());
            (l.resizable && b.fn.resizable && k._makeResizable());
            k._createButtons(l.buttons);
            k._isOpen = false;
            (b.fn.bgiframe && j.bgiframe())
        },
        _init: function () {
            if (this.options.autoOpen) {
                this.open()
            }
        },
        destroy: function () {
            var c = this;
            (c.overlay && c.overlay.destroy());
            c.uiDialog.hide();
            c.element.unbind(".dialog").removeData("dialog").removeClass("ui-dialog-content ui-widget-content").hide().appendTo("body");
            c.uiDialog.remove();
            (c.originalTitle && c.element.attr("title", c.originalTitle));
            return c
        },
        widget: function () {
            return this.uiDialog
        },
        close: function (e) {
            var c = this;
            if (false === c._trigger("beforeClose", e)) {
                return
            }(c.overlay && c.overlay.destroy());
            c.uiDialog.unbind("keypress.ui-dialog");
            c._isOpen = false;
            (c.options.hide ? c.uiDialog.hide(c.options.hide, function () {
                c._trigger("close", e)
            }) : c.uiDialog.hide() && c._trigger("close", e));
            b.ui.dialog.overlay.resize();
            if (c.options.modal) {
                var d = 0;
                b(".ui-dialog").each(function () {
                    if (this != c.uiDialog[0]) {
                        d = Math.max(d, b(this).css("z-index"))
                    }
                });
                b.ui.dialog.maxZ = d
            }
            return c
        },
        isOpen: function () {
            return this._isOpen
        },
        moveToTop: function (g, f) {
            var c = this,
                e = c.options;
            if ((e.modal && !g) || (!e.stack && !e.modal)) {
                return c._trigger("focus", f)
            }
            if (e.zIndex > b.ui.dialog.maxZ) {
                b.ui.dialog.maxZ = e.zIndex
            }(c.overlay && c.overlay.$el.css("z-index", b.ui.dialog.overlay.maxZ = ++b.ui.dialog.maxZ));
            var d = {
                scrollTop: c.element.attr("scrollTop"),
                scrollLeft: c.element.attr("scrollLeft")
            };
            c.uiDialog.css("z-index", ++b.ui.dialog.maxZ);
            c.element.attr(d);
            c._trigger("focus", f);
            return c
        },
        open: function () {
            if (this._isOpen) {
                return
            }
            var d = this,
                e = d.options,
                c = d.uiDialog;
            d.overlay = e.modal ? new b.ui.dialog.overlay(d) : null;
            (c.next().length && c.appendTo("body"));
            d._size();
            d._position(e.position);
            c.show(e.show);
            d.moveToTop(true);
            (e.modal && c.bind("keypress.ui-dialog", function (h) {
                if (h.keyCode != b.ui.keyCode.TAB) {
                    return
                }
                var g = b(":tabbable", this),
                    i = g.filter(":first"),
                    f = g.filter(":last");
                if (h.target == f[0] && !h.shiftKey) {
                    i.focus(1);
                    return false
                } else {
                    if (h.target == i[0] && h.shiftKey) {
                        f.focus(1);
                        return false
                    }
                }
            }));
            b([]).add(c.find(".ui-dialog-content :tabbable:first")).add(c.find(".ui-dialog-buttonpane :tabbable:first")).add(c).filter(":first").focus();
            d._trigger("open");
            d._isOpen = true;
            return d
        },
        _createButtons: function (f) {
            var e = this,
                c = false,
                d = b("<div></div>").addClass("ui-dialog-buttonpane ui-widget-content ui-helper-clearfix");
            e.uiDialog.find(".ui-dialog-buttonpane").remove();
            (typeof f == "object" && f !== null && b.each(f, function () {
                return !(c = true)
            }));
            if (c) {
                b.each(f, function (g, i) {
                    var h = b('<button type="button"></button>').text(g).click(function () {
                        i.apply(e.element[0], arguments)
                    }).appendTo(d);
                    (b.fn.button && h.button())
                });
                d.appendTo(e.uiDialog)
            }
        },
        _makeDraggable: function () {
            var c = this,
                e = c.options,
                f = b(document),
                d;
            c.uiDialog.draggable({
                cancel: ".ui-dialog-content, .ui-dialog-titlebar-close",
                handle: ".ui-dialog-titlebar",
                containment: "document",
                start: function (g) {
                    d = e.height === "auto" ? "auto" : b(this).height();
                    b(this).height(b(this).height()).addClass("ui-dialog-dragging");
                    c._trigger("dragStart", g)
                },
                drag: function (g) {
                    c._trigger("drag", g)
                },
                stop: function (g, h) {
                    e.position = [h.position.left - f.scrollLeft(), h.position.top - f.scrollTop()];
                    b(this).removeClass("ui-dialog-dragging").height(d);
                    c._trigger("dragStop", g);
                    b.ui.dialog.overlay.resize()
                }
            })
        },
        _makeResizable: function (g) {
            g = (g === undefined ? this.options.resizable : g);
            var d = this,
                f = d.options,
                c = d.uiDialog.css("position"),
                e = typeof g == "string" ? g : "n,e,s,w,se,sw,ne,nw";
            d.uiDialog.resizable({
                cancel: ".ui-dialog-content",
                containment: "document",
                alsoResize: d.element,
                maxWidth: f.maxWidth,
                maxHeight: f.maxHeight,
                minWidth: f.minWidth,
                minHeight: d._minHeight(),
                handles: e,
                start: function (h) {
                    b(this).addClass("ui-dialog-resizing");
                    d._trigger("resizeStart", h)
                },
                resize: function (h) {
                    d._trigger("resize", h)
                },
                stop: function (h) {
                    b(this).removeClass("ui-dialog-resizing");
                    f.height = b(this).height();
                    f.width = b(this).width();
                    d._trigger("resizeStop", h);
                    b.ui.dialog.overlay.resize()
                }
            }).css("position", c).find(".ui-resizable-se").addClass("ui-icon ui-icon-grip-diagonal-se")
        },
        _minHeight: function () {
            var c = this.options;
            return (c.height == "auto" ? c.minHeight : Math.min(c.minHeight, c.height))
        },
        _position: function (d) {
            var e = [],
                f = [0, 0];
            d = d || b.ui.dialog.prototype.options.position;
            if (typeof d == "string" || (typeof d == "object" && "0" in d)) {
                e = d.split ? d.split(" ") : [d[0], d[1]];
                if (e.length == 1) {
                    e[1] = e[0]
                }
                b.each(["left", "top"], function (h, g) {
                    if (+e[h] == e[h]) {
                        f[h] = e[h];
                        e[h] = g
                    }
                })
            } else {
                if (typeof d == "object") {
                    if ("left" in d) {
                        e[0] = "left";
                        f[0] = d.left
                    } else {
                        if ("right" in d) {
                            e[0] = "right";
                            f[0] = -d.right
                        }
                    }
                    if ("top" in d) {
                        e[1] = "top";
                        f[1] = d.top
                    } else {
                        if ("bottom" in d) {
                            e[1] = "bottom";
                            f[1] = -d.bottom
                        }
                    }
                }
            }
            var c = this.uiDialog.is(":visible");
            if (!c) {
                this.uiDialog.show()
            }
            this.uiDialog.css({
                top: 0,
                left: 0
            }).position({
                my: e.join(" "),
                at: e.join(" "),
                offset: f.join(" "),
                of: window,
                collision: "fit",
                using: function (h) {
                    var g = b(this).css(h).offset().top;
                    if (g < 0) {
                        b(this).css("top", h.top - g)
                    }
                }
            });
            if (!c) {
                this.uiDialog.hide()
            }
        },
        _setOption: function (f, g) {
            var d = this,
                c = d.uiDialog,
                h = c.is(":data(resizable)"),
                e = false;
            switch (f) {
            case "beforeclose":
                f = "beforeClose";
                break;
            case "buttons":
                d._createButtons(g);
                break;
            case "closeText":
                d.uiDialogTitlebarCloseText.text("" + g);
                break;
            case "dialogClass":
                c.removeClass(d.options.dialogClass).addClass(a + g);
                break;
            case "disabled":
                (g ? c.addClass("ui-dialog-disabled") : c.removeClass("ui-dialog-disabled"));
                break;
            case "draggable":
                (g ? d._makeDraggable() : c.draggable("destroy"));
                break;
            case "height":
                e = true;
                break;
            case "maxHeight":
                (h && c.resizable("option", "maxHeight", g));
                e = true;
                break;
            case "maxWidth":
                (h && c.resizable("option", "maxWidth", g));
                e = true;
                break;
            case "minHeight":
                (h && c.resizable("option", "minHeight", g));
                e = true;
                break;
            case "minWidth":
                (h && c.resizable("option", "minWidth", g));
                e = true;
                break;
            case "position":
                d._position(g);
                break;
            case "resizable":
                (h && !g && c.resizable("destroy"));
                (h && typeof g == "string" && c.resizable("option", "handles", g));
                (h || (g !== false && d._makeResizable(g)));
                break;
            case "title":
                b(".ui-dialog-title", d.uiDialogTitlebar).html("" + (g || "&#160;"));
                break;
            case "width":
                e = true;
                break
            }
            b.Widget.prototype._setOption.apply(d, arguments);
            (e && d._size())
        },
        _size: function () {
            var d = this.options;
            this.element.css("width", "auto").hide();
            var c = this.uiDialog.css({
                height: "auto",
                width: d.width
            }).height();
            this.element.css(d.height == "auto" ? {
                minHeight: Math.max(d.minHeight - c, 0),
                height: "auto"
            } : {
                minHeight: 0,
                height: Math.max(d.height - c, 0)
            }).show();
            (this.uiDialog.is(":data(resizable)") && this.uiDialog.resizable("option", "minHeight", this._minHeight()))
        }
    });
    b.extend(b.ui.dialog, {
        version: "1.8rc3",
        uuid: 0,
        maxZ: 0,
        getTitleId: function (c) {
            return "ui-dialog-title-" + (c.attr("id") || ++this.uuid)
        },
        overlay: function (c) {
            this.$el = b.ui.dialog.overlay.create(c)
        }
    });
    b.extend(b.ui.dialog.overlay, {
        instances: [],
        oldInstances: [],
        maxZ: 0,
        events: b.map("focus,mousedown,mouseup,keydown,keypress,click".split(","), function (c) {
            return c + ".dialog-overlay"
        }).join(" "),
        create: function (d) {
            if (this.instances.length === 0) {
                setTimeout(function () {
                    if (b.ui.dialog.overlay.instances.length) {
                        b(document).bind(b.ui.dialog.overlay.events, function (e) {
                            return (b(e.target).zIndex() >= b.ui.dialog.overlay.maxZ)
                        })
                    }
                }, 1);
                b(document).bind("keydown.dialog-overlay", function (e) {
                    if (d.options.closeOnEscape && e.keyCode && e.keyCode == b.ui.keyCode.ESCAPE) {
                        d.close(e);
                        e.preventDefault()
                    }
                });
                b(window).bind("resize.dialog-overlay", b.ui.dialog.overlay.resize)
            }
            var c = (this.oldInstances.length ? this.oldInstances.splice(0, 1)[0] : b("<div></div>").addClass("ui-widget-overlay")).appendTo(document.body).css({
                width: this.width(),
                height: this.height()
            });
            (b.fn.bgiframe && c.bgiframe());
            this.instances.push(c);
            return c
        },
        destroy: function (c) {
            this.oldInstances.push(this.instances.splice(b.inArray(this.instances, c), 1)[0]);
            if (this.instances.length === 0) {
                b([document, window]).unbind(".dialog-overlay")
            }
            c.remove();
            var d = 0;
            b.each(this.instances, function () {
                d = Math.max(d, this.css("z-index"))
            });
            this.maxZ = d
        },
        height: function () {
            if (b.browser.msie && b.browser.version < 7) {
                var d = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
                var c = Math.max(document.documentElement.offsetHeight, document.body.offsetHeight);
                if (d < c) {
                    return b(window).height() + "px"
                } else {
                    return d + "px"
                }
            } else {
                return b(document).height() + "px"
            }
        },
        width: function () {
            if (b.browser.msie && b.browser.version < 7) {
                var c = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
                var d = Math.max(document.documentElement.offsetWidth, document.body.offsetWidth);
                if (c < d) {
                    return b(window).width() + "px"
                } else {
                    return c + "px"
                }
            } else {
                return b(document).width() + "px"
            }
        },
        resize: function () {
            var c = b([]);
            b.each(b.ui.dialog.overlay.instances, function () {
                c = c.add(this)
            });
            c.css({
                width: 0,
                height: 0
            }).css({
                width: b.ui.dialog.overlay.width(),
                height: b.ui.dialog.overlay.height()
            })
        }
    });
    b.extend(b.ui.dialog.overlay.prototype, {
        destroy: function () {
            b.ui.dialog.overlay.destroy(this.$el)
        }
    })
})(jQuery);;
(function (b) {
    var a = 5;
    b.widget("ui.slider", b.ui.mouse, {
        widgetEventPrefix: "slide",
        options: {
            animate: false,
            distance: 0,
            max: 100,
            min: 0,
            orientation: "horizontal",
            range: false,
            step: 1,
            value: 0,
            values: null
        },
        _create: function () {
            var c = this,
                d = this.options;
            this._keySliding = false;
            this._mouseSliding = false;
            this._animateOff = true;
            this._handleIndex = null;
            this._detectOrientation();
            this._mouseInit();
            this.element.addClass("ui-slider ui-slider-" + this.orientation + " ui-widget ui-widget-content ui-corner-all");
            if (d.disabled) {
                this.element.addClass("ui-slider-disabled ui-disabled")
            }
            this.range = b([]);
            if (d.range) {
                if (d.range === true) {
                    this.range = b("<div></div>");
                    if (!d.values) {
                        d.values = [this._valueMin(), this._valueMin()]
                    }
                    if (d.values.length && d.values.length != 2) {
                        d.values = [d.values[0], d.values[0]]
                    }
                } else {
                    this.range = b("<div></div>")
                }
                this.range.appendTo(this.element).addClass("ui-slider-range");
                if (d.range == "min" || d.range == "max") {
                    this.range.addClass("ui-slider-range-" + d.range)
                }
                this.range.addClass("ui-widget-header")
            }
            if (b(".ui-slider-handle", this.element).length == 0) {
                b('<a href="#"></a>').appendTo(this.element).addClass("ui-slider-handle")
            }
            if (d.values && d.values.length) {
                while (b(".ui-slider-handle", this.element).length < d.values.length) {
                    b('<a href="#"></a>').appendTo(this.element).addClass("ui-slider-handle")
                }
            }
            this.handles = b(".ui-slider-handle", this.element).addClass("ui-state-default ui-corner-all");
            this.handle = this.handles.eq(0);
            this.handles.add(this.range).filter("a").click(function (e) {
                e.preventDefault()
            }).hover(function () {
                if (!d.disabled) {
                    b(this).addClass("ui-state-hover")
                }
            }, function () {
                b(this).removeClass("ui-state-hover")
            }).focus(function () {
                if (!d.disabled) {
                    b(".ui-slider .ui-state-focus").removeClass("ui-state-focus");
                    b(this).addClass("ui-state-focus")
                } else {
                    b(this).blur()
                }
            }).blur(function () {
                b(this).removeClass("ui-state-focus")
            });
            this.handles.each(function (e) {
                b(this).data("index.ui-slider-handle", e)
            });
            this.handles.keydown(function (j) {
                var g = true;
                var f = b(this).data("index.ui-slider-handle");
                if (c.options.disabled) {
                    return
                }
                switch (j.keyCode) {
                case b.ui.keyCode.HOME:
                case b.ui.keyCode.END:
                case b.ui.keyCode.PAGE_UP:
                case b.ui.keyCode.PAGE_DOWN:
                case b.ui.keyCode.UP:
                case b.ui.keyCode.RIGHT:
                case b.ui.keyCode.DOWN:
                case b.ui.keyCode.LEFT:
                    g = false;
                    if (!c._keySliding) {
                        c._keySliding = true;
                        b(this).addClass("ui-state-active");
                        c._start(j, f)
                    }
                    break
                }
                var h, e, i = c._step();
                if (c.options.values && c.options.values.length) {
                    h = e = c.values(f)
                } else {
                    h = e = c.value()
                }
                switch (j.keyCode) {
                case b.ui.keyCode.HOME:
                    e = c._valueMin();
                    break;
                case b.ui.keyCode.END:
                    e = c._valueMax();
                    break;
                case b.ui.keyCode.PAGE_UP:
                    e = h + ((c._valueMax() - c._valueMin()) / a);
                    break;
                case b.ui.keyCode.PAGE_DOWN:
                    e = h - ((c._valueMax() - c._valueMin()) / a);
                    break;
                case b.ui.keyCode.UP:
                case b.ui.keyCode.RIGHT:
                    if (h == c._valueMax()) {
                        return
                    }
                    e = h + i;
                    break;
                case b.ui.keyCode.DOWN:
                case b.ui.keyCode.LEFT:
                    if (h == c._valueMin()) {
                        return
                    }
                    e = h - i;
                    break
                }
                c._slide(j, f, e);
                return g
            }).keyup(function (f) {
                var e = b(this).data("index.ui-slider-handle");
                if (c._keySliding) {
                    c._stop(f, e);
                    c._change(f, e);
                    c._keySliding = false;
                    b(this).removeClass("ui-state-active")
                }
            });
            this._refreshValue();
            this._animateOff = false
        },
        destroy: function () {
            this.handles.remove();
            this.range.remove();
            this.element.removeClass("ui-slider ui-slider-horizontal ui-slider-vertical ui-slider-disabled ui-widget ui-widget-content ui-corner-all").removeData("slider").unbind(".slider");
            this._mouseDestroy();
            return this
        },
        _mouseCapture: function (e) {
            var f = this.options;
            if (f.disabled) {
                return false
            }
            this.elementSize = {
                width: this.element.outerWidth(),
                height: this.element.outerHeight()
            };
            this.elementOffset = this.element.offset();
            var i = {
                x: e.pageX,
                y: e.pageY
            };
            var k = this._normValueFromMouse(i);
            var d = this._valueMax() - this._valueMin() + 1,
                g;
            var l = this,
                j;
            this.handles.each(function (m) {
                var n = Math.abs(k - l.values(m));
                if (d > n) {
                    d = n;
                    g = b(this);
                    j = m
                }
            });
            if (f.range == true && this.values(1) == f.min) {
                g = b(this.handles[++j])
            }
            this._start(e, j);
            this._mouseSliding = true;
            l._handleIndex = j;
            g.addClass("ui-state-active").focus();
            var h = g.offset();
            var c = !b(e.target).parents().andSelf().is(".ui-slider-handle");
            this._clickOffset = c ? {
                left: 0,
                top: 0
            } : {
                left: e.pageX - h.left - (g.width() / 2),
                top: e.pageY - h.top - (g.height() / 2) - (parseInt(g.css("borderTopWidth"), 10) || 0) - (parseInt(g.css("borderBottomWidth"), 10) || 0) + (parseInt(g.css("marginTop"), 10) || 0)
            };
            k = this._normValueFromMouse(i);
            this._slide(e, j, k);
            this._animateOff = true;
            return true
        },
        _mouseStart: function (c) {
            return true
        },
        _mouseDrag: function (e) {
            var c = {
                x: e.pageX,
                y: e.pageY
            };
            var d = this._normValueFromMouse(c);
            this._slide(e, this._handleIndex, d);
            return false
        },
        _mouseStop: function (c) {
            this.handles.removeClass("ui-state-active");
            this._mouseSliding = false;
            this._stop(c, this._handleIndex);
            this._change(c, this._handleIndex);
            this._handleIndex = null;
            this._clickOffset = null;
            this._animateOff = false;
            return false
        },
        _detectOrientation: function () {
            this.orientation = this.options.orientation == "vertical" ? "vertical" : "horizontal"
        },
        _normValueFromMouse: function (e) {
            var d, i;
            if ("horizontal" == this.orientation) {
                d = this.elementSize.width;
                i = e.x - this.elementOffset.left - (this._clickOffset ? this._clickOffset.left : 0)
            } else {
                d = this.elementSize.height;
                i = e.y - this.elementOffset.top - (this._clickOffset ? this._clickOffset.top : 0)
            }
            var g = (i / d);
            if (g > 1) {
                g = 1
            }
            if (g < 0) {
                g = 0
            }
            if ("vertical" == this.orientation) {
                g = 1 - g
            }
            var f = this._valueMax() - this._valueMin(),
                j = g * f,
                c = j % this.options.step,
                h = this._valueMin() + j - c;
            if (c > (this.options.step / 2)) {
                h += this.options.step
            }
            return parseFloat(h.toFixed(5))
        },
        _start: function (e, d) {
            var c = {
                handle: this.handles[d],
                value: this.value()
            };
            if (this.options.values && this.options.values.length) {
                c.value = this.values(d);
                c.values = this.values()
            }
            this._trigger("start", e, c)
        },
        _slide: function (g, f, e) {
            var h = this.handles[f];
            if (this.options.values && this.options.values.length) {
                var c = this.values(f ? 0 : 1);
                if ((this.options.values.length == 2 && this.options.range === true) && ((f == 0 && e > c) || (f == 1 && e < c))) {
                    e = c
                }
                if (e != this.values(f)) {
                    var d = this.values();
                    d[f] = e;
                    var i = this._trigger("slide", g, {
                        handle: this.handles[f],
                        value: e,
                        values: d
                    });
                    var c = this.values(f ? 0 : 1);
                    if (i !== false) {
                        this.values(f, e, true)
                    }
                }
            } else {
                if (e != this.value()) {
                    var i = this._trigger("slide", g, {
                        handle: this.handles[f],
                        value: e
                    });
                    if (i !== false) {
                        this.value(e)
                    }
                }
            }
        },
        _stop: function (e, d) {
            var c = {
                handle: this.handles[d],
                value: this.value()
            };
            if (this.options.values && this.options.values.length) {
                c.value = this.values(d);
                c.values = this.values()
            }
            this._trigger("stop", e, c)
        },
        _change: function (e, d) {
            if (!this._keySliding && !this._mouseSliding) {
                var c = {
                    handle: this.handles[d],
                    value: this.value()
                };
                if (this.options.values && this.options.values.length) {
                    c.value = this.values(d);
                    c.values = this.values()
                }
                this._trigger("change", e, c)
            }
        },
        value: function (c) {
            if (arguments.length) {
                this.options.value = this._trimValue(c);
                this._refreshValue();
                this._change(null, 0)
            }
            return this._value()
        },
        values: function (e, h) {
            if (arguments.length > 1) {
                this.options.values[e] = this._trimValue(h);
                this._refreshValue();
                this._change(null, e)
            }
            if (arguments.length) {
                if (b.isArray(arguments[0])) {
                    var g = this.options.values,
                        d = arguments[0];
                    for (var f = 0, c = g.length; f < c; f++) {
                        g[f] = this._trimValue(d[f]);
                        this._change(null, f)
                    }
                    this._refreshValue()
                } else {
                    if (this.options.values && this.options.values.length) {
                        return this._values(e)
                    } else {
                        return this.value()
                    }
                }
            } else {
                return this._values()
            }
        },
        _setOption: function (c, d) {
            b.Widget.prototype._setOption.apply(this, arguments);
            switch (c) {
            case "disabled":
                if (d) {
                    this.handles.filter(".ui-state-focus").blur();
                    this.handles.removeClass("ui-state-hover");
                    this.handles.attr("disabled", "disabled");
                    this.element.addClass("ui-disabled")
                } else {
                    this.handles.removeAttr("disabled");
                    this.element.removeClass("ui-disabled")
                }
            case "orientation":
                this._detectOrientation();
                this.element.removeClass("ui-slider-horizontal ui-slider-vertical").addClass("ui-slider-" + this.orientation);
                this._refreshValue();
                break;
            case "value":
                this._animateOff = true;
                this._refreshValue();
                this._animateOff = false;
                break;
            case "values":
                this._animateOff = true;
                this._refreshValue();
                this._animateOff = false;
                break
            }
        },
        _step: function () {
            var c = this.options.step;
            return c
        },
        _value: function () {
            var c = this.options.value;
            c = this._trimValue(c);
            return c
        },
        _values: function (d) {
            if (arguments.length) {
                var g = this.options.values[d];
                g = this._trimValue(g);
                return g
            } else {
                var f = this.options.values.slice();
                for (var e = 0, c = f.length; e < c; e++) {
                    f[e] = this._trimValue(f[e])
                }
                return f
            }
        },
        _trimValue: function (c) {
            if (c < this._valueMin()) {
                c = this._valueMin()
            }
            if (c > this._valueMax()) {
                c = this._valueMax()
            }
            return c
        },
        _valueMin: function () {
            var c = this.options.min;
            return c
        },
        _valueMax: function () {
            var c = this.options.max;
            return c
        },
        _refreshValue: function () {
            var g = this.options.range,
                e = this.options,
                m = this;
            var d = (!this._animateOff) ? e.animate : false;
            if (this.options.values && this.options.values.length) {
                var j, i;
                this.handles.each(function (q, o) {
                    var p = (m.values(q) - m._valueMin()) / (m._valueMax() - m._valueMin()) * 100;
                    var n = {};
                    n[m.orientation == "horizontal" ? "left" : "bottom"] = p + "%";
                    b(this).stop(1, 1)[d ? "animate" : "css"](n, e.animate);
                    if (m.options.range === true) {
                        if (m.orientation == "horizontal") {
                            (q == 0) && m.range.stop(1, 1)[d ? "animate" : "css"]({
                                left: p + "%"
                            }, e.animate);
                            (q == 1) && m.range[d ? "animate" : "css"]({
                                width: (p - lastValPercent) + "%"
                            }, {
                                queue: false,
                                duration: e.animate
                            })
                        } else {
                            (q == 0) && m.range.stop(1, 1)[d ? "animate" : "css"]({
                                bottom: (p) + "%"
                            }, e.animate);
                            (q == 1) && m.range[d ? "animate" : "css"]({
                                height: (p - lastValPercent) + "%"
                            }, {
                                queue: false,
                                duration: e.animate
                            })
                        }
                    }
                    lastValPercent = p
                })
            } else {
                var k = this.value(),
                    h = this._valueMin(),
                    l = this._valueMax(),
                    f = l != h ? (k - h) / (l - h) * 100 : 0;
                var c = {};
                c[m.orientation == "horizontal" ? "left" : "bottom"] = f + "%";
                this.handle.stop(1, 1)[d ? "animate" : "css"](c, e.animate);
                (g == "min") && (this.orientation == "horizontal") && this.range.stop(1, 1)[d ? "animate" : "css"]({
                    width: f + "%"
                }, e.animate);
                (g == "max") && (this.orientation == "horizontal") && this.range[d ? "animate" : "css"]({
                    width: (100 - f) + "%"
                }, {
                    queue: false,
                    duration: e.animate
                });
                (g == "min") && (this.orientation == "vertical") && this.range.stop(1, 1)[d ? "animate" : "css"]({
                    height: f + "%"
                }, e.animate);
                (g == "max") && (this.orientation == "vertical") && this.range[d ? "animate" : "css"]({
                    height: (100 - f) + "%"
                }, {
                    queue: false,
                    duration: e.animate
                })
            }
        }
    });
    b.extend(b.ui.slider, {
        version: "1.8rc3"
    })
})(jQuery);;
(function (b) {
    var a = 0;
    b.widget("ui.tabs", {
        options: {
            add: null,
            ajaxOptions: null,
            cache: false,
            cookie: null,
            collapsible: false,
            disable: null,
            disabled: [],
            enable: null,
            event: "click",
            fx: null,
            idPrefix: "ui-tabs-",
            load: null,
            panelTemplate: "<div></div>",
            remove: null,
            select: null,
            show: null,
            spinner: "<em>Loading&#8230;</em>",
            tabTemplate: '<li><a href="#{href}"><span>#{label}</span></a></li>'
        },
        _create: function () {
            this._tabify(true)
        },
        _setOption: function (c, d) {
            if (c == "selected") {
                if (this.options.collapsible && d == this.options.selected) {
                    return
                }
                this.select(d)
            } else {
                this.options[c] = d;
                this._tabify()
            }
        },
        _tabId: function (c) {
            return c.title && c.title.replace(/\s/g, "_").replace(/[^A-Za-z0-9\-_:\.]/g, "") || this.options.idPrefix + (++a)
        },
        _sanitizeSelector: function (c) {
            return c.replace(/:/g, "\\:")
        },
        _cookie: function () {
            var c = this.cookie || (this.cookie = this.options.cookie.name || "ui-tabs-" + b.data(this.list[0]));
            return b.cookie.apply(null, [c].concat(b.makeArray(arguments)))
        },
        _ui: function (d, c) {
            return {
                tab: d,
                panel: c,
                index: this.anchors.index(d)
            }
        },
        _cleanup: function () {
            this.lis.filter(".ui-state-processing").removeClass("ui-state-processing").find("span:data(label.tabs)").each(function () {
                var c = b(this);
                c.html(c.data("label.tabs")).removeData("label.tabs")
            })
        },
        _tabify: function (p) {
            this.list = this.element.find("ol,ul").eq(0);
            this.lis = b("li:has(a[href])", this.list);
            this.anchors = this.lis.map(function () {
                return b("a", this)[0]
            });
            this.panels = b([]);
            var q = this,
                e = this.options;
            var d = /^#.+/;
            this.anchors.each(function (s, o) {
                var r = b(o).attr("href");
                var u = r.split("#")[0],
                    v;
                if (u && (u === location.toString().split("#")[0] || (v = b("base")[0]) && u === v.href)) {
                    r = o.hash;
                    o.href = r
                }
                if (d.test(r)) {
                    q.panels = q.panels.add(q._sanitizeSelector(r))
                } else {
                    if (r != "#") {
                        b.data(o, "href.tabs", r);
                        b.data(o, "load.tabs", r.replace(/#.*$/, ""));
                        var x = q._tabId(o);
                        o.href = "#" + x;
                        var w = b("#" + x);
                        if (!w.length) {
                            w = b(e.panelTemplate).attr("id", x).addClass("ui-tabs-panel ui-widget-content ui-corner-bottom").insertAfter(q.panels[s - 1] || q.list);
                            w.data("destroy.tabs", true)
                        }
                        q.panels = q.panels.add(w)
                    } else {
                        e.disabled.push(s)
                    }
                }
            });
            if (p) {
                this.element.addClass("ui-tabs ui-widget ui-widget-content ui-corner-all");
                this.list.addClass("ui-tabs-nav ui-helper-reset ui-helper-clearfix ui-widget-header ui-corner-all");
                this.lis.addClass("ui-state-default ui-corner-top");
                this.panels.addClass("ui-tabs-panel ui-widget-content ui-corner-bottom");
                if (e.selected === undefined) {
                    if (location.hash) {
                        this.anchors.each(function (r, o) {
                            if (o.hash == location.hash) {
                                e.selected = r;
                                return false
                            }
                        })
                    }
                    if (typeof e.selected != "number" && e.cookie) {
                        e.selected = parseInt(q._cookie(), 10)
                    }
                    if (typeof e.selected != "number" && this.lis.filter(".ui-tabs-selected").length) {
                        e.selected = this.lis.index(this.lis.filter(".ui-tabs-selected"))
                    }
                    e.selected = e.selected || (this.lis.length ? 0 : -1)
                } else {
                    if (e.selected === null) {
                        e.selected = -1
                    }
                }
                e.selected = ((e.selected >= 0 && this.anchors[e.selected]) || e.selected < 0) ? e.selected : 0;
                e.disabled = b.unique(e.disabled.concat(b.map(this.lis.filter(".ui-state-disabled"), function (r, o) {
                    return q.lis.index(r)
                }))).sort();
                if (b.inArray(e.selected, e.disabled) != -1) {
                    e.disabled.splice(b.inArray(e.selected, e.disabled), 1)
                }
                this.panels.addClass("ui-tabs-hide");
                this.lis.removeClass("ui-tabs-selected ui-state-active");
                if (e.selected >= 0 && this.anchors.length) {
                    this.panels.eq(e.selected).removeClass("ui-tabs-hide");
                    this.lis.eq(e.selected).addClass("ui-tabs-selected ui-state-active");
                    q.element.queue("tabs", function () {
                        q._trigger("show", null, q._ui(q.anchors[e.selected], q.panels[e.selected]))
                    });
                    this.load(e.selected)
                }
                b(window).bind("unload", function () {
                    q.lis.add(q.anchors).unbind(".tabs");
                    q.lis = q.anchors = q.panels = null
                })
            } else {
                e.selected = this.lis.index(this.lis.filter(".ui-tabs-selected"))
            }
            this.element[e.collapsible ? "addClass" : "removeClass"]("ui-tabs-collapsible");
            if (e.cookie) {
                this._cookie(e.selected, e.cookie)
            }
            for (var h = 0, n;
            (n = this.lis[h]); h++) {
                b(n)[b.inArray(h, e.disabled) != -1 && !b(n).hasClass("ui-tabs-selected") ? "addClass" : "removeClass"]("ui-state-disabled")
            }
            if (e.cache === false) {
                this.anchors.removeData("cache.tabs")
            }
            this.lis.add(this.anchors).unbind(".tabs");
            if (e.event != "mouseover") {
                var g = function (o, i) {
                    if (i.is(":not(.ui-state-disabled)")) {
                        i.addClass("ui-state-" + o)
                    }
                };
                var k = function (o, i) {
                    i.removeClass("ui-state-" + o)
                };
                this.lis.bind("mouseover.tabs", function () {
                    g("hover", b(this))
                });
                this.lis.bind("mouseout.tabs", function () {
                    k("hover", b(this))
                });
                this.anchors.bind("focus.tabs", function () {
                    g("focus", b(this).closest("li"))
                });
                this.anchors.bind("blur.tabs", function () {
                    k("focus", b(this).closest("li"))
                })
            }
            var c, j;
            if (e.fx) {
                if (b.isArray(e.fx)) {
                    c = e.fx[0];
                    j = e.fx[1]
                } else {
                    c = j = e.fx
                }
            }
            function f(i, o) {
                i.css({
                    display: ""
                });
                if (!b.support.opacity && o.opacity) {
                    i[0].style.removeAttribute("filter")
                }
            }
            var l = j ?
            function (i, o) {
                b(i).closest("li").addClass("ui-tabs-selected ui-state-active");
                o.hide().removeClass("ui-tabs-hide").animate(j, j.duration || "normal", function () {
                    f(o, j);
                    q._trigger("show", null, q._ui(i, o[0]))
                })
            } : function (i, o) {
                b(i).closest("li").addClass("ui-tabs-selected ui-state-active");
                o.removeClass("ui-tabs-hide");
                q._trigger("show", null, q._ui(i, o[0]))
            };
            var m = c ?
            function (o, i) {
                i.animate(c, c.duration || "normal", function () {
                    q.lis.removeClass("ui-tabs-selected ui-state-active");
                    i.addClass("ui-tabs-hide");
                    f(i, c);
                    q.element.dequeue("tabs")
                })
            } : function (o, i, r) {
                q.lis.removeClass("ui-tabs-selected ui-state-active");
                i.addClass("ui-tabs-hide");
                q.element.dequeue("tabs")
            };
            this.anchors.bind(e.event + ".tabs", function () {
                var o = this,
                    s = b(this).closest("li"),
                    i = q.panels.filter(":not(.ui-tabs-hide)"),
                    r = b(q._sanitizeSelector(this.hash));
                if ((s.hasClass("ui-tabs-selected") && !e.collapsible) || s.hasClass("ui-state-disabled") || s.hasClass("ui-state-processing") || q._trigger("select", null, q._ui(this, r[0])) === false) {
                    this.blur();
                    return false
                }
                e.selected = q.anchors.index(this);
                q.abort();
                if (e.collapsible) {
                    if (s.hasClass("ui-tabs-selected")) {
                        e.selected = -1;
                        if (e.cookie) {
                            q._cookie(e.selected, e.cookie)
                        }
                        q.element.queue("tabs", function () {
                            m(o, i)
                        }).dequeue("tabs");
                        this.blur();
                        return false
                    } else {
                        if (!i.length) {
                            if (e.cookie) {
                                q._cookie(e.selected, e.cookie)
                            }
                            q.element.queue("tabs", function () {
                                l(o, r)
                            });
                            q.load(q.anchors.index(this));
                            this.blur();
                            return false
                        }
                    }
                }
                if (e.cookie) {
                    q._cookie(e.selected, e.cookie)
                }
                if (r.length) {
                    if (i.length) {
                        q.element.queue("tabs", function () {
                            m(o, i)
                        })
                    }
                    q.element.queue("tabs", function () {
                        l(o, r)
                    });
                    q.load(q.anchors.index(this))
                } else {
                    throw "jQuery UI Tabs: Mismatching fragment identifier."
                }
                if (b.browser.msie) {
                    this.blur()
                }
            });
            this.anchors.bind("click.tabs", function () {
                return false
            })
        },
        destroy: function () {
            var c = this.options;
            this.abort();
            this.element.unbind(".tabs").removeClass("ui-tabs ui-widget ui-widget-content ui-corner-all ui-tabs-collapsible").removeData("tabs");
            this.list.removeClass("ui-tabs-nav ui-helper-reset ui-helper-clearfix ui-widget-header ui-corner-all");
            this.anchors.each(function () {
                var d = b.data(this, "href.tabs");
                if (d) {
                    this.href = d
                }
                var e = b(this).unbind(".tabs");
                b.each(["href", "load", "cache"], function (f, g) {
                    e.removeData(g + ".tabs")
                })
            });
            this.lis.unbind(".tabs").add(this.panels).each(function () {
                if (b.data(this, "destroy.tabs")) {
                    b(this).remove()
                } else {
                    b(this).removeClass(["ui-state-default", "ui-corner-top", "ui-tabs-selected", "ui-state-active", "ui-state-hover", "ui-state-focus", "ui-state-disabled", "ui-tabs-panel", "ui-widget-content", "ui-corner-bottom", "ui-tabs-hide"].join(" "))
                }
            });
            if (c.cookie) {
                this._cookie(null, c.cookie)
            }
            return this
        },
        add: function (f, e, d) {
            if (d === undefined) {
                d = this.anchors.length
            }
            var c = this,
                h = this.options,
                j = b(h.tabTemplate.replace(/#\{href\}/g, f).replace(/#\{label\}/g, e)),
                i = !f.indexOf("#") ? f.replace("#", "") : this._tabId(b("a", j)[0]);
            j.addClass("ui-state-default ui-corner-top").data("destroy.tabs", true);
            var g = b("#" + i);
            if (!g.length) {
                g = b(h.panelTemplate).attr("id", i).data("destroy.tabs", true)
            }
            g.addClass("ui-tabs-panel ui-widget-content ui-corner-bottom ui-tabs-hide");
            if (d >= this.lis.length) {
                j.appendTo(this.list);
                g.appendTo(this.list[0].parentNode)
            } else {
                j.insertBefore(this.lis[d]);
                g.insertBefore(this.panels[d])
            }
            h.disabled = b.map(h.disabled, function (l, k) {
                return l >= d ? ++l : l
            });
            this._tabify();
            if (this.anchors.length == 1) {
                h.selected = 0;
                j.addClass("ui-tabs-selected ui-state-active");
                g.removeClass("ui-tabs-hide");
                this.element.queue("tabs", function () {
                    c._trigger("show", null, c._ui(c.anchors[0], c.panels[0]))
                });
                this.load(0)
            }
            this._trigger("add", null, this._ui(this.anchors[d], this.panels[d]));
            return this
        },
        remove: function (c) {
            var e = this.options,
                f = this.lis.eq(c).remove(),
                d = this.panels.eq(c).remove();
            if (f.hasClass("ui-tabs-selected") && this.anchors.length > 1) {
                this.select(c + (c + 1 < this.anchors.length ? 1 : -1))
            }
            e.disabled = b.map(b.grep(e.disabled, function (h, g) {
                return h != c
            }), function (h, g) {
                return h >= c ? --h : h
            });
            this._tabify();
            this._trigger("remove", null, this._ui(f.find("a")[0], d[0]));
            return this
        },
        enable: function (c) {
            var d = this.options;
            if (b.inArray(c, d.disabled) == -1) {
                return
            }
            this.lis.eq(c).removeClass("ui-state-disabled");
            d.disabled = b.grep(d.disabled, function (f, e) {
                return f != c
            });
            this._trigger("enable", null, this._ui(this.anchors[c], this.panels[c]));
            return this
        },
        disable: function (d) {
            var c = this,
                e = this.options;
            if (d != e.selected) {
                this.lis.eq(d).addClass("ui-state-disabled");
                e.disabled.push(d);
                e.disabled.sort();
                this._trigger("disable", null, this._ui(this.anchors[d], this.panels[d]))
            }
            return this
        },
        select: function (c) {
            if (typeof c == "string") {
                c = this.anchors.index(this.anchors.filter("[href$=" + c + "]"))
            } else {
                if (c === null) {
                    c = -1
                }
            }
            if (c == -1 && this.options.collapsible) {
                c = this.options.selected
            }
            this.anchors.eq(c).trigger(this.options.event + ".tabs");
            return this
        },
        load: function (f) {
            var d = this,
                h = this.options,
                c = this.anchors.eq(f)[0],
                e = b.data(c, "load.tabs");
            this.abort();
            if (!e || this.element.queue("tabs").length !== 0 && b.data(c, "cache.tabs")) {
                this.element.dequeue("tabs");
                return
            }
            this.lis.eq(f).addClass("ui-state-processing");
            if (h.spinner) {
                var g = b("span", c);
                g.data("label.tabs", g.html()).html(h.spinner)
            }
            this.xhr = b.ajax(b.extend({}, h.ajaxOptions, {
                url: e,
                success: function (j, i) {
                    b(d._sanitizeSelector(c.hash)).html(j);
                    d._cleanup();
                    if (h.cache) {
                        b.data(c, "cache.tabs", true)
                    }
                    d._trigger("load", null, d._ui(d.anchors[f], d.panels[f]));
                    try {
                        h.ajaxOptions.success(j, i)
                    } catch (k) {}
                },
                error: function (k, i, j) {
                    d._cleanup();
                    d._trigger("load", null, d._ui(d.anchors[f], d.panels[f]));
                    try {
                        h.ajaxOptions.error(k, i, f, c)
                    } catch (j) {}
                }
            }));
            d.element.dequeue("tabs");
            return this
        },
        abort: function () {
            this.element.queue([]);
            this.panels.stop(false, true);
            this.element.queue("tabs", this.element.queue("tabs").splice(-2, 2));
            if (this.xhr) {
                this.xhr.abort();
                delete this.xhr
            }
            this._cleanup();
            return this
        },
        url: function (d, c) {
            this.anchors.eq(d).removeData("cache.tabs").data("load.tabs", c);
            return this
        },
        length: function () {
            return this.anchors.length
        }
    });
    b.extend(b.ui.tabs, {
        version: "1.8rc3"
    });
    b.extend(b.ui.tabs.prototype, {
        rotation: null,
        rotate: function (e, g) {
            var c = this,
                h = this.options;
            var d = c._rotate || (c._rotate = function (i) {
                clearTimeout(c.rotation);
                c.rotation = setTimeout(function () {
                    var j = h.selected;
                    c.select(++j < c.anchors.length ? j : 0)
                }, e);
                if (i) {
                    i.stopPropagation()
                }
            });
            var f = c._unrotate || (c._unrotate = !g ?
            function (i) {
                if (i.clientX) {
                    c.rotate(null)
                }
            } : function (i) {
                t = h.selected;
                d()
            });
            if (e) {
                this.element.bind("tabsshow", d);
                this.anchors.bind(h.event + ".tabs", f);
                d()
            } else {
                clearTimeout(c.rotation);
                this.element.unbind("tabsshow", d);
                this.anchors.unbind(h.event + ".tabs", f);
                delete this._rotate;
                delete this._unrotate
            }
            return this
        }
    })
})(jQuery);;
(function (a) {
    a.widget("ui.progressbar", {
        options: {
            value: 0
        },
        _create: function () {
            this.element.addClass("ui-progressbar ui-widget ui-widget-content ui-corner-all").attr({
                role: "progressbar",
                "aria-valuemin": this._valueMin(),
                "aria-valuemax": this._valueMax(),
                "aria-valuenow": this._value()
            });
            this.valueDiv = a("<div class='ui-progressbar-value ui-widget-header ui-corner-left'></div>").appendTo(this.element);
            this._refreshValue()
        },
        destroy: function () {
            this.element.removeClass("ui-progressbar ui-widget ui-widget-content ui-corner-all").removeAttr("role").removeAttr("aria-valuemin").removeAttr("aria-valuemax").removeAttr("aria-valuenow");
            this.valueDiv.remove();
            a.Widget.prototype.destroy.apply(this, arguments)
        },
        value: function (b) {
            if (b === undefined) {
                return this._value()
            }
            this._setOption("value", b);
            return this
        },
        _setOption: function (b, c) {
            switch (b) {
            case "value":
                this.options.value = c;
                this._refreshValue();
                this._trigger("change");
                break
            }
            a.Widget.prototype._setOption.apply(this, arguments)
        },
        _value: function () {
            var b = this.options.value;
            if (typeof b !== "number") {
                b = 0
            }
            if (b < this._valueMin()) {
                b = this._valueMin()
            }
            if (b > this._valueMax()) {
                b = this._valueMax()
            }
            return b
        },
        _valueMin: function () {
            return 0
        },
        _valueMax: function () {
            return 100
        },
        _refreshValue: function () {
            var b = this.value();
            this.valueDiv[b === this._valueMax() ? "addClass" : "removeClass"]("ui-corner-right").width(b + "%");
            this.element.attr("aria-valuenow", b)
        }
    });
    a.extend(a.ui.progressbar, {
        version: "1.8rc3"
    })
})(jQuery);;
jQuery.effects || (function (g) {
    g.effects = {};
    g.each(["backgroundColor", "borderBottomColor", "borderLeftColor", "borderRightColor", "borderTopColor", "color", "outlineColor"], function (l, k) {
        g.fx.step[k] = function (m) {
            if (!m.colorInit) {
                m.start = j(m.elem, k);
                m.end = i(m.end);
                m.colorInit = true
            }
            m.elem.style[k] = "rgb(" + Math.max(Math.min(parseInt((m.pos * (m.end[0] - m.start[0])) + m.start[0], 10), 255), 0) + "," + Math.max(Math.min(parseInt((m.pos * (m.end[1] - m.start[1])) + m.start[1], 10), 255), 0) + "," + Math.max(Math.min(parseInt((m.pos * (m.end[2] - m.start[2])) + m.start[2], 10), 255), 0) + ")"
        }
    });

    function i(l) {
        var k;
        if (l && l.constructor == Array && l.length == 3) {
            return l
        }
        if (k = /rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(l)) {
            return [parseInt(k[1], 10), parseInt(k[2], 10), parseInt(k[3], 10)]
        }
        if (k = /rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(l)) {
            return [parseFloat(k[1]) * 2.55, parseFloat(k[2]) * 2.55, parseFloat(k[3]) * 2.55]
        }
        if (k = /#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(l)) {
            return [parseInt(k[1], 16), parseInt(k[2], 16), parseInt(k[3], 16)]
        }
        if (k = /#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(l)) {
            return [parseInt(k[1] + k[1], 16), parseInt(k[2] + k[2], 16), parseInt(k[3] + k[3], 16)]
        }
        if (k = /rgba\(0, 0, 0, 0\)/.exec(l)) {
            return a.transparent
        }
        return a[g.trim(l).toLowerCase()]
    }
    function j(m, k) {
        var l;
        do {
            l = g.curCSS(m, k);
            if (l != "" && l != "transparent" || g.nodeName(m, "body")) {
                break
            }
            k = "backgroundColor"
        } while (m = m.parentNode);
        return i(l)
    }
    var a = {
        aqua: [0, 255, 255],
        azure: [240, 255, 255],
        beige: [245, 245, 220],
        black: [0, 0, 0],
        blue: [0, 0, 255],
        brown: [165, 42, 42],
        cyan: [0, 255, 255],
        darkblue: [0, 0, 139],
        darkcyan: [0, 139, 139],
        darkgrey: [169, 169, 169],
        darkgreen: [0, 100, 0],
        darkkhaki: [189, 183, 107],
        darkmagenta: [139, 0, 139],
        darkolivegreen: [85, 107, 47],
        darkorange: [255, 140, 0],
        darkorchid: [153, 50, 204],
        darkred: [139, 0, 0],
        darksalmon: [233, 150, 122],
        darkviolet: [148, 0, 211],
        fuchsia: [255, 0, 255],
        gold: [255, 215, 0],
        green: [0, 128, 0],
        indigo: [75, 0, 130],
        khaki: [240, 230, 140],
        lightblue: [173, 216, 230],
        lightcyan: [224, 255, 255],
        lightgreen: [144, 238, 144],
        lightgrey: [211, 211, 211],
        lightpink: [255, 182, 193],
        lightyellow: [255, 255, 224],
        lime: [0, 255, 0],
        magenta: [255, 0, 255],
        maroon: [128, 0, 0],
        navy: [0, 0, 128],
        olive: [128, 128, 0],
        orange: [255, 165, 0],
        pink: [255, 192, 203],
        purple: [128, 0, 128],
        violet: [128, 0, 128],
        red: [255, 0, 0],
        silver: [192, 192, 192],
        white: [255, 255, 255],
        yellow: [255, 255, 0],
        transparent: [255, 255, 255]
    };
    var e = ["add", "remove", "toggle"],
        c = {
            border: 1,
            borderBottom: 1,
            borderColor: 1,
            borderLeft: 1,
            borderRight: 1,
            borderTop: 1,
            borderWidth: 1,
            margin: 1,
            padding: 1
        };

    function f() {
        var n = document.defaultView ? document.defaultView.getComputedStyle(this, null) : this.currentStyle,
            o = {},
            l, m;
        if (n && n.length && n[0] && n[n[0]]) {
            var k = n.length;
            while (k--) {
                l = n[k];
                if (typeof n[l] == "string") {
                    m = l.replace(/\-(\w)/g, function (p, q) {
                        return q.toUpperCase()
                    });
                    o[m] = n[l]
                }
            }
        } else {
            for (l in n) {
                if (typeof n[l] === "string") {
                    o[l] = n[l]
                }
            }
        }
        return o
    }
    function b(l) {
        var k, m;
        for (k in l) {
            m = l[k];
            if (m == null || g.isFunction(m) || k in c || (/scrollbar/).test(k) || (!(/color/i).test(k) && isNaN(parseFloat(m)))) {
                delete l[k]
            }
        }
        return l
    }
    function h(k, m) {
        var n = {
            _: 0
        },
            l;
        for (l in m) {
            if (k[l] != m[l]) {
                n[l] = m[l]
            }
        }
        return n
    }
    g.effects.animateClass = function (k, l, n, m) {
        if (g.isFunction(n)) {
            m = n;
            n = null
        }
        return this.each(function () {
            var r = g(this),
                o = r.attr("style") || " ",
                s = b(f.call(this)),
                q, p = r.attr("className");
            g.each(e, function (t, u) {
                if (k[u]) {
                    r[u + "Class"](k[u])
                }
            });
            q = b(f.call(this));
            r.attr("className", p);
            r.animate(h(s, q), l, n, function () {
                g.each(e, function (t, u) {
                    if (k[u]) {
                        r[u + "Class"](k[u])
                    }
                });
                if (typeof r.attr("style") == "object") {
                    r.attr("style").cssText = "";
                    r.attr("style").cssText = o
                } else {
                    r.attr("style", o)
                }
                if (m) {
                    m.apply(this, arguments)
                }
            })
        })
    };
    g.fn.extend({
        _addClass: g.fn.addClass,
        addClass: function (l, k, n, m) {
            return k ? g.effects.animateClass.apply(this, [{
                add: l
            },
            k, n, m]) : this._addClass(l)
        },
        _removeClass: g.fn.removeClass,
        removeClass: function (l, k, n, m) {
            return k ? g.effects.animateClass.apply(this, [{
                remove: l
            },
            k, n, m]) : this._removeClass(l)
        },
        _toggleClass: g.fn.toggleClass,
        toggleClass: function (m, l, k, o, n) {
            if (typeof l == "boolean" || l === undefined) {
                if (!k) {
                    return this._toggleClass(m, l)
                } else {
                    return g.effects.animateClass.apply(this, [(l ? {
                        add: m
                    } : {
                        remove: m
                    }), k, o, n])
                }
            } else {
                return g.effects.animateClass.apply(this, [{
                    toggle: m
                },
                l, k, o])
            }
        },
        switchClass: function (k, m, l, o, n) {
            return g.effects.animateClass.apply(this, [{
                add: m,
                remove: k
            },
            l, o, n])
        }
    });
    g.extend(g.effects, {
        version: "1.8rc3",
        save: function (l, m) {
            for (var k = 0; k < m.length; k++) {
                if (m[k] !== null) {
                    l.data("ec.storage." + m[k], l[0].style[m[k]])
                }
            }
        },
        restore: function (l, m) {
            for (var k = 0; k < m.length; k++) {
                if (m[k] !== null) {
                    l.css(m[k], l.data("ec.storage." + m[k]))
                }
            }
        },
        setMode: function (k, l) {
            if (l == "toggle") {
                l = k.is(":hidden") ? "show" : "hide"
            }
            return l
        },
        getBaseline: function (l, m) {
            var n, k;
            switch (l[0]) {
            case "top":
                n = 0;
                break;
            case "middle":
                n = 0.5;
                break;
            case "bottom":
                n = 1;
                break;
            default:
                n = l[0] / m.height
            }
            switch (l[1]) {
            case "left":
                k = 0;
                break;
            case "center":
                k = 0.5;
                break;
            case "right":
                k = 1;
                break;
            default:
                k = l[1] / m.width
            }
            return {
                x: k,
                y: n
            }
        },
        createWrapper: function (k) {
            if (k.parent().is(".ui-effects-wrapper")) {
                return k.parent()
            }
            var l = {
                width: k.outerWidth(true),
                height: k.outerHeight(true),
                "float": k.css("float")
            },
                m = g("<div></div>").addClass("ui-effects-wrapper").css({
                    fontSize: "100%",
                    background: "transparent",
                    border: "none",
                    margin: 0,
                    padding: 0
                });
            k.wrap(m);
            m = k.parent();
            if (k.css("position") == "static") {
                m.css({
                    position: "relative"
                });
                k.css({
                    position: "relative"
                })
            } else {
                g.extend(l, {
                    position: k.css("position"),
                    zIndex: k.css("z-index")
                });
                g.each(["top", "left", "bottom", "right"], function (n, o) {
                    l[o] = k.css(o);
                    if (isNaN(parseInt(l[o], 10))) {
                        l[o] = "auto"
                    }
                });
                k.css({
                    position: "relative",
                    top: 0,
                    left: 0
                })
            }
            return m.css(l).show()
        },
        removeWrapper: function (k) {
            if (k.parent().is(".ui-effects-wrapper")) {
                return k.parent().replaceWith(k)
            }
            return k
        },
        setTransition: function (l, n, k, m) {
            m = m || {};
            g.each(n, function (p, o) {
                unit = l.cssUnit(o);
                if (unit[0] > 0) {
                    m[o] = unit[0] * k + unit[1]
                }
            });
            return m
        }
    });

    function d(l, k, m, n) {
        if (typeof l == "object") {
            n = k;
            m = null;
            k = l;
            l = k.effect
        }
        if (g.isFunction(k)) {
            n = k;
            m = null;
            k = {}
        }
        if (typeof k == "number" || g.fx.speeds[k]) {
            n = m;
            m = k;
            k = {}
        }
        k = k || {};
        m = m || k.duration;
        m = g.fx.off ? 0 : typeof m == "number" ? m : g.fx.speeds[m] || g.fx.speeds._default;
        n = n || k.complete;
        return [l, k, m, n]
    }
    g.fn.extend({
        effect: function (n, m, p, q) {
            var l = d.apply(this, arguments),
                o = {
                    options: l[1],
                    duration: l[2],
                    callback: l[3]
                },
                k = g.effects[n];
            return k && !g.fx.off ? k.call(this, o) : this
        },
        _show: g.fn.show,
        show: function (l) {
            if (!l || typeof l == "number" || g.fx.speeds[l]) {
                return this._show.apply(this, arguments)
            } else {
                var k = d.apply(this, arguments);
                k[1].mode = "show";
                return this.effect.apply(this, k)
            }
        },
        _hide: g.fn.hide,
        hide: function (l) {
            if (!l || typeof l == "number" || g.fx.speeds[l]) {
                return this._hide.apply(this, arguments)
            } else {
                var k = d.apply(this, arguments);
                k[1].mode = "hide";
                return this.effect.apply(this, k)
            }
        },
        __toggle: g.fn.toggle,
        toggle: function (l) {
            if (!l || typeof l == "number" || g.fx.speeds[l] || typeof l == "boolean" || g.isFunction(l)) {
                return this.__toggle.apply(this, arguments)
            } else {
                var k = d.apply(this, arguments);
                k[1].mode = "toggle";
                return this.effect.apply(this, k)
            }
        },
        cssUnit: function (k) {
            var l = this.css(k),
                m = [];
            g.each(["em", "px", "%", "pt"], function (n, o) {
                if (l.indexOf(o) > 0) {
                    m = [parseFloat(l), o]
                }
            });
            return m
        }
    });
    g.easing.jswing = g.easing.swing;
    g.extend(g.easing, {
        def: "easeOutQuad",
        swing: function (l, m, k, o, n) {
            return g.easing[g.easing.def](l, m, k, o, n)
        },
        easeInQuad: function (l, m, k, o, n) {
            return o * (m /= n) * m + k
        },
        easeOutQuad: function (l, m, k, o, n) {
            return -o * (m /= n) * (m - 2) + k
        },
        easeInOutQuad: function (l, m, k, o, n) {
            if ((m /= n / 2) < 1) {
                return o / 2 * m * m + k
            }
            return -o / 2 * ((--m) * (m - 2) - 1) + k
        },
        easeInCubic: function (l, m, k, o, n) {
            return o * (m /= n) * m * m + k
        },
        easeOutCubic: function (l, m, k, o, n) {
            return o * ((m = m / n - 1) * m * m + 1) + k
        },
        easeInOutCubic: function (l, m, k, o, n) {
            if ((m /= n / 2) < 1) {
                return o / 2 * m * m * m + k
            }
            return o / 2 * ((m -= 2) * m * m + 2) + k
        },
        easeInQuart: function (l, m, k, o, n) {
            return o * (m /= n) * m * m * m + k
        },
        easeOutQuart: function (l, m, k, o, n) {
            return -o * ((m = m / n - 1) * m * m * m - 1) + k
        },
        easeInOutQuart: function (l, m, k, o, n) {
            if ((m /= n / 2) < 1) {
                return o / 2 * m * m * m * m + k
            }
            return -o / 2 * ((m -= 2) * m * m * m - 2) + k
        },
        easeInQuint: function (l, m, k, o, n) {
            return o * (m /= n) * m * m * m * m + k
        },
        easeOutQuint: function (l, m, k, o, n) {
            return o * ((m = m / n - 1) * m * m * m * m + 1) + k
        },
        easeInOutQuint: function (l, m, k, o, n) {
            if ((m /= n / 2) < 1) {
                return o / 2 * m * m * m * m * m + k
            }
            return o / 2 * ((m -= 2) * m * m * m * m + 2) + k
        },
        easeInSine: function (l, m, k, o, n) {
            return -o * Math.cos(m / n * (Math.PI / 2)) + o + k
        },
        easeOutSine: function (l, m, k, o, n) {
            return o * Math.sin(m / n * (Math.PI / 2)) + k
        },
        easeInOutSine: function (l, m, k, o, n) {
            return -o / 2 * (Math.cos(Math.PI * m / n) - 1) + k
        },
        easeInExpo: function (l, m, k, o, n) {
            return (m == 0) ? k : o * Math.pow(2, 10 * (m / n - 1)) + k
        },
        easeOutExpo: function (l, m, k, o, n) {
            return (m == n) ? k + o : o * (-Math.pow(2, -10 * m / n) + 1) + k
        },
        easeInOutExpo: function (l, m, k, o, n) {
            if (m == 0) {
                return k
            }
            if (m == n) {
                return k + o
            }
            if ((m /= n / 2) < 1) {
                return o / 2 * Math.pow(2, 10 * (m - 1)) + k
            }
            return o / 2 * (-Math.pow(2, -10 * --m) + 2) + k
        },
        easeInCirc: function (l, m, k, o, n) {
            return -o * (Math.sqrt(1 - (m /= n) * m) - 1) + k
        },
        easeOutCirc: function (l, m, k, o, n) {
            return o * Math.sqrt(1 - (m = m / n - 1) * m) + k
        },
        easeInOutCirc: function (l, m, k, o, n) {
            if ((m /= n / 2) < 1) {
                return -o / 2 * (Math.sqrt(1 - m * m) - 1) + k
            }
            return o / 2 * (Math.sqrt(1 - (m -= 2) * m) + 1) + k
        },
        easeInElastic: function (l, n, k, u, r) {
            var o = 1.70158;
            var q = 0;
            var m = u;
            if (n == 0) {
                return k
            }
            if ((n /= r) == 1) {
                return k + u
            }
            if (!q) {
                q = r * 0.3
            }
            if (m < Math.abs(u)) {
                m = u;
                var o = q / 4
            } else {
                var o = q / (2 * Math.PI) * Math.asin(u / m)
            }
            return -(m * Math.pow(2, 10 * (n -= 1)) * Math.sin((n * r - o) * (2 * Math.PI) / q)) + k
        },
        easeOutElastic: function (l, n, k, u, r) {
            var o = 1.70158;
            var q = 0;
            var m = u;
            if (n == 0) {
                return k
            }
            if ((n /= r) == 1) {
                return k + u
            }
            if (!q) {
                q = r * 0.3
            }
            if (m < Math.abs(u)) {
                m = u;
                var o = q / 4
            } else {
                var o = q / (2 * Math.PI) * Math.asin(u / m)
            }
            return m * Math.pow(2, -10 * n) * Math.sin((n * r - o) * (2 * Math.PI) / q) + u + k
        },
        easeInOutElastic: function (l, n, k, u, r) {
            var o = 1.70158;
            var q = 0;
            var m = u;
            if (n == 0) {
                return k
            }
            if ((n /= r / 2) == 2) {
                return k + u
            }
            if (!q) {
                q = r * (0.3 * 1.5)
            }
            if (m < Math.abs(u)) {
                m = u;
                var o = q / 4
            } else {
                var o = q / (2 * Math.PI) * Math.asin(u / m)
            }
            if (n < 1) {
                return -0.5 * (m * Math.pow(2, 10 * (n -= 1)) * Math.sin((n * r - o) * (2 * Math.PI) / q)) + k
            }
            return m * Math.pow(2, -10 * (n -= 1)) * Math.sin((n * r - o) * (2 * Math.PI) / q) * 0.5 + u + k
        },
        easeInBack: function (l, m, k, p, o, n) {
            if (n == undefined) {
                n = 1.70158
            }
            return p * (m /= o) * m * ((n + 1) * m - n) + k
        },
        easeOutBack: function (l, m, k, p, o, n) {
            if (n == undefined) {
                n = 1.70158
            }
            return p * ((m = m / o - 1) * m * ((n + 1) * m + n) + 1) + k
        },
        easeInOutBack: function (l, m, k, p, o, n) {
            if (n == undefined) {
                n = 1.70158
            }
            if ((m /= o / 2) < 1) {
                return p / 2 * (m * m * (((n *= (1.525)) + 1) * m - n)) + k
            }
            return p / 2 * ((m -= 2) * m * (((n *= (1.525)) + 1) * m + n) + 2) + k
        },
        easeInBounce: function (l, m, k, o, n) {
            return o - g.easing.easeOutBounce(l, n - m, 0, o, n) + k
        },
        easeOutBounce: function (l, m, k, o, n) {
            if ((m /= n) < (1 / 2.75)) {
                return o * (7.5625 * m * m) + k
            } else {
                if (m < (2 / 2.75)) {
                    return o * (7.5625 * (m -= (1.5 / 2.75)) * m + 0.75) + k
                } else {
                    if (m < (2.5 / 2.75)) {
                        return o * (7.5625 * (m -= (2.25 / 2.75)) * m + 0.9375) + k
                    } else {
                        return o * (7.5625 * (m -= (2.625 / 2.75)) * m + 0.984375) + k
                    }
                }
            }
        },
        easeInOutBounce: function (l, m, k, o, n) {
            if (m < n / 2) {
                return g.easing.easeInBounce(l, m * 2, 0, o, n) * 0.5 + k
            }
            return g.easing.easeOutBounce(l, m * 2 - n, 0, o, n) * 0.5 + o * 0.5 + k
        }
    })
})(jQuery);;
(function (a) {
    a.effects.blind = function (b) {
        return this.queue(function () {
            var d = a(this),
                c = ["position", "top", "left"];
            var h = a.effects.setMode(d, b.options.mode || "hide");
            var g = b.options.direction || "vertical";
            a.effects.save(d, c);
            d.show();
            var j = a.effects.createWrapper(d).css({
                overflow: "hidden"
            });
            var e = (g == "vertical") ? "height" : "width";
            var i = (g == "vertical") ? j.height() : j.width();
            if (h == "show") {
                j.css(e, 0)
            }
            var f = {};
            f[e] = h == "show" ? i : 0;
            j.animate(f, b.duration, b.options.easing, function () {
                if (h == "hide") {
                    d.hide()
                }
                a.effects.restore(d, c);
                a.effects.removeWrapper(d);
                if (b.callback) {
                    b.callback.apply(d[0], arguments)
                }
                d.dequeue()
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.bounce = function (b) {
        return this.queue(function () {
            var e = a(this),
                l = ["position", "top", "left"];
            var k = a.effects.setMode(e, b.options.mode || "effect");
            var n = b.options.direction || "up";
            var c = b.options.distance || 20;
            var d = b.options.times || 5;
            var g = b.duration || 250;
            if (/show|hide/.test(k)) {
                l.push("opacity")
            }
            a.effects.save(e, l);
            e.show();
            a.effects.createWrapper(e);
            var f = (n == "up" || n == "down") ? "top" : "left";
            var p = (n == "up" || n == "left") ? "pos" : "neg";
            var c = b.options.distance || (f == "top" ? e.outerHeight({
                margin: true
            }) / 3 : e.outerWidth({
                margin: true
            }) / 3);
            if (k == "show") {
                e.css("opacity", 0).css(f, p == "pos" ? -c : c)
            }
            if (k == "hide") {
                c = c / (d * 2)
            }
            if (k != "hide") {
                d--
            }
            if (k == "show") {
                var h = {
                    opacity: 1
                };
                h[f] = (p == "pos" ? "+=" : "-=") + c;
                e.animate(h, g / 2, b.options.easing);
                c = c / 2;
                d--
            }
            for (var j = 0; j < d; j++) {
                var o = {},
                    m = {};
                o[f] = (p == "pos" ? "-=" : "+=") + c;
                m[f] = (p == "pos" ? "+=" : "-=") + c;
                e.animate(o, g / 2, b.options.easing).animate(m, g / 2, b.options.easing);
                c = (k == "hide") ? c * 2 : c / 2
            }
            if (k == "hide") {
                var h = {
                    opacity: 0
                };
                h[f] = (p == "pos" ? "-=" : "+=") + c;
                e.animate(h, g / 2, b.options.easing, function () {
                    e.hide();
                    a.effects.restore(e, l);
                    a.effects.removeWrapper(e);
                    if (b.callback) {
                        b.callback.apply(this, arguments)
                    }
                })
            } else {
                var o = {},
                    m = {};
                o[f] = (p == "pos" ? "-=" : "+=") + c;
                m[f] = (p == "pos" ? "+=" : "-=") + c;
                e.animate(o, g / 2, b.options.easing).animate(m, g / 2, b.options.easing, function () {
                    a.effects.restore(e, l);
                    a.effects.removeWrapper(e);
                    if (b.callback) {
                        b.callback.apply(this, arguments)
                    }
                })
            }
            e.queue("fx", function () {
                e.dequeue()
            });
            e.dequeue()
        })
    }
})(jQuery);;
(function (a) {
    a.effects.clip = function (b) {
        return this.queue(function () {
            var f = a(this),
                j = ["position", "top", "left", "height", "width"];
            var i = a.effects.setMode(f, b.options.mode || "hide");
            var k = b.options.direction || "vertical";
            a.effects.save(f, j);
            f.show();
            var c = a.effects.createWrapper(f).css({
                overflow: "hidden"
            });
            var e = f[0].tagName == "IMG" ? c : f;
            var g = {
                size: (k == "vertical") ? "height" : "width",
                position: (k == "vertical") ? "top" : "left"
            };
            var d = (k == "vertical") ? e.height() : e.width();
            if (i == "show") {
                e.css(g.size, 0);
                e.css(g.position, d / 2)
            }
            var h = {};
            h[g.size] = i == "show" ? d : 0;
            h[g.position] = i == "show" ? 0 : d / 2;
            e.animate(h, {
                queue: false,
                duration: b.duration,
                easing: b.options.easing,
                complete: function () {
                    if (i == "hide") {
                        f.hide()
                    }
                    a.effects.restore(f, j);
                    a.effects.removeWrapper(f);
                    if (b.callback) {
                        b.callback.apply(f[0], arguments)
                    }
                    f.dequeue()
                }
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.drop = function (b) {
        return this.queue(function () {
            var e = a(this),
                d = ["position", "top", "left", "opacity"];
            var i = a.effects.setMode(e, b.options.mode || "hide");
            var h = b.options.direction || "left";
            a.effects.save(e, d);
            e.show();
            a.effects.createWrapper(e);
            var f = (h == "up" || h == "down") ? "top" : "left";
            var c = (h == "up" || h == "left") ? "pos" : "neg";
            var j = b.options.distance || (f == "top" ? e.outerHeight({
                margin: true
            }) / 2 : e.outerWidth({
                margin: true
            }) / 2);
            if (i == "show") {
                e.css("opacity", 0).css(f, c == "pos" ? -j : j)
            }
            var g = {
                opacity: i == "show" ? 1 : 0
            };
            g[f] = (i == "show" ? (c == "pos" ? "+=" : "-=") : (c == "pos" ? "-=" : "+=")) + j;
            e.animate(g, {
                queue: false,
                duration: b.duration,
                easing: b.options.easing,
                complete: function () {
                    if (i == "hide") {
                        e.hide()
                    }
                    a.effects.restore(e, d);
                    a.effects.removeWrapper(e);
                    if (b.callback) {
                        b.callback.apply(this, arguments)
                    }
                    e.dequeue()
                }
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.explode = function (b) {
        return this.queue(function () {
            var k = b.options.pieces ? Math.round(Math.sqrt(b.options.pieces)) : 3;
            var e = b.options.pieces ? Math.round(Math.sqrt(b.options.pieces)) : 3;
            b.options.mode = b.options.mode == "toggle" ? (a(this).is(":visible") ? "hide" : "show") : b.options.mode;
            var h = a(this).show().css("visibility", "hidden");
            var l = h.offset();
            l.top -= parseInt(h.css("marginTop"), 10) || 0;
            l.left -= parseInt(h.css("marginLeft"), 10) || 0;
            var g = h.outerWidth(true);
            var c = h.outerHeight(true);
            for (var f = 0; f < k; f++) {
                for (var d = 0; d < e; d++) {
                    h.clone().appendTo("body").wrap("<div></div>").css({
                        position: "absolute",
                        visibility: "visible",
                        left: -d * (g / e),
                        top: -f * (c / k)
                    }).parent().addClass("ui-effects-explode").css({
                        position: "absolute",
                        overflow: "hidden",
                        width: g / e,
                        height: c / k,
                        left: l.left + d * (g / e) + (b.options.mode == "show" ? (d - Math.floor(e / 2)) * (g / e) : 0),
                        top: l.top + f * (c / k) + (b.options.mode == "show" ? (f - Math.floor(k / 2)) * (c / k) : 0),
                        opacity: b.options.mode == "show" ? 0 : 1
                    }).animate({
                        left: l.left + d * (g / e) + (b.options.mode == "show" ? 0 : (d - Math.floor(e / 2)) * (g / e)),
                        top: l.top + f * (c / k) + (b.options.mode == "show" ? 0 : (f - Math.floor(k / 2)) * (c / k)),
                        opacity: b.options.mode == "show" ? 1 : 0
                    }, b.duration || 500)
                }
            }
            setTimeout(function () {
                b.options.mode == "show" ? h.css({
                    visibility: "visible"
                }) : h.css({
                    visibility: "visible"
                }).hide();
                if (b.callback) {
                    b.callback.apply(h[0])
                }
                h.dequeue();
                a("div.ui-effects-explode").remove()
            }, b.duration || 500)
        })
    }
})(jQuery);;
(function (a) {
    a.effects.fold = function (b) {
        return this.queue(function () {
            var e = a(this),
                k = ["position", "top", "left"];
            var h = a.effects.setMode(e, b.options.mode || "hide");
            var o = b.options.size || 15;
            var n = !(!b.options.horizFirst);
            var g = b.duration ? b.duration / 2 : a.fx.speeds._default / 2;
            a.effects.save(e, k);
            e.show();
            var d = a.effects.createWrapper(e).css({
                overflow: "hidden"
            });
            var i = ((h == "show") != n);
            var f = i ? ["width", "height"] : ["height", "width"];
            var c = i ? [d.width(), d.height()] : [d.height(), d.width()];
            var j = /([0-9]+)%/.exec(o);
            if (j) {
                o = parseInt(j[1], 10) / 100 * c[h == "hide" ? 0 : 1]
            }
            if (h == "show") {
                d.css(n ? {
                    height: 0,
                    width: o
                } : {
                    height: o,
                    width: 0
                })
            }
            var m = {},
                l = {};
            m[f[0]] = h == "show" ? c[0] : o;
            l[f[1]] = h == "show" ? c[1] : 0;
            d.animate(m, g, b.options.easing).animate(l, g, b.options.easing, function () {
                if (h == "hide") {
                    e.hide()
                }
                a.effects.restore(e, k);
                a.effects.removeWrapper(e);
                if (b.callback) {
                    b.callback.apply(e[0], arguments)
                }
                e.dequeue()
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.highlight = function (b) {
        return this.queue(function () {
            var d = a(this),
                c = ["backgroundImage", "backgroundColor", "opacity"],
                f = a.effects.setMode(d, b.options.mode || "show"),
                e = {
                    backgroundColor: d.css("backgroundColor")
                };
            if (f == "hide") {
                e.opacity = 0
            }
            a.effects.save(d, c);
            d.show().css({
                backgroundImage: "none",
                backgroundColor: b.options.color || "#ffff99"
            }).animate(e, {
                queue: false,
                duration: b.duration,
                easing: b.options.easing,
                complete: function () {
                    (f == "hide" && d.hide());
                    a.effects.restore(d, c);
                    (f == "show" && !a.support.opacity && this.style.removeAttribute("filter"));
                    (b.callback && b.callback.apply(this, arguments));
                    d.dequeue()
                }
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.pulsate = function (b) {
        return this.queue(function () {
            var d = a(this),
                e = a.effects.setMode(d, b.options.mode || "show");
            times = ((b.options.times || 5) * 2) - 1;
            duration = b.duration ? b.duration / 2 : a.fx.speeds._default / 2, isVisible = d.is(":visible"), animateTo = 0;
            if (!isVisible) {
                d.css("opacity", 0).show();
                animateTo = 1
            }
            if ((e == "hide" && isVisible) || (e == "show" && !isVisible)) {
                times--
            }
            for (var c = 0; c < times; c++) {
                d.animate({
                    opacity: animateTo
                }, duration, b.options.easing);
                animateTo = (animateTo + 1) % 2
            }
            d.animate({
                opacity: animateTo
            }, duration, b.options.easing, function () {
                if (animateTo == 0) {
                    d.hide()
                }(b.callback && b.callback.apply(this, arguments))
            });
            d.queue("fx", function () {
                d.dequeue()
            }).dequeue()
        })
    }
})(jQuery);;
(function (a) {
    a.effects.puff = function (b) {
        return this.queue(function () {
            var f = a(this),
                g = a.effects.setMode(f, b.options.mode || "hide"),
                e = parseInt(b.options.percent, 10) || 150,
                d = e / 100,
                c = {
                    height: f.height(),
                    width: f.width()
                };
            a.extend(b.options, {
                fade: true,
                mode: g,
                percent: g == "hide" ? e : 100,
                from: g == "hide" ? c : {
                    height: c.height * d,
                    width: c.width * d
                }
            });
            f.effect("scale", b.options, b.duration, b.callback);
            f.dequeue()
        })
    };
    a.effects.scale = function (b) {
        return this.queue(function () {
            var g = a(this);
            var d = a.extend(true, {}, b.options);
            var j = a.effects.setMode(g, b.options.mode || "effect");
            var h = parseInt(b.options.percent, 10) || (parseInt(b.options.percent, 10) == 0 ? 0 : (j == "hide" ? 0 : 100));
            var i = b.options.direction || "both";
            var c = b.options.origin;
            if (j != "effect") {
                d.origin = c || ["middle", "center"];
                d.restore = true
            }
            var f = {
                height: g.height(),
                width: g.width()
            };
            g.from = b.options.from || (j == "show" ? {
                height: 0,
                width: 0
            } : f);
            var e = {
                y: i != "horizontal" ? (h / 100) : 1,
                x: i != "vertical" ? (h / 100) : 1
            };
            g.to = {
                height: f.height * e.y,
                width: f.width * e.x
            };
            if (b.options.fade) {
                if (j == "show") {
                    g.from.opacity = 0;
                    g.to.opacity = 1
                }
                if (j == "hide") {
                    g.from.opacity = 1;
                    g.to.opacity = 0
                }
            }
            d.from = g.from;
            d.to = g.to;
            d.mode = j;
            g.effect("size", d, b.duration, b.callback);
            g.dequeue()
        })
    };
    a.effects.size = function (b) {
        return this.queue(function () {
            var c = a(this),
                n = ["position", "top", "left", "width", "height", "overflow", "opacity"];
            var m = ["position", "top", "left", "overflow", "opacity"];
            var j = ["width", "height", "overflow"];
            var p = ["fontSize"];
            var k = ["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"];
            var f = ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"];
            var g = a.effects.setMode(c, b.options.mode || "effect");
            var i = b.options.restore || false;
            var e = b.options.scale || "both";
            var o = b.options.origin;
            var d = {
                height: c.height(),
                width: c.width()
            };
            c.from = b.options.from || d;
            c.to = b.options.to || d;
            if (o) {
                var h = a.effects.getBaseline(o, d);
                c.from.top = (d.height - c.from.height) * h.y;
                c.from.left = (d.width - c.from.width) * h.x;
                c.to.top = (d.height - c.to.height) * h.y;
                c.to.left = (d.width - c.to.width) * h.x
            }
            var l = {
                from: {
                    y: c.from.height / d.height,
                    x: c.from.width / d.width
                },
                to: {
                    y: c.to.height / d.height,
                    x: c.to.width / d.width
                }
            };
            if (e == "box" || e == "both") {
                if (l.from.y != l.to.y) {
                    n = n.concat(k);
                    c.from = a.effects.setTransition(c, k, l.from.y, c.from);
                    c.to = a.effects.setTransition(c, k, l.to.y, c.to)
                }
                if (l.from.x != l.to.x) {
                    n = n.concat(f);
                    c.from = a.effects.setTransition(c, f, l.from.x, c.from);
                    c.to = a.effects.setTransition(c, f, l.to.x, c.to)
                }
            }
            if (e == "content" || e == "both") {
                if (l.from.y != l.to.y) {
                    n = n.concat(p);
                    c.from = a.effects.setTransition(c, p, l.from.y, c.from);
                    c.to = a.effects.setTransition(c, p, l.to.y, c.to)
                }
            }
            a.effects.save(c, i ? n : m);
            c.show();
            a.effects.createWrapper(c);
            c.css("overflow", "hidden").css(c.from);
            if (e == "content" || e == "both") {
                k = k.concat(["marginTop", "marginBottom"]).concat(p);
                f = f.concat(["marginLeft", "marginRight"]);
                j = n.concat(k).concat(f);
                c.find("*[width]").each(function () {
                    child = a(this);
                    if (i) {
                        a.effects.save(child, j)
                    }
                    var q = {
                        height: child.height(),
                        width: child.width()
                    };
                    child.from = {
                        height: q.height * l.from.y,
                        width: q.width * l.from.x
                    };
                    child.to = {
                        height: q.height * l.to.y,
                        width: q.width * l.to.x
                    };
                    if (l.from.y != l.to.y) {
                        child.from = a.effects.setTransition(child, k, l.from.y, child.from);
                        child.to = a.effects.setTransition(child, k, l.to.y, child.to)
                    }
                    if (l.from.x != l.to.x) {
                        child.from = a.effects.setTransition(child, f, l.from.x, child.from);
                        child.to = a.effects.setTransition(child, f, l.to.x, child.to)
                    }
                    child.css(child.from);
                    child.animate(child.to, b.duration, b.options.easing, function () {
                        if (i) {
                            a.effects.restore(child, j)
                        }
                    })
                })
            }
            c.animate(c.to, {
                queue: false,
                duration: b.duration,
                easing: b.options.easing,
                complete: function () {
                    if (c.to.opacity === 0) {
                        c.css("opacity", c.from.opacity)
                    }
                    if (g == "hide") {
                        c.hide()
                    }
                    a.effects.restore(c, i ? n : m);
                    a.effects.removeWrapper(c);
                    if (b.callback) {
                        b.callback.apply(this, arguments)
                    }
                    c.dequeue()
                }
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.shake = function (b) {
        return this.queue(function () {
            var e = a(this),
                l = ["position", "top", "left"];
            var k = a.effects.setMode(e, b.options.mode || "effect");
            var n = b.options.direction || "left";
            var c = b.options.distance || 20;
            var d = b.options.times || 3;
            var g = b.duration || b.options.duration || 140;
            a.effects.save(e, l);
            e.show();
            a.effects.createWrapper(e);
            var f = (n == "up" || n == "down") ? "top" : "left";
            var p = (n == "up" || n == "left") ? "pos" : "neg";
            var h = {},
                o = {},
                m = {};
            h[f] = (p == "pos" ? "-=" : "+=") + c;
            o[f] = (p == "pos" ? "+=" : "-=") + c * 2;
            m[f] = (p == "pos" ? "-=" : "+=") + c * 2;
            e.animate(h, g, b.options.easing);
            for (var j = 1; j < d; j++) {
                e.animate(o, g, b.options.easing).animate(m, g, b.options.easing)
            }
            e.animate(o, g, b.options.easing).animate(h, g / 2, b.options.easing, function () {
                a.effects.restore(e, l);
                a.effects.removeWrapper(e);
                if (b.callback) {
                    b.callback.apply(this, arguments)
                }
            });
            e.queue("fx", function () {
                e.dequeue()
            });
            e.dequeue()
        })
    }
})(jQuery);;
(function (a) {
    a.effects.slide = function (b) {
        return this.queue(function () {
            var e = a(this),
                d = ["position", "top", "left"];
            var i = a.effects.setMode(e, b.options.mode || "show");
            var h = b.options.direction || "left";
            a.effects.save(e, d);
            e.show();
            a.effects.createWrapper(e).css({
                overflow: "hidden"
            });
            var f = (h == "up" || h == "down") ? "top" : "left";
            var c = (h == "up" || h == "left") ? "pos" : "neg";
            var j = b.options.distance || (f == "top" ? e.outerHeight({
                margin: true
            }) : e.outerWidth({
                margin: true
            }));
            if (i == "show") {
                e.css(f, c == "pos" ? -j : j)
            }
            var g = {};
            g[f] = (i == "show" ? (c == "pos" ? "+=" : "-=") : (c == "pos" ? "-=" : "+=")) + j;
            e.animate(g, {
                queue: false,
                duration: b.duration,
                easing: b.options.easing,
                complete: function () {
                    if (i == "hide") {
                        e.hide()
                    }
                    a.effects.restore(e, d);
                    a.effects.removeWrapper(e);
                    if (b.callback) {
                        b.callback.apply(this, arguments)
                    }
                    e.dequeue()
                }
            })
        })
    }
})(jQuery);;
(function (a) {
    a.effects.transfer = function (b) {
        return this.queue(function () {
            var f = a(this),
                h = a(b.options.to),
                e = h.offset(),
                g = {
                    top: e.top,
                    left: e.left,
                    height: h.innerHeight(),
                    width: h.innerWidth()
                },
                d = f.offset(),
                c = a('<div class="ui-effects-transfer"></div>').appendTo(document.body).addClass(b.options.className).css({
                    top: d.top,
                    left: d.left,
                    height: f.innerHeight(),
                    width: f.innerWidth(),
                    position: "absolute"
                }).animate(g, b.duration, b.options.easing, function () {
                    c.remove();
                    (b.callback && b.callback.apply(f[0], arguments));
                    f.dequeue()
                })
        })
    }
})(jQuery);;

function ngettext(s, p, n) {
    return (n == 1) ? s : (p instanceof Array) ? p[0] : p;
}

var Timestamp = {
    server: function () {
        try {
            return Game.server_time;
        } catch (e) {}
    },
    client: function () {
        return Timestamp.make();
    },
    clientServerDiff: function () {
        return Timestamp.client() - Timestamp.server();
    },
    now: function (which) {
        switch (which) {
        case 'server':
        case 's':
            return Timestamp.server();
        case 'client':
        case 'c':
        default:
            return Timestamp.client();
        }
    },
    serverGMTOffset: function () {
        var o = Game.server_gmt_offset;
        o = parseInt(o);
        return o;
    },
    clientGMTOffset: function () {
        var o = new Date();
        o = -1 * o.getTimezoneOffset() * 60;
        return o;
    },
    updateServerTime: function (date) {
        try {
            var ts = Timestamp.make(date);
            Game.server_time = ts;
        } catch (e) {}
    },
    make: function (d) {
        d = (undefined === d) ? new Date() : new Date(d);
        return d.getTime() / 1000;
    },
    toDate: function (ts) {
        return new Date(ts * 1000);
    }
};

var Ajax = {};
Ajax.request_running = {};
Ajax.get = function (controller, action, params, callbackSuccess, options, lock, show_ajax_loader) {
    Ajax.ajax(controller, action, params, callbackSuccess, options, "GET", lock, show_ajax_loader, "json");
}
Ajax.post = function (controller, action, params, callbackSuccess, options, lock, show_ajax_loader) {
    Ajax.ajax(controller, action, params, callbackSuccess, options, "POST", lock, show_ajax_loader, "json");
}
Ajax.postEx = function (controller, action, params, responseType, callbackSuccess, options, lock, show_ajax_loader) {
    Ajax.ajax(controller, action, params, callbackSuccess, options, "POST", lock, show_ajax_loader, responseType);
}
Ajax.getEx = function (controller, action, params, responseType, callbackSuccess, options, lock, show_ajax_loader) {
    Ajax.ajax(controller, action, params, callbackSuccess, options, "GET", lock, show_ajax_loader, responseType);
}
Ajax.ajax = function (controller, action, params, callbackSuccess, options, type, lock, show_ajax_loader, responseType) {
    if (typeof show_ajax_loader == 'undefined') {
        show_ajax_loader = true;
    }
    if (typeof lock != 'undefined' && Ajax.request_running[lock]) {
        return;
    }
    Ajax.request_running[lock] = true;
    var u = url(controller, action);
    var data = {
        json: $.toJSON(params)
    };
    if (show_ajax_loader) {
        Layout.showAjaxLoader();
    }
    options = jQuery.extend({
        url: u,
        type: type,
        data: data,
        dataType: responseType,
        success: function (data, flag) {
            if (show_ajax_loader) {
                Layout.hideAjaxLoader();
            }
            Ajax.request_running[lock] = false;
            callbackSuccess.call(this, data, flag);
        },
        error: function () {
            if (show_ajax_loader) {
                Layout.hideAjaxLoader();
            }
            Ajax.request_running[lock] = false;
        }
    }, options);
    jQuery.ajaxSetup({
        'cache': false
    });
    jQuery.ajax(options);
}

jQuery.fn.extend({
    unselectable: function () {
        this.css("-moz-user-select", 'none');
        this.css("unselectable", 'yes');
    }
});
jQuery.blocker = function (options) {
    var settings = jQuery.extend({
        id: '',
        caching: options.id,
        html: 'f00',
        success: '',
        onSuccess: function () {},
        cancel: '',
        onCancel: function () {},
        callback: void(0)
    }, options);
    var elm = window.blkelm ||
    function () {
        var str_list = ['top', 'bottom', 'left', 'right', 'content'];
        elm = window.blkelm = {
            box: $('<div id="blockbox"></div>'),
            bg: $('<div id="blockbox_bg"></div>'),
            body: $('body')
        };
        for (var i in str_list) {
            elm.box[0].innerHTML += '<div id="block_' + str_list[i] + '"></div>';
        }
        elm.content = elm.box.find('#block_content');
        return elm;
    }.call(this);
    this.blocker.block = function () {
        var tmp = settings.html.parent();
        elm.original_parent = tmp.length ? tmp : $('body');
        elm.html = settings.html.detach();
        elm.content.append(elm.html.show());
        elm.box.appendTo(elm.body).fadeIn();
        elm.bg.appendTo(elm.body).fadeTo(400, 0.5);
    };
    this.blocker.handleEvents = function () {
        elm.bg.bind('click.block', function () {
            jQuery.blocker.unblock()
        });
        $(settings.success).unbind('click').click(function () {
            settings.onSuccess();
            jQuery.blocker.unblock();
        });
        $(settings.cancel).unbind('click').click(function () {
            settings.onCancel();
            jQuery.blocker.unblock();
        });
    };
    this.blocker.unblock = function () {
        elm.box.hide().detach();
        elm.bg.hide().detach();
        elm.html.appendTo(elm.original_parent).hide();
        if (settings.callback && typeof settings.callback === 'function') {
            settings.callback();
        }
    };
    this.blocker.block();
    this.blocker.handleEvents();
};
Function.prototype.bind = function (obj) {
    var that = this;
    return function () {
        return that.apply(obj, arguments);
    }
}

function buildLink(controller, parameters) {
    var params = [];
    for (key in parameters) {
        params.push(key + "=" + escape(parameters[key]));
    }
    if (typeof(parameters['action']) !== undefined) {
        params.push("h=" + encodeURIComponent(Game.csrfToken));
    }
    return '/game/' + controller + '?' + params.join("&");
}

function url(controller, action, parameters) {
    if (controller && controller.substr(0, 1) == "/") {
        return controller;
    }
    controller = controller || Game.controller;
    parameters = parameters || {};
    if (action != undefined && action != '') {
        parameters['action'] = action;
    }
    parameters['town_id'] = parameters['town_id'] || Game.townId;
    return buildLink(controller, parameters);
}

function submit_form(form, controller, action, parameters) {
    parameters = parameters || {};
    if (action != undefined && action != '') {
        parameters['action'] = action;
    }
    parameters['town_id'] = parameters['town_id'] || Game.townId;
    document.getElementById(form).setAttribute('action', buildLink(controller, parameters));
    $("#" + form).submit();
    return false;
}

function submit_form_light(form) {
    $("#" + form).submit();
    return false;
}

function submit_post(controller, action, post_params) {
    post_params = post_params || {};
    var form = $('<form id="temp_submit_form" method="POST" action="?"></form>');
    $.each(post_params, function (name, value) {
        form.append('<input type="hidden" name="' + name + '" value="' + value + '"/>');
    });
    $('body').append(form);
    submit_form('temp_submit_form', controller, action);
    return false;
}

function readableSeconds(seconds) {
    var hours, minutes;
    hours = parseInt(seconds / 3600);
    minutes = parseInt((seconds - (hours * 3600)) / 60)
    seconds = parseInt(seconds % 60);

    function zerofill(n, len) {
        if (typeof(len) == 'undefined') {
            len = 2;
        }
        n = n + '';
        while (n.length < len) {
            n = '0' + n;
        }
        return n;
    }
    return hours + ':' + zerofill(minutes) + ':' + zerofill(seconds);
}

function readableDate(date, utc) {
    var hours, minutes, seconds;
    if (utc != undefined && utc != '') {
        hours = date.getUTCHours();
        minutes = date.getUTCMinutes();
        seconds = date.getUTCSeconds();
    } else {
        hours = date.getHours();
        minutes = date.getMinutes();
        seconds = date.getSeconds();
    }
    if (minutes < 10) {
        minutes = '0' + minutes;
    }
    if (seconds < 10) {
        seconds = '0' + seconds;
    }
    return hours + ':' + minutes + ':' + seconds;
}

function _(s) {
    return s;
}

function s(text) {
    for (var i = 1; i < arguments.length; i++) {
        text = text.split('%' + i).join(arguments[i]);
    }
    return text;
}

function bound(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
var httpDataOld = jQuery.httpData;
jQuery.httpData = function (xhr, type, s) {
    try {
        Timestamp.updateServerTime(new Date(xhr.getResponseHeader('date')));
        var data = httpDataOld.call(jQuery, xhr, type, s);
    } catch (e) {
        console.error(xhr.responseText);
        HumanMessage.error("Invalid response");
    }
    if (data.error) {
        HumanMessage.error(data.error);
        throw "parseerror";
    }
    if (data.success) HumanMessage.success(data.success);
    if (data.bar) Layout.updateBar(data.bar);
    if (data.content) $('#content').html(data.content);
    return data;
};

function debug(whatever) {
    try {
        console.debug(whatever);
    } catch (x) {
        try {
            opera.postError(whatever);
        } catch (x) {
            if ('object' == typeof(whatever)) {
                var s = '';
                for (var i in whatever) {
                    s += i + ': ' + whatever[i] + "\n";
                }
                alert(s);
            } else {
                alert(whatever);
            }
        };
    };
}
jQuery.cookie = function (name, value, options) {
    if (typeof value != 'undefined') {
        options = options || {};
        if (value === null) {
            value = '';
            options.expires = -1;
        }
        var expires = '';
        if (options.expires && (typeof options.expires == 'number' || options.expires.toUTCString)) {
            var date;
            if (typeof options.expires == 'number') {
                date = new Date();
                date.setTime(date.getTime() + (options.expires * 24 * 60 * 60 * 1000));
            } else {
                date = options.expires;
            }
            expires = '; expires=' + date.toUTCString();
        }
        var path = options.path ? '; path=' + (options.path) : '';
        var domain = options.domain ? '; domain=' + (options.domain) : '';
        var secure = options.secure ? '; secure' : '';
        document.cookie = [name, '=', encodeURIComponent(value), expires, path, domain, secure].join('');
    } else {
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = jQuery.trim(cookies[i]);
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
};
String.prototype.strip = function () {
    return this.replace(/<(.|\n)*?>/g, '');
};
String.prototype.isLTE = function (y) {
    var x = this;
    var x_m = x.match(/\s.\d+|^\d+/);
    var y_m = y.match(/\s.\d+|^\d+/);
    var x_i = x_m != null ? parseInt(x_m.shift()) : NaN;
    var y_i = y_m != null ? parseInt(y_m.shift()) : NaN;
    if (isNaN(x_i) || isNaN(y_i)) {
        x = x.toLowerCase();
        y = y.toLowerCase();
    } else {
        x = x_i;
        y = y_i;
    }
    return x <= y;
};
Date.prototype.toShortString = function () {
    var h, m, d, mn;
    h = ((h = this.getHours()) < 10 ? '0' + h : h);
    m = ((m = this.getMinutes()) < 10 ? '0' + m : m);
    d = ((d = this.getDate()) < 10 ? '0' + d : d);
    mn = ((mn = this.getMonth() + 1) < 10 ? '0' + mn : mn);
    return (h + ':' + m + ' ' + d + '/' + mn + '/' + this.getFullYear());
};
jQuery.extend(jQuery.easing, {
    bounce: function (x, t, b, c, d) {
        if ((t /= d) < (1 / 2.75)) {
            return c * (7.5625 * t * t) + b;
        } else if (t < (2 / 2.75)) {
            return c * (7.5625 * (t -= (1.5 / 2.75)) * t + .75) + b;
        } else if (t < (2.5 / 2.75)) {
            return c * (7.5625 * (t -= (2.25 / 2.75)) * t + .9375) + b;
        } else {
            return c * (7.5625 * (t -= (2.625 / 2.75)) * t + .984375) + b;
        }
    }
});

jQuery.fn.countdown = function (until, options) {
    this.countdownAddElement(this);
    options = jQuery.extend({
        delayTick: false
    }, options);
    var csdiff = Timestamp.clientServerDiff();
    var tick = function () {
        var diff = until - Timestamp.now() + csdiff,
            seconds = Math.round(diff);
        var elements = this.data('countdown.elements');
        for (i in elements) {
            elements[i].html(readableSeconds(Math.max(seconds, 0)));
        }
        if (diff < 0) {
            window.clearInterval(interval);
            this.trigger('finish');
            return;
        }
        if (!elements || elements.length == 0) {
            window.clearInterval(interval);
        }
        this.trigger('tick', diff);
    };
    var interval = window.setInterval(tick.bind(this), options.interval ? options.interval : 500);
    if (!options.delayTick) {
        tick.apply(this);
    };
    return this;
};
jQuery.fn.countdownAddElement = function (elm) {
    var list = this.data('countdown.elements');
    if (undefined == list) {
        list = new Array();
    }
    list.push($(elm));
    this.data('countdown.elements', list);
    return this;
}

function fastXyHash() {
    this.obj = {};
}
fastXyHash.prototype.setByXy = function (x, y, value) {
    if (this.obj[x] === undefined) {
        this.obj[x] = {};
    }
    this.obj[x][y] = value;
};
fastXyHash.prototype.getByXy = function (x, y) {
    if (this.obj[x] === undefined || this.obj[x][y] === undefined) {
        return undefined;
    }
    return this.obj[x][y];
};
fastXyHash.prototype.getObj = function () {
    return this.obj;
};
fastXyHash.prototype.clean = function () {
    delete this.obj;
    this.obj = {};
};
fastXyHash.prototype.each = function (fn) {
    for (var x in this.obj) {
        for (var y in this.obj[x]) {
            var tmp = fn(this.obj[x][y]);
            if (tmp !== undefined) {
                this.obj[x][y] = tmp;
            }
        }
    }
};
fastXyHash.prototype.remove = function (x, y) {
    delete this.obj[x][y];
};

var HumanMessage = {
    initialize: function () {
        HumanMessage.msgID = 'human_message';
        HumanMessage.msgOpacity = 1;
        $('body').append('<div id="' + HumanMessage.msgID + '" class="human_message"></div>');
        HumanMessage.msgObj = $('#' + HumanMessage.msgID);
    },
    error: function (message) {
        HumanMessage.display(message, 'human_message_error');
    },
    success: function (message) {
        HumanMessage.display(message, 'human_message_success');
    },
    display: function (msg, className) {
        if (!HumanMessage.msgObj) {
            HumanMessage.initialize();
        }
        HumanMessage.remove(null, true);
        HumanMessage.msgObj.attr('class', '');
        HumanMessage.msgObj.addClass('human_message');
        HumanMessage.msgObj.addClass(className);
        HumanMessage.msgObj.stop(true, true);
        clearTimeout(HumanMessage.t1);
        HumanMessage.mouseCoord = null;
        HumanMessage.msgObj.html(msg);
        clearTimeout(HumanMessage.iid);
        HumanMessage.iid = setTimeout(function () {
            var visibleMsgObj = $('#' + HumanMessage.msgID + ':visible');
            if (visibleMsgObj.length) {
                HumanMessage.onMessageDisappeared();
            }
        }, 5000);
        HumanMessage.msgObj.show().animate({
            'opacity': 1
        }, 200, HumanMessage.onMessageVisible);
    },
    onMessageVisible: function () {
        HumanMessage.t1 = setTimeout(HumanMessage.remove, 4000);
        HumanMessage.bindEvents();
    },
    bindEvents: function () {
        $(window).mousemove(HumanMessage.onMousemove).click(HumanMessage.remove).keypress(HumanMessage.remove);
    },
    onMousemove: function (event) {
        if (HumanMessage.mouseCoord === null) {
            HumanMessage.mouseCoord = {
                'x': event.clientX,
                'y': event.clientY
            };
        }
        var dx = event.clientX - HumanMessage.mouseCoord.x,
            dy = event.clientY - HumanMessage.mouseCoord.y;
        if (dx * dx + dy * dy > 30 * 30) {
            HumanMessage.remove();
        }
    },
    stop: function () {
        HumanMessage.msgObj.stop(true, true);
        clearTimeout(HumanMessage.t1);
        $(window).unbind('mousemove', HumanMessage.onMousemove).unbind('click', HumanMessage.remove).unbind('keypress', HumanMessage.remove);
    },
    remove: function (evt, immediately) {
        immediately = immediately || false;
        HumanMessage.stop();
        if (immediately) {
            HumanMessage.onMessageDisappeared();
        } else {
            HumanMessage.msgObj.animate({
                'opacity': 0
            }, 500, HumanMessage.onMessageDisappeared);
        }
    },
    onMessageDisappeared: function () {
        HumanMessage.msgObj.hide();
    }
};

jQuery.fn.extend({
    mousePopup: function (popup) {
        popup.bindTo(this);
    }
});
var MousePopup = function () {
    this.initialize.apply(this, arguments);
};
jQuery.extend(MousePopup.prototype, {
    active: null,
    initialize: function (xhtml, styles) {
        if ((typeof xhtml) == 'function') {
            this.xhtml = xhtml.call();
        } else {
            this.xhtml = xhtml;
        }
        this.styles = styles || {};
        this.enabled = true;
        this.popup_delay = 100;
    },
    position: function () {
        var
        pos = {
            'left': this.cur_x,
            'top': this.cur_y
        },
            offset = {
                'left': 10,
                'top': 10
            },
            scroll = {
                'left': $(document).scrollLeft(),
                'top': $(document).scrollTop()
            },
            viewport = {
                'width': $(window).width(),
                'height': $(window).height()
            },
            popup = {
                'width': $('#popup_div').width(),
                'height': $('#popup_div').height()
            };
        var pair = {
            'left': 'width',
            'top': 'height'
        };
        for (var p in pair) {
            if ((pos[p] + popup[pair[p]] + offset[p]) > viewport[pair[p]]) {
                pos[p] = pos[p] - popup[pair[p]] - offset[p] + scroll[p];
            } else {
                pos[p] = pos[p] + offset[p] + scroll[p];
            }
        }
        pos.left = Math.max(pos.left, scroll.left) + 'px';
        pos.top = Math.max(pos.top, scroll.top) + 'px';
        return pos;
    },
    handlerMove: function (ev) {
        this.cur_x = ev.clientX;
        this.cur_y = ev.clientY;
        var position = this.position();
        $('#popup_div').css(position);
    },
    handlerOver: function (ev) {
        this.cur_x = ev.clientX;
        this.cur_y = ev.clientY;
        this.showDiv();
        var position = this.position();
        $('#popup_div').css(position);
    },
    handlerOut: function (ev) {
        if (jQuery.browser.msie) {
            $('#popup_div').animate({
                'foo': 'bar'
            }, {
                'duration': 100,
                'complete': this.onOutAnimationComplete.bind(this)
            });
        } else {
            $('#popup_div').animate({
                'opacity': '0'
            }, {
                'duration': 250,
                'complete': this.onOutAnimationComplete.bind(this)
            });
        }
    },
    onOutAnimationComplete: function () {
        $('#popup_div').hide();
        $('#popup_div').clearQueue();
        this.active = null;
    },
    showDiv: function () {
        $('#popup_content').html(this.xhtml);
        var popup_div = $('#popup_div'),
            basic_styles = {
                'position': 'absolute',
                'display': 'block',
                'z-index': 100
            },
            position = this.position();
        styles = jQuery.merge(basic_styles, position, this.styles);
        if (!jQuery.browser.msie) {
            styles = jQuery.extend(styles, {
                'opacity': 1
            });
        }
        popup_div.css(styles);
        popup_div.stop(true);
        popup_div.show();
        this.active = this;
    },
    bindTo: function (el) {
        var popup_div = $('#popup_div');
        popup_div.unbind('mouseover');
        popup_div.unbind('mouseleave');
        popup_div.bind('mouseover', this.handlerMove.bind(this));
        popup_div.bind('mouseleave', this.onOutAnimationComplete.bind(this));
        var el = $(el);
        el.unbind('mouseenter');
        el.unbind('mousemove');
        el.unbind('mouseleave');
        el.bind('mouseenter', this.handlerOver.bind(this));
        el.bind('mousemove', this.handlerMove.bind(this));
        el.bind('mouseleave', this.handlerOut.bind(this));
    },
    disable: function () {
        this.enabled = false;
        $('#popup_div').hide();
    },
    enable: function () {
        this.enabled = true;
    }
});

function Slider(options) {
    var ffwd = false;
    this._elementMin = options.elementMin || null;
    this._elementMax = options.elementMax || null;
    this._elementDown = options.elementDown || null;
    this._elementUp = options.elementUp || null;
    this._elementInput = options.elementInput;
    this._elementSlider = options.elementSlider;
    this._orientation = options.orientation || 'horizontal';
    this._max_overwrite = options.max_overwrite || false;
    this._callback = options.callback ||
    function () {};
    if (options.elementDownFast && options.elementUpFast) {
        this._elementDownFast = options.elementDownFast;
        this._elementUpFast = options.elementUpFast;
        ffwd = true;
    }
    this._min = options.min || 0;
    this._max = options.max || 100;
    this._value = options.value || this._min;
    this._step = options.step || 1;
    this._elementSlider.slider({
        'animate': true,
        'orientation': this._orientation,
        'min': this._min,
        'max': this._max,
        'value': this._value,
        'step': this._step
    });
    var sliderChange = (function (event, ui) {
        this.setValue(ui.value);
        this._callback();
    }).bind(this);
    this._elementSlider.bind('slide', sliderChange);
    if (this._elementMin != null && this._elementMax != null) {
        this._elementMin.click((function () {
            this.setValue(this.getMin());
        }).bind(this));
        this._elementMax.click((function () {
            this.setValue(this.getMax());
        }).bind(this));
    }
    if (this._elementDown && this._elementUp) {
        this._elementDown.click((function () {
            this.setValue(this.getValue() - this._step);
            this._elementInput.change();
        }).bind(this));
        this._elementUp.click((function () {
            this.setValue(this.getValue() + this._step);
            this._elementInput.change();
        }).bind(this));
    }
    if (ffwd) {
        this._elementDownFast.click((function () {
            this.setValue(this.getValue() - 100 * this._step);
        }).bind(this));
        this._elementUpFast.click((function () {
            this.setValue(this.getValue() + 100 * this._step);
        }).bind(this));
    }
    this._elementInput.bind('change', {
        self: this
    }, function (e) {
        e.data.self.setValue(this.value)
    });
    this._elementInput.focus(function () {
        this.select();
    });
}
Slider.prototype = new jQuery();
Slider.prototype.getValue = function () {
    return this._value;
}
Slider.prototype.setValue = function (value) {
    value = ~~this._step != this._step ? ~~ (value * 10) / 10 : parseInt(value);
    if (isNaN(value)) {
        return;
    }
    if (!this._max_overwrite) {
        value = Math.max(this._min, value);
        value = Math.min(this._max, value);
    } else {
        this.setMax(Math.max(this._max, value));
        value = Math.max(this._min, value);
    }
    this._value = value;
    this._elementInput[0].value = value;
    this._elementSlider.slider('value', value);
    this._elementSlider.trigger('change');
}
Slider.prototype.setMin = function (min) {
    this._min = min;
    if (this._elementMin) {
        this._elementMin.text(min);
    }
    this._elementSlider.slider('option', 'min', min);
}
Slider.prototype.getMin = function (value) {
    return this._min;
}
Slider.prototype.setMax = function (max) {
    this._max = max;
    if (this._elementMax) {
        this._elementMax.text(max);
    }
    this._elementSlider.slider('option', 'max', max);
}
Slider.prototype.getMax = function () {
    return this._max;
}
Slider.prototype.disable = function (param) {
    if (typeof param !== 'boolean') return;
    this._elementSlider.slider('option', 'disabled', param);
}

function Dialog(options) {
    this.options = options;
    this.parent = null;
}
Dialog.prototype.close = function () {
    $('#confirm_dialog').hide();
    $('#confirm_dialog').appendTo(this.parent);
    this.parent = null;
    return false;
}
Dialog.prototype.open = function () {
    if (!$('#confirm_dialog')) {
        alert('Dialog template is missing!');
    }
    if (this.parent) {
        return;
    }
    this.parent = $('#confirm_dialog').parent();
    $('#confirm_dialog_title').text(this.options.title);
    $('#confirm_dialog_text').text(this.options.text);
    var button_yes = $($('#confirm_dialog a')[0]);
    button_yes.unbind('click');
    button_yes.click(this.options.button_yes.callback_function);
    button_yes.find('.middle').text(this.options.button_yes.title);
    var button_no = $($('#confirm_dialog a')[1]);
    button_no.unbind('click');
    button_no.click(this.options.button_no.callback_function);
    button_no.find('.middle').text(this.options.button_no.title);
    $('#confirm_dialog').appendTo('#content').show();
}

function Dialog2(options) {
    this.options = options;
    this.parent = null;
}
Dialog2.prototype.close = function () {
    $('#calendar_dialog').hide();
    $('#calendar_dialog').appendTo(this.parent);
    this.parent = null;
    return false;
}
Dialog2.prototype.open = function () {
    if (!$('#calendar_dialog')) {
        alert('Dialog template is missing!');
    }
    if (this.parent) {
        return;
    }
    this.parent = $('#calendar_dialog').parent();
    $('#calendar_dialog_title').text(this.options.title);
    $('#calendar_dialog_text').html(this.options.text);
    if (this.options.screenshot) {
        var screenshot = $($('#calendar_dialog a')[0]);
        screenshot.unbind('click');
        screenshot.click(this.options.button_yes.callback_function);
        var button_yes = $($('#calendar_dialog a')[1]);
        button_yes.unbind('click');
        button_yes.click(this.close);
        button_yes.find('.middle').text('OK');
        $($('#calendar_dialog a')[2]).remove();
    } else {
        var button_yes = $($('#calendar_dialog a')[0]);
        button_yes.unbind('click');
        button_yes.click(this.options.button_yes.callback_function);
        button_yes.find('.middle').text(this.options.button_yes.title);
        var button_no = $($('#calendar_dialog a')[1]);
        button_no.unbind('click');
        button_no.click(this.options.button_no.callback_function);
        button_no.find('.middle').text(this.options.button_no.title);
    }
    $('#calendar_dialog').appendTo('#content').show();
}

function Dialog3(options) {
    this.options = options;
    this.parent = null;
}
Dialog3.prototype.close = function () {
    $('#calendar_dialog2').hide();
    $('#calendar_dialog2').appendTo(this.parent);
    this.parent = null;
    return false;
}
Dialog3.prototype.open = function () {
    if (!$('#calendar_dialog2')) {
        alert('Dialog template is missing!');
    }
    if (this.parent) {
        return;
    }
    this.parent = $('#calendar_dialog2').parent();
    $('#calendar_dialog2_title').text(this.options.title);
    $('#calendar_dialog2_text').html(this.options.text);
    var button_yes_1 = $($('#calendar_dialog2 a')[0]);
    button_yes_1.unbind('click');
    button_yes_1.click(this.options.button_yes_1.callback_function);
    button_yes_1.find('.middle').text(this.options.button_yes_1.title);
    var button_yes_2 = $($('#calendar_dialog2 a')[1]);
    button_yes_2.unbind('click');
    button_yes_2.click(this.options.button_yes_2.callback_function);
    button_yes_2.find('.middle').text(this.options.button_yes_2.title);
    var button_no = $($('#calendar_dialog2 a')[2]);
    button_no.unbind('click');
    button_no.click(this.options.button_no.callback_function);
    button_no.find('.middle').text(this.options.button_no.title);
    $('#calendar_dialog2').appendTo('#content').show();
}

$(document).ready(function () {
    ReportTranslation.initialize();
});
var ReportTranslation = {
    dialog_id: 'report_translation_dialog',
    dialog_size: {
        'w': 520,
        'h': 404
    },
    initialize: function () {
        $('.report_translation').click(this.open.bind(this));
    },
    open: function () {
        var div = $('#' + this.dialog_id);
        if (!div.length) {
            div = $('<div id="' + this.dialog_id + '"></div>');
            div.css({
                'position': 'absolute',
                'width': this.dialog_size.w,
                'height': this.dialog_size.h,
                'top': ($('#content').outerHeight() - this.dialog_size.h) / 2,
                'left': ($('#content').outerWidth() - this.dialog_size.w) / 2,
                'zIndex': '10'
            });
            div.html(tmpl('report_translation_dialog_tmpl', {}));
            div.appendTo("#content");
            div.show('slow');
            $('#' + this.dialog_id + ' a.cancel').click(this.close.bind(this));
        }
        Ajax.post('report_translation', 'form', {}, function (data) {
            $('#' + this.dialog_id + ' .new_window_content_content').html(data.html);
        }.bind(this), {});
    },
    close: function () {
        $('#' + ReportTranslation.dialog_id).remove();
    },
    submit: function () {
        $('#' + ReportTranslation.dialog_id).hide();
        var params = {
            'wrong': $('#report_translation_form textarea[name="reported_translation_wrong"]').val(),
            'suggestion': $('#report_translation_form textarea[name="reported_translation_suggestion"]').val(),
            'comments': $('#report_translation_form textarea[name="reported_translation_comments"]').val(),
            'url_pathname': document.location.pathname,
            'url_search': document.location.search,
            'html': document.documentElement.innerHTML
        };
        $('#' + ReportTranslation.dialog_id).show();
        Ajax.post('report_translation', 'save', params, function (data) {
            this.close();
        }.bind(this), {});
    }
};

var GameData = {
    units: [],
    powers: [],
    map_size: 0,
    add: function (data) {
        jQuery.extend(this, data);
    }
}

var Layout = {
    resources: {},
    production: {},
    storage_volume: 0,
    max_favor: 0,
    population: 0,
    favor: 0,
    current_god_favor_production: 0,
    favor_production: {},
    powers_disabled: {},
    god: '',
    ajaxLoader: null,
    town_list_toggle: false,
    town_group_list_toggle: false,
    client_server_time_diff: 0,
    town_link_clicked_menu: null,
    has_active_group: false,
    player_id: 0,
    playtime_countdown_finished_at: null,
    towns: {},
    power_popup_data: [],
    updateBar: function (bar) {
        if (bar.resources) {
            for (res_id in bar.resources) {
                $('#' + res_id + '_count').html(bar.resources[res_id]);
                if (bar.resources[res_id] == this.storage_volume) {
                    $('#' + res_id).addClass('resources_full');
                } else {
                    $('#' + res_id).removeClass('resources_full');
                }
                Layout.resources[res_id] = bar.resources[res_id];
            }
        }
        if (bar.population != undefined) {
            $('#pop_current').html(bar.population);
            if (bar.population == 0) {
                $('#res #pop').addClass('resources_full');
            } else {
                $('#res #pop').removeClass('resources_full');
            }
            Layout.population = bar.population;
        }
        if (bar.favor != undefined) {
            $('#favor_text').html(bar.favor);
            if (bar.favor == this.max_favor) {
                $('#res #favor').addClass('resources_full_god');
            } else {
                $('#res #favor').removeClass('resources_full_god');
            }
            Layout.favor = bar.favor;
            var favor_production = '<ul>';
            $.each(bar.favors, function (god_id, favor) {
                if (favor.production) {
                    favor_production += '<li>' + '%1$s: %2$d - Produktion pro Stunde: %3$.1f'.replace('%1$s', favor.god).replace('%2$d', favor.current).replace('%3$.1f', favor.production) + '</li>';
                }
            });
            favor_production += '<ul>';
            PopupFactory.texts.favor_production = favor_production;
            $('#favor').setPopup('favor_production');
        }
        if (bar.god) {
            $('#god_mini').hide().attr('class', 'god_mini ' + bar.god).fadeIn('slow');
            Layout.god = bar.god;
        }
        if (bar.new_message != undefined) {
            if (bar.new_message == $('#new_messages').hasClass('no_new_messages')) {
                $('#new_messages').toggleClass('no_new_messages').toggleClass('new_messages');
                Layout.blink($('#new_messages'));
            }
        }
        if (bar.new_report != undefined) {
            if (bar.new_report == $('#new_reports').hasClass('no_new_messages')) {
                $('#new_reports').toggleClass('no_new_messages').toggleClass('new_messages');
                Layout.blink($('#new_reports'));
            }
        }
        if (bar.casted_powers != undefined) {
            if ($('#casted_powers_wrapper').length == 0) {
                $('#bar_content').append('<div id="casted_powers_wrapper" style="width:33px;">');
            }
            $('#casted_powers_wrapper').html('');
            $.each(bar.casted_powers, function (power_id, finished_at) {
                $('#casted_powers_wrapper').append('<div class="casted_power"><div class="index_town_powers casted_power_' + power_id + '" style="background: url(\'http://static.grepolis.com/images/game/towninfo/powers/' + power_id + '_24x24.png\') no-repeat 0 0;"></div></div>');
            });
            $('#casted_powers_wrapper').attr("style", 'width:' + ($('#casted_powers_wrapper').children().length * 33) + 'px;');
            Layout.initializePowerPopups(bar.casted_powers);
        }
        if (bar.production != undefined) {
            Layout.production = bar.production;
            $.each(bar.production, function (id, number) {
                $('#production_' + id + '_text').html(s(ngettext('Produktion pro Stunde: %1', new Array('Produktion pro Stunde: %1'), number), number));
                PopupFactory.texts[id + '_production'] = PopupFactory.texts[id + '_production'].replace(/<span id="(.*?)">(.*)<\/span>/, '<span id="$1">' + (s(ngettext('Produktion pro Stunde: %1', new Array('Produktion pro Stunde: %1'), bar.production[id]), bar.production[id])) + '</span>');
                $("#" + id).setPopup(id + "_production");
            });
        }
        if (typeof GodsOverview != 'undefined' && bar.favor_gods_overview != undefined) {
            GodsOverview.updateFavorBar(bar.favor_gods_overview);
        }
    },
    changeTownName: function () {
        $('#town_name_span_text').css('display', 'none');
        $('#town_name_span_input').css('display', '');
        $('#town_name').bind('submit', Layout.saveTownName);
    },
    saveTownName: function () {
        var town_name = $('#town_name_input').val();
        Ajax.post('index', 'set_town_name', {
            town_name: town_name
        }, function (data) {
            if (data.success) {
                $('#town_name_span_text').css('display', '');
                $('#town_name_span_input').css('display', 'none');
                $('#town_name_href').text(data.town_name);
                Tutorial.calculateNextStep();
            }
        }, {}, 'change_town_name');
    },
    addTownGroup: function () {
        $('#town_group_name_span_input').css('display', '');
        $('#town_group_name').bind('submit', Layout.saveTownGroupName);
    },
    saveTownGroupName: function () {
        var town_group_name = $('#town_group_name_input').val();
        Ajax.post('town_group_overviews', 'add_town_group', {
            town_group_name: town_group_name
        }, function (data) {
            if (data.success) {
                list_element = $('#overview_town_group_list');
                var list = $('<li class="town_group_name" id="town_group_id_' + data.town_group_id + '"><div class="town_group_inactive show"><a href="#" onclick="Layout.setTemoraryActiveTownGroup(' + data.town_group_id + ', \'\'' + ', \'\'' + ', ' + false + ')">' + data.town_group_name + '</a></div>' + '<div class="town_group_inactive hide"><span class="bold">' + data.town_group_name + '</span></div><a class="cancel delete_town_group" href="#" onclick="Layout.deleteTownGroup(' + data.town_group_id + ', \'' + data.town_group_name + '\', false)">' + '</a></li>');
                list.appendTo(list_element);
                var sum_groups = $(list_element).children().length;
                if (sum_groups >= data.max_sum_groups) {
                    $('#town_group_add_new_group').remove();
                }
                if (sum_groups == 1) {
                    $('#town_group_overview_head').text('Gruppen');
                }
                $('#town_group_name_span_input').css('display', 'none');
                if (data.show_hint) {
                    var hint = 'Du hast soeben deine erste Stadtgruppe erstellt. Du kannst ihr Städte hinzufügen, nachdem du sie aktiviert hast. Sobald du eine Gruppe aktiviert hast, werden in den Übersichten nur noch Städte dieser Gruppe berücksichtigt. Um alle Städte in der Übersicht zu sehen, muss die aktive Gruppe abgewählt werden. Dies kannst du im Dropdown \"Gruppenliste\" in der Schnellnavigation tun.';
                    Layout.showHint('Spieltipp:', hint);
                }
            }
        }, {}, 'add_town_group');
    },
    deleteTownGroup: function (id, town_group_name, active) {
        check = confirm('Soll die Gruppe %s wirklich gelöscht werden?'.replace('%s', town_group_name));
        if (check) {
            Ajax.post('town_group_overviews', 'delete_town_group', {
                town_group_id: id,
                town_group_name: town_group_name,
                active: active
            }, function (data) {
                if (data.success) {
                    $('#town_group_id_' + id + '').remove();
                    if (data.active || data.town_group_id == TownGroupOverview.temporary_active_group) {
                        Layout.has_active_group = false;
                        TownGroupOverview.temporary_active_group = 0;
                        TownGroupOverview.cleanupActiveTowns({});
                        $('#active_town_list_head').text('Keine Gruppe ausgewählt');
                        $('#sort_icons_active_group_towns .show').removeClass('show').addClass('hide');
                    }
                    var sum_groups = $('#overview_town_group_list').children().length;
                    list = $('#town_group_overview_dummy');
                    if (sum_groups == data.max_sum_groups - 1) {
                        var elem = $('<ul class="game_list" id="town_group_add_new_group"></ul>');
                        elem.append('<li><form id="town_group_name" class="bold" action=""><span id="town_grop_name_span_text"><a href="javascript:void(0)" onclick="Layout.addTownGroup()" id="add_town_group_href">' + 'Neue Gruppe hinzufügen' + '</a></span><span id="town_group_name_span_input" style="display:none"><input type="text" id="town_group_name_input" value="" maxlength="20" size="15" /><img src="http://static.grepolis.com/images/game/layout/town_name_save.png" alt="" id="save_town_group_name" onclick="Layout.saveTownGroupName()" style="cursor:pointer" /></span></form></li>');
                        elem.appendTo(list);
                    }
                    else if (sum_groups == 0) {
                        $('#town_group_overview_head').text('Keine Gruppe vorhanden');
                    }
                }
            }, {}, 'delete_town_group');
        }
    },
    toggleTownList: function () {
        if (Layout.town_list_toggle) {
            return;
        }
        list_element = $('#town_list');
        if (list_element.is(':visible')) {
            list_element.hide().empty();
        } else {
            Layout.town_list_toggle = true;
            list_element.detach();
            var current_url = window.location.href;
            Ajax.get('town_group_overviews', 'get_towns_of_active_town_group', {
                current_url: current_url
            }, function (data) {
                list_element.append(data.list_html);
                $('#box').append(list_element);
                list_element.show();
                Layout.town_list_toggle = false;
            });
        }
    },
    toggleTownGroupList: function (controller_name, action_name) {
        if (Layout.town_group_list_toggle) {
            return;
        }
        list_element = $('#town_list');
        if (list_element.is(':visible')) {
            list_element.hide().empty();
        } else {
            Layout.town_group_list_toggle = true;
            list_element.detach();
            Ajax.get('town_group_overviews', 'get_selectable_town_groups', {
                'controller_name': controller_name,
                'action_name': action_name
            }, function (data) {
                var town_groups = data.town_groups;
                var list = $('<ul></ul>');
                $('<div id="town_list_top"></div>').appendTo(list);
                $.each(town_groups, function (nr) {
                    if (this.active) {
                        Layout.has_active_group = true;
                        $('<li><img src="http://static.grepolis.com/images/game/overviews/active_group.png" alt="A - " height="14" width="14" /> <span class="bold">' + this.name + '</span></li>').appendTo(list);
                    } else {
                        $('<li><a href="#" onclick="return Layout.setActiveTownGroup(' + this.id + ', \'' + data.controller_name + '\', \'' + data.action_name + '\')">' + '' + this.name + '</a></li>').appendTo(list);
                    }
                });
                $('<li>&nbsp;</li>').appendTo(list);
                if (Layout.has_active_group) {
                    $('<li><a href ="#" onclick="return Layout.setActiveTownGroup(0, \'' + data.controller_name + '\', \'' + data.action_name + '\')">' + 'Gruppe abwählen' + '</a></li>').appendTo(list);
                }
                $('<li><a href ="#" onclick="return Layout.gotoTownGroupOverview()">' + 'Gruppen verwalten' + '</a></li>').appendTo(list);
                $('<div id="town_list_bottom"></div>').appendTo(list);
                list.appendTo(list_element);
                $('#box').append(list_element);
                list_element.show();
                Layout.town_group_list_toggle = false;
            });
        }
    },
    closeHint: function () {
        $('#player_hint').remove();
    },
    setActiveTownGroup: function (group_id, controller_name, action_name) {
        if (controller_name == 'town_overviews') {
            Ajax.get('town_group_overviews', 'set_active_town_group', {
                'group_id': group_id
            }, function (data) {
                Layout.toggleTownGroupList(controller_name, action_name);
                location.reload();
            });
        } else if (controller_name == 'town_group_overviews') {
            if ($('#town_group_id_' + group_id + ' .town_group_active').length == 0) {
                Ajax.get('town_group_overviews', 'set_active_town_group', {
                    'group_id': group_id
                }, function (data) {
                    Layout.setTemoraryActiveTownGroup(data.town_group_id);
                    var tg_img = $('.show .img_active_town_group');
                    if (tg_img.length == 0) {
                        tg_img = $('<img class="img_active_town_group" src="http://static.grepolis.com/images/game/overviews/active_group.png" alt="A - " height="14" width="14" />');
                    }
                    $('.town_group_active').removeClass('town_group_active').addClass('town_group_inactive');
                    $('#town_group_id_' + data.town_group_id + ' .town_group_inactive').removeClass('town_group_inactive').addClass('town_group_active');
                    tg_img.prependTo($('#town_group_id_' + data.town_group_id + ' .town_group_active'));
                    $('.town_group_inactive .img_active_town_group').remove();
                    if ($('#town_group_id_' + data.town_group_id + ' .show .bold').length > 0) {
                        var active_hide = $('#town_group_id_' + data.town_group_id + ' .show');
                        var active_show = $('#town_group_id_' + data.town_group_id + ' .hide');
                        active_hide.removeClass('show').addClass('hide');
                        active_show.removeClass('hide').addClass('show');
                    }
                    if ($('#town_list').is(':visible')) {
                        $('#town_list').hide().empty();
                    }
                    if (data.town_group_id == 0) {
                        Layout.has_active_group = false;
                        location.reload();
                    }
                });
            }
        } else {
            Ajax.get('town_group_overviews', 'set_active_town_group', {
                'group_id': group_id
            }, function (data) {
                Layout.toggleTownGroupList(controller_name, action_name);
            });
        }
        return false;
    },
    setTemoraryActiveTownGroup: function (group_id) {
        TownGroupOverview.old_temp_active_group = TownGroupOverview.temporary_active_group;
        TownGroupOverview.temporary_active_group = group_id;
        Ajax.get('town_group_overviews', 'get_town_ids_by_group', {
            'group_id': group_id
        }, function (data) {
            TownGroupOverview.setTemporaryActiveGroup(data);
        });
    },
    gotoTownGroupOverview: function () {
        window.location.href = url('town_group_overviews', 'town_group_overview', {});
    },
    popup: function (url, width, height) {
        var w = window.open(url, 'popup', 'width=' + width + ',height=' + height + ',resizable=yes,scrollbars=yes');
        w.focus();
    },
    showAjaxLoader: function () {
        this.ajaxLoader = $('#ajax_loader');
        if (this.ajaxLoader.length == 0) {
            this.ajaxLoader = $('<img src="http://static.grepolis.com/images/game/ajax-loader.gif" id="ajax_loader" />');
            this.ajaxLoader.appendTo($('#box'));
        }
        this.ajaxLoader.css('display', '');
    },
    hideAjaxLoader: function () {
        $('#ajax_loader').css('display', 'none');
    },
    initializeResourcesProductionCounter: function () {
        Layout.resources.wood_offset = 0;
        Layout.resources.stone_offset = 0;
        Layout.resources.iron_offset = 0;
        Layout.favor_offset = 0;
        var resources = ['wood', 'stone', 'iron'];
        $(document).everyTime(100, function () {
            for (res_id in resources) {
                var id = resources[res_id];
                if (Layout.resources[id] < Layout.storage_volume) {
                    Layout.resources[id + '_offset'] += Layout.production[id] / (60 * 60 * 10);
                    if (Layout.resources[id + '_offset'] > 1) {
                        Layout.resources[id] += parseInt(Layout.resources[id + '_offset']);
                        Layout.resources[id + '_offset'] = Layout.resources[id + '_offset'] - parseInt(Layout.resources[id + '_offset']);
                        if (Layout.resources[id] >= Layout.storage_volume) {
                            Layout.resources[id] = Layout.storage_volume;
                            Layout.resources[id + '_offset'] = 0;
                            $('#' + id).addClass('resources_full');
                        }
                        $('#' + id + '_count').html(Layout.resources[id]);
                    }
                }
            }
            if (Layout.favor < Layout.max_favor) {
                Layout.favor_offset += Layout.current_god_favor_production / (60 * 60 * 10);
                if (Layout.favor_offset > 1) {
                    Layout.favor += parseInt(Layout.favor_offset);
                    Layout.favor_offset = Layout.favor_offset - parseInt(Layout.favor_offset);
                    if (Layout.favor >= Layout.max_favor) {
                        Layout.favor = Layout.max_favor;
                        Layout.favor_offset = 0;
                    }
                    $('#favor_text').html(Layout.favor);
                }
            }
            Layout._refreshBuildingMain();
        });
    },
    initializeQuickbar: function () {
        $(".toolbar_toggle_menu").hover(function () {
            $(this).children('div').show();
        }, function () {
            $(this).children('div').hide();
        });
    },
    initializeOverviewDropDown: function () {
        $('.town_overviews').hover(function () {
            $(this).children('div').css({
                'position': 'absolute',
                'left': '16px',
                'top': '0px',
                'z-index': '200'
            }).show();
        }, function () {
            $(this).children('div').hide();
        });
    },
    blink: function (ele) {
        function fadeOut() {
            ele.fadeTo(1000, 0.2, fadeIn);
        }

        function fadeIn() {
            ele.fadeTo(1000, 1, fadeOut);
        }
        fadeOut();
    },
    parseToValidNumericValue: function (ele) {
        var value = $(ele).val();
        value = value.replace(/[^\d\.]/g, '');
        value = parseInt(value, 10);
        if (isNaN(value)) {
            value = '';
        }
        $(ele).val(value);
    },
    displayServerTime: function () {
        Layout.client_server_time_diff = Timestamp.clientServerDiff();

        function updateServerTime() {
            var servertime = new Date((new Date()).getTime() - Timestamp.serverGMTOffset() * 1000 - Layout.client_server_time_diff * 1000);
            var hours = servertime.getUTCHours();
            var minutes = servertime.getUTCMinutes();
            var seconds = servertime.getUTCSeconds();
            var day = servertime.getUTCDate();
            var month = servertime.getUTCMonth() + 1;
            var year = servertime.getUTCFullYear();
            if (hours < 10) {
                hours = '0' + hours;
            }
            if (minutes < 10) {
                minutes = '0' + minutes;
            }
            if (seconds < 10) {
                seconds = '0' + seconds;
            }
            if (day < 10) {
                day = '0' + day;
            }
            if (month < 10) {
                month = '0' + month;
            }
            $('#server_time').text(hours + ':' + minutes + ':' + seconds + ' ' + day + '/' + month + '/' + year);
        }
        $(document).ready(function () {
            updateServerTime();
            window.setInterval(updateServerTime, 1000);
        });
    },
    townLinkClicked: function (ele, town_id, player_id, url, target) {
        if (!Layout.town_link_clicked_menu) {
            Layout.town_link_clicked_menu = $('#town_link_clicked_menu');
        }
        ele = $(ele)
        var offset = ele.offset();
        $('#box').parent().append(Layout.town_link_clicked_menu);
        var top = ~~offset.top + ~~ele.height();
        var left = ~~offset.left;
        if (~~ (Layout.town_link_clicked_menu.css('top').replace('px', '')) != top || ~~ (Layout.town_link_clicked_menu.css('left').replace('px', '')) != left) {
            Layout.town_link_clicked_menu.hide();
        }
        Layout.town_link_clicked_menu.css('top', top);
        Layout.town_link_clicked_menu.css('left', left);
        $(Layout.town_link_clicked_menu.find('a')[0]).attr('href', url);
        $(Layout.town_link_clicked_menu.find('a')[0]).attr('target', target);
        $(Layout.town_link_clicked_menu.find('a')[1]).attr('href', '#');
        $(Layout.town_link_clicked_menu.find('a')[1]).unbind('click');
        $(Layout.town_link_clicked_menu.find('a')[1]).click(function () {
            var type = 'town_info';
            var is_ghost_town = !player_id;
            if (typeof CommandInfo != 'undefined') {
                CommandInfo.close();
            }
            if (typeof ConquerorInfo != 'undefined') {
                ConquerorInfo.close();
            }
            TownInfo.init(town_id, type, is_ghost_town, '#content');
            Layout.town_link_clicked_menu.hide();
        });
        if (player_id == Layout.player_id) {
            $(Layout.town_link_clicked_menu.find('a')[2]).attr('href', '/game/index?town_id=' + town_id);
            $(Layout.town_link_clicked_menu.find('a')[2]).show();
        } else {
            $(Layout.town_link_clicked_menu.find('a')[2]).hide();
        }
        if (Layout.town_link_clicked_menu.is(':hidden')) {
            Layout.town_link_clicked_menu.show();
        } else {
            Layout.town_link_clicked_menu.hide();
        }
        return false;
    },
    _refreshBuildingMain: function () {
        if (typeof BuildingMain == 'undefined') {
            return;
        }
        if (BuildingMain.full_queue) {
            return;
        }
        if (BuildingMain.tear_down_menu === true) {
            return;
        }
        var building_level = {};
        $.each(BuildingMain.buildings, function (id, building) {
            building_level[id] = building.level;
        });
        $.each(BuildingMain.buildings, function (id, building) {
            if (!building.can_upgrade && building.max_level) {
                var can_upgrade = true;
                if (building.pop > 0 && building.pop > Layout.population) {
                    can_upgrade = false;
                }
                if (building.needed_resources.wood > Layout.resources['wood'] || building.needed_resources.stone > Layout.resources['stone'] || building.needed_resources.iron > Layout.resources['iron']) {
                    can_upgrade = false;
                }
                if (can_upgrade && building.get_dependencies) {
                    $.each(building.get_dependencies, function (dep_id, dep_building) {
                        if (dep_building.needed_level > building_level[dep_id]) {
                            can_upgrade = false;
                        }
                    });
                }
                if (can_upgrade) {
                    BuildingMain.buildings[id].can_upgrade = true;
                    $($('#building_main_not_possible_button_' + id)[0].parentNode).append('<a href="#" onclick="BuildingMain.action(\'build\', \'' + id + '\'); return false;" class="build small">' + (building.level > 0 ? (s(ngettext('Ausbau auf %1', new Array('Ausbau auf %1'), building.next_level), building.next_level)) : 'Bauen') + '</a>');
                    $('#building_main_not_possible_button_' + id).remove();
                }
            }
        });
    },
    initializePowerPopups: function (powers) {
        $.each(powers, function (power_id, finished_at) {
            var str = PopupFactory.texts[power_id];
            str = '<script type="text/javascript">' + '$("div.temple_power_popup_info .eta").countdown(' + finished_at + ',{})' + '</script>' + str.slice(0, str.length - 16) + '<br />' + '<img alt="" src="http://static.grepolis.com/images/game/res/time.png">' + '<span class="eta">' + finished_at + '</span>' + '</p></div></div>';
            $(".casted_power_" + power_id).mousePopup(new MousePopup(str));
        });
    },
    initializePowerPopupForTownOverview: function (power_id, town_id, finished_at) {
        var str = PopupFactory.texts[power_id];
        str = '<script type="text/javascript">' + '$("div.temple_power_popup_info .eta").countdown(' + finished_at + ',{})' + '</script>' + str.slice(0, str.length - 16) + '<br />' + '<img alt="" src="http://static.grepolis.com/images/game/res/time.png">' + '<span class="eta">' + finished_at + '</span>' + '</p></div></div>';
        $("#cp_town_" + town_id + "_" + power_id).mousePopup(new MousePopup(str));
    },
    determineDisabledPowers: function () {
        Layout.powers_disabled = {};
        $.each(GameData.powers, function (power_id, power) {
            if (Layout.favor_production[power.god_id].current_exact < power.favor && Layout.favor_production[power.god_id].production_exact > 0) {
                var favor_diff = power.favor - Layout.favor_production[power.god_id].current_exact;
                var needed_hours = favor_diff / Layout.favor_production[power.god_id].production_exact;
                var needed_seconds = needed_hours * 60 * 60;
                Layout.powers_disabled[power_id] = {
                    needed_min_favor: power.favor,
                    current_favor: Layout.favor_production[power.god_id].current_exact,
                    favor_production: Layout.favor_production[power.god_id].production_exact,
                    favor_enough_in: readableSeconds(needed_seconds),
                    favor_enough_at: parseInt(Game.server_time) + needed_seconds
                };
            }
        });
    },
    showHint: function (title, text) {
        var on_hide = null;
        var on_close = '$(\'#player_hint_area\').remove()';
        if (arguments.length > 3) {
            on_hide = arguments[3];
        }
        if (arguments.length > 2) {
            on_close = arguments[2];
        }
        var hint = '<div id="player_hint_area"><style type="text/css">#player_hint{position:absolute;z-index:50;left:100px;top:50px;}#hint_window_title{left: 22px;top: 9px;position: relative;width: 280px;}</style>' + '<div id="player_hint">' + '<div id="player_hint_top">' + '<div id="player_hint_window_arrows">' + (on_hide != null ? '<a class="player_hint_hide tutorial_button" href="javascript:void(0)" onclick="' + on_hide + '" />' : '') + '<a class="player_hint_close tutorial_button" href="javascript:void(0)" onclick="' + on_close + '"></a>' + '</div>' + '<h4 id="hint_window_title">' + title + '</h4>' + '</div>' + '<div id="player_hint_content">' + '<div id="player_hint_window_subcontent">' + text + '</div>' + '</div>' + '<div id="player_hint_bottom"></div>' + '</div>' + '</div></div>';
        $('#content').append(hint);
        if (on_hide != null) {
            $('.player_hint_hide').mousePopup(new MousePopup('Abschalten'));
        }
        $('.player_hint_close').mousePopup(new MousePopup('Schließen'));
    },
    getMenuHeight: function () {
        var w = 0,
            h = 0;
        var subj = $('#menu_inner_subject_container'),
            ul = subj.next(),
            subj_h = subj.children().first().outerHeight(),
            ul_w = ul.width() - subj.outerWidth();
        ul.children().each(function () {
            w += ($(this).outerWidth())
        });
        h = subj_h;
        while ((w -= ul_w) > 0) {
            h += subj_h;
        }
        return h;
    },
    paginator_goto: function (element, page_offset) {
        var page = parseInt(prompt("Gehe zu Seite"), 10) - 1;
        if (isNaN(page)) {
            return false;
        }
        var offset = page * page_offset;
        var tabs = false;
        if (arguments.length == 5) {
            tabs = true;
            var tab_box_id = arguments[2];
            var controller = arguments[3];
            var action = arguments[4];
        }
        if (offset < 0) {
            return false;
        }
        element = $(element);
        if (tabs === true) {
            Layout.paginatorTabsGotoPage(tab_box_id, page, controller, action);
        } else {
            var href = element.attr('href');
            element.attr('href', href.replace('offset=0', 'offset=' + offset));
        }
        return true;
    },
    paginatorTabsGotoPage: function (tab_box_id, page_offset, controller, action) {
        Ajax.post(controller, action, {
            offset: ((page_offset * 10) - 10)
        }, function (return_data) {
            $('#' + tab_box_id).html(return_data.html);
        });
    },
    initializeResourcesProductionCounterForOverview: function (towns) {
        Layout.towns = towns;
        for (var town in Layout.towns) {
            Layout.towns[town].resources.wood_offset = 0;
            Layout.towns[town].resources.stone_offset = 0;
            Layout.towns[town].resources.iron_offset = 0;
        }
        var resources = ['wood', 'stone', 'iron'];
        var step = 5000;
        $(document).everyTime(step, function () {
            for (var town in Layout.towns) {
                for (var res_id in resources) {
                    var id = resources[res_id];
                    if (Layout.towns[town].resources[id] < Layout.towns[town].storage_volume) {
                        var offset = Layout.towns[town].production[id] / (60 * 60 / (step / 1000));
                        Layout.towns[town].resources[id + '_offset'] += offset;
                        if (Layout.towns[town].resources[id + '_offset'] > 1) {
                            Layout.towns[town].resources[id] += parseInt(Layout.towns[town].resources[id + '_offset']);
                            Layout.towns[town].resources[id + '_offset'] = Layout.towns[town].resources[id + '_offset'] - parseInt(Layout.towns[town].resources[id + '_offset']);
                            if (Layout.towns[town].resources[id] >= Layout.towns[town].storage_volume) {
                                Layout.towns[town].resources[id] = Layout.towns[town].storage_volume;
                                Layout.towns[town].resources[id + '_offset'] = 0;
                                var resource_elem = $('#town_' + Layout.towns[town].id + '_res' + ' .' + id);
                                resource_elem.addClass('town_storage_full');
                            }
                            var elem = $('#town_' + Layout.towns[town].id + '_res .' + id + '.resource_count .count');
                            elem.html(Layout.towns[town].resources[id]);
                        }
                    }
                }
            }
        });
    }
};

jQuery.fn.extend({
    setPopup: function (popup_type) {
        PopupFactory.bindNewPopupTo(this, popup_type);
    }
});
var PopupFactory = {
    texts: {},
    init: function () {
        var ts = {
            storage_info: '<b>' + "Rohstofflager" + '</b>',
            population_info: '<b>' + "Freie Bevölkerung" + '</b>',
            next_city: 'Nächste Stadt',
            prev_city: 'Letzte Stadt',
            city_list: 'Städteliste',
            change_city_name: 'Stadtname ändern',
            save_city_name: 'Stadtname speichern',
            unit_type_hack: '<h4>' + 'Schlagwaffe' + '</h4>',
            unit_type_pierce: '<h4>' + 'Stichwaffe' + '</h4>',
            unit_type_distance: '<h4>' + 'Distanzwaffe' + '</h4>'
        };
        var pfs = [{
            i: 'curator',
            t: 'Verwalter',
            d: PopupFactory.texts.curator_info
        },
        {
            i: 'trader',
            t: 'Händler',
            d: PopupFactory.texts.trader_info
        },
        {
            i: 'priest',
            t: 'Hohepriesterin',
            d: PopupFactory.texts.priest_info
        },
        {
            i: 'commander',
            t: 'Befehlshaber',
            d: PopupFactory.texts.commander_info
        },
        {
            i: 'captain',
            t: 'Kapitän',
            d: PopupFactory.texts.captain_info
        }];
        for (var i = pfs.length - 1; i >= 0; --i)
        ts[pfs[i].i + '_info'] = '<div class="premium_advisor_image advisor_popup ' + pfs[i].i + '" ></div><div class="premium_advisor_popup_text"><b>' + pfs[i].t + '</b><br />' + pfs[i].d + '</div>';
        this.addTexts(ts);
        var powers_values = {};
        $.each(GameData.powers, function (key, power) {
            var disabled = Layout.powers_disabled[power.id];
            if (disabled) {
                var countdown_part = '<script type="text/javascript">' + '$("div.temple_power_popup .favor_for_' + power.id + '_placeholder").append("<p><img alt=\'\' src=\'http://static.grepolis.com/images/game/res/time.png\'><span class=\'favor_for_' + power.id + '_enough_at\'></span></p>");' + '$("div.temple_power_popup .favor_for_' + power.id + '_enough_at").countdown(' + disabled.favor_enough_at + ',{});' + '</script>';
            } else {
                var countdown_part = '';
            }
            powers_values[key] = countdown_part + '<div class="temple_power_popup">' + '<div class="temple_power_popup_image" style="background: url(http://static.grepolis.com/images/game/temple/power_' + power.id + '.png) 0 -86px no-repeat;"/>' + '<div class="temple_power_popup_info">' + '<h4>' + power.name + '</h4>' + '<p>' + power.description + '</p>' + '<b>' + power.effect + '</b><br />' + '<p><img src="http://static.grepolis.com/images/game/res/favor.png" alt="" />' + '%1 Gunst'.replace('%1', power.favor) + '</p>' + '<p class="favor_for_' + power.id + '_placeholder"></p>' + '</div>' + '</div>';
        });
        this.addTexts(powers_values);
        var unit_values = {};
        $.each(GameData.units, function (key, unit) {
            unit_values[key] = unit.name;
            if (PopupFactory.isGroundUnit(unit)) {
                unit_values[key + '_details'] = '<div class="temple_unit_popup">' + '<h4>' + unit.name + '</h4>' + '<img src="http://static.grepolis.com/images/game/units/' + unit.id + '_90x90.jpg" alt="' + unit.name + '" />' + '<div class="temple_unit_popup_info">' + '<table id="unit_order_unit_info" border="1" style="font-weight: bold">' + '<tr>' + '<td><div id="unit_order_att_' + unit.attack_type + '" />' + unit.attack + '</td>' + '<td><div id="unit_order_def_hack" />' + unit.def_hack + '</td>' + '</tr>' + '<tr>' + '<td><div id="unit_order_speed" />' + unit.speed + '</td>' + '<td><div id="unit_order_def_pierce" />' + unit.def_pierce + '</td>' + '</tr>' + '<tr>' + '<td><div id="unit_order_booty" />' + (unit.booty ? unit.booty : '0') + '</td>' + '<td><div id="unit_order_def_distance" />' + unit.def_distance + '</td>' + '</tr>' + '</table>' + '<p>' + unit.description + '</p>' + '</div>' + '</div>';
            } else {
                unit_values[key + '_details'] = '<div class="temple_unit_popup">' + '<h4>' + unit.name + '</h4>' + '<img src="http://static.grepolis.com/images/game/units/' + unit.id + '_90x90.jpg" alt="' + unit.name + '" />' + '<div class="temple_unit_popup_info">' + '<table id="unit_order_unit_info" border="1" style="font-weight: bold">' + '<tr>' + '<td><div id="unit_order_attack" />' + unit.attack + '</td>' + '<td><div id="unit_order_defense" />' + unit.defense + '</td>' + '</tr>' + '<tr>' + '<td><div id="unit_order_speed" />' + unit.speed + '</td>' + '<td><div id="unit_order_transport" />' + unit.capacity + '</td>' + '</tr>' + '</table>' + '<p>' + unit.description + '</p>' + '</div>' + '</div>';
            }
        });
        this.addTexts(unit_values);
    },
    addTexts: function (texts) {
        jQuery.extend(this.texts, texts);
    },
    bindNewPopupTo: function (element, popup_type) {
        if (this.texts[popup_type] == undefined) {
            throw "PopupFactory: Invalid popup type '" + popup_type + "'.";
        }
        element.mousePopup(new MousePopup(this.texts[popup_type]));
    },
    isGroundUnit: function (unit) {
        return unit.capacity == undefined;
    }
}

var Tutorial = {
    max_step_id: 0,
    step_id: 0,
    init: function (step_id) {
        if (!step_id || !this.tutorial) {
            return;
        }
        this.step_id = step_id;
        this.div = div = $('#tutorial_window');
        if (this.div.length == 0) {
            this.div = $('<div id="tutorial_window"></div>');
            this.div.appendTo('#box');
        }
        this.display();
    },
    display: function () {
        if (!this.tutorial) {
            return;
        }
        $('#tutorial_window').removeClass();
        $('#tutorial_window').addClass('tutorial_window_step_' + this.step_id);
        this.jsonRequest = $.getJSON(url('tutorial'), {
            step_id: this.step_id
        }, function (data) {
            if (Tutorial.redirect && data.redirect) {
                window.location.href = url(data.redirect);
                Tutorial.redirect = false;
                return;
            }
            Tutorial.div.show();
            Tutorial.div.html(tmpl('tutorial_tmpl', {}));
            $('#tutorial_window_prev_link').css('display', 'none');
            $('#tutorial_window_next_link').css('display', 'none');
            $('#tutorial_window_title').html(data.title);
            $('#tutorial_window_subcontent').html($('#tutorial_window_subcontent').html() + data.value);
            if (data.previous) {
                $('#tutorial_window_prev_link').css('display', '');
            }
            if (data.next) {
                $('#tutorial_window_next_link').css('display', '');
            }
            if (data.arrow && $(data.arrow.target).length > 0) {
                if (!data.arrow.offset) {
                    data.arrow.offset = {
                        x: 0,
                        y: 0
                    };
                }
                Tutorial.renderArrow($(data.arrow.target), data.arrow.direction, data.arrow.offset);
            }
            if (data.bonus) {
                HumanMessage.success(data.bonus);
            }
            var id = Tutorial.step_id;
            if (id === 4 || id === 6 || id === 19 || id === 30) {
                $('#tutorial_guy').addClass('reward');
            } else {
                $('#tutorial_guy').removeClass('reward');
            }
            Tutorial.getWindowPositionOnMap();
            $('#tutorial_window_prev_link').mousePopup(new MousePopup('Zurück'));
            $('#tutorial_window_next_link').mousePopup(new MousePopup('Weiter'));
            $('.tutorial_hide').mousePopup(new MousePopup('Ausblenden'));
            $('.tutorial_close').mousePopup(new MousePopup('Abschalten'));
        });
    },
    getWindowPositionOnMap: function () {
        var position = {},
            arrow = $('#tutorialArrow'),
            twindow = $('#tutorial_window');
        if (!arrow.offset() || !twindow.offset()) {
            return;
        }
        var a = {
            'top': arrow.offset().top,
            'bottom': arrow.offset().top + arrow.height(),
            'left': arrow.offset().left,
            'right': arrow.offset().left + arrow.width()
        },
            w = {
                'top': twindow.offset().top,
                'bottom': twindow.offset().top + twindow.height(),
                'left': twindow.offset().left,
                'right': twindow.offset().left + twindow.width()
            }
            if (a.bottom < w.top || a.top > w.bottom || a.right < w.left || a.left > w.right) {
                return;
            } else {
                twindow.css({
                    'left': a.left - twindow.width() - $('#box').offset().left + 'px'
                })
            }
    },
    previous: function () {
        if (this.step_id == 3 || this.step_id == 10 || this.step_id == 14 || this.step_id == 25 || this.step_id == 27 || this.step_id == 29) {
            this.redirect = true;
        } else if (this.step_id == 16) {
            TownInfo.close();
        } else if ((this.step_id == 22 && Minimap.visible) || (this.step_id == 23 && !Minimap.visible)) {
            Minimap.toggle();
        }
        this.div.hide();
        if (this.arrow) {
            this.arrow.remove();
        }
        if ((this.step_id == 5 && this.max_step_id >= 5) || (this.step_id == 7 && this.max_step_id >= 7)) {
            this.step_id -= 2;
        } else if (this.step_id == 21) {
            TownInfo.close();
            this.step_id -= 5;
        } else {
            this.step_id--;
        }
        this.display();
    },
    next: function (action) {
        if (this.step_id == 2 || this.step_id == 13 || this.step_id == 24 || this.step_id == 28) {
            this.redirect = true;
        }
        this.div.hide();
        if (this.arrow) {
            this.arrow.remove();
        }
        if (this.step_id == 20 && this.max_step_id > 20) {
            TownInfo.close();
        }
        if (this.step_id == 21 && action != 'no_action') {
            if (!Minimap.visible) {
                Minimap.toggle();
            }
        }
        if ((this.step_id == 3 && this.max_step_id > 3) || (this.step_id == 5 && this.max_step_id > 5)) {
            this.step_id += 2;
        } else {
            this.step_id++;
        }
        this.display();
    },
    close: function () {
        if (this.jsonRequest) {
            this.jsonRequest.abort();
        }
        if (this.arrow) {
            this.arrow.remove();
        }
        if (this.div) {
            this.div.hide();
        }
    },
    disable: function () {
        if (confirm('Tutorial wird abgeschaltet. Du kannst es jederzeit unter Einstellungen wieder einschalten.')) {
            this.close();
            $.getJSON(url('tutorial'), {
                action: 'disable'
            });
        }
    },
    renderArrow: function (target_element, direction, offset) {
        var tutorialArrowSize = {
            width: 32,
            height: 32
        },
            element = $(target_element),
            element_position = element.position(),
            top, left;
        if (!direction) {}
        switch (direction) {
        case 'nw':
            top = element_position.top + element.height();
            left = element_position.left + element.width();
            break;
        case 'n':
            top = element_position.top + element.height();
            left = element_position.left + element.width() / 2 - tutorialArrowSize.width / 2;
            break;
        case 'ne':
            top = element_position.top + element.height();
            left = element_position.left - tutorialArrowSize.width;
            break;
        case 'e':
            top = element_position.top + element.height() / 2 - tutorialArrowSize.height / 2;
            left = element_position.left - tutorialArrowSize.width;
            break;
        case 'se':
            top = element_position.top - tutorialArrowSize.height;
            left = element_position.left - tutorialArrowSize.width;
            break;
        case 's':
            top = element_position.top - tutorialArrowSize.height;
            left = element_position.left + element.width() / 2 - tutorialArrowSize.width / 2;
            break;
        case 'sw':
            top = element_position.top - tutorialArrowSize.height;
            left = element_position.left + element.width();
            break;
        case 'w':
            top = element_position.top + element.height() / 2 - tutorialArrowSize.height / 2;
            left = element_position.left + element.width();
            break;
        }
        this.arrow = $('<img id="tutorialArrow" src="http://static.grepolis.com/images/game/tutorial/arrow_' + direction + '.png" />');
        this.arrow.css({
            position: 'absolute',
            top: top + offset.y,
            left: left + offset.x,
            zIndex: 35
        }).appendTo(element.parent()).show();
    },
    show: function () {
        if (Tutorial.step_id != 17 && Tutorial.step_id != 18 && Tutorial.step_id != 19 && Tutorial.step_id != 20 && Tutorial.step_id != 22) {
            Tutorial.close();
            Tutorial.init(Tutorial.step_id);
        }
    },
    calculateNextStep: function (action) {
        Tutorial.close();
        if (Tutorial.step_id == 16) {
            Tutorial.next();
        } else if (Tutorial.step_id == 17) {
            if (action == '54321') {
                Tutorial.next();
            } else if (action == 'farm_town_info') {
                Tutorial.init(Tutorial.step_id);
            }
        } else if (Tutorial.step_id == 18) {
            if (action == '54321') {
                Tutorial.init(Tutorial.step_id);
            } else if (action == 'send_units_complete') {
                Tutorial.next();
            }
        } else if (Tutorial.step_id == 19) {
            if (action != 'minimap_clicked') {
                Tutorial.init(Tutorial.step_id);
            }
        } else if (Tutorial.step_id == 20) {
            if (action == '12345') {
                Tutorial.next();
            } else if (action != 'minimap_clicked') {
                Tutorial.init(Tutorial.step_id);
            }
        } else if (Tutorial.step_id == 21) {
            Tutorial.next('no_action');
        } else if (Tutorial.step_id == 22) {
            Tutorial.init(Tutorial.step_id);
        } else if (Tutorial.step_id == 23) {
            if (action != 'minimap_clicked') {
                Tutorial.next();
            }
        }
    }
};

var Alliance = {
    elm: {},
    save: function (target, callback) {
        if (!$('#ally_' + target + '_textarea').val()) {
            return;
        }
        var params = {
            field: target,
            value: $('#ally_' + target + '_textarea').val()
        };
        Ajax.post('alliance', 'save', params, function (data) {
            if (typeof callback === 'function') {
                callback(data);
            }
        }, {}, 'alliance');
    },
    editAnnounce: function () {
        var params = {
            field: 'announce'
        };
        Ajax.post('alliance', 'get', params, function (data) {
            $('#ally_announce_edit').hide().next().show();
            $('#ally_announce_bbcodes').show().next().hide();
            $('#ally_announce_body').append('<textarea id="ally_announce_textarea">' + data.value + '</textarea>');
            BBCodes.init({
                'target': '#ally_announce_textarea'
            });
        }, {}, 'alliance');
    },
    saveAnnounce: function () {
        var callback = function (data) {
            $('#ally_announce_edit').show().next().hide();
            $('#ally_announce_bbcodes').hide().next().show().html(data.value).next().remove();
        };
        this.save('announce', callback);
    },
    editImage: function () {
        $('#ally_image').hide();
        $('#ally_image_edit').show();
        $('#ally_profile_save').show();
    },
    editProfile: function () {
        this.elm.profile_text = $('#ally_profile_body_content').detach();
        Ajax.post('alliance', 'get', {
            field: 'profile'
        }, function (data) {
            var style = parseInt($('#ally_profile').css('maxHeight')) - parseInt($('#ally_banner').height()) - 24;
            $('#ally_profile_save').show();
            $('#ally_profile_body').toggleClass('editable').append($('<textarea id="ally_profile_textarea">' + data.value + '</textarea>').css({
                height: style,
                width: 348
            }));
        }, {}, 'alliance');
    },
    saveProfile: function () {
        if ($('#image').val() || $('#delete_image:checked').val()) {
            submit_form('alliance_emblem_form', 'alliance', 'updateEmblem');
        }
        if ($('#ally_profile_body').find('textarea')) {
            var callback = function (data) {
                $('#ally_profile_body').toggleClass('editable').append(Alliance.elm.profile_text.html(data.value)).find('textarea').remove();
                $('#ally_profile_save').hide();
            }
            this.save('profile', callback);
        }
    },
    updateName: function () {
        var alliance_name = $('#alliance_name').val();
        Ajax.post('alliance', 'updateName', {
            name: alliance_name
        }, function () {}, {}, 'update_alliance_name');
        return false;
    },
    updateFurtherSettings: function () {
        var show_contact = $('input:checkbox[name=show_contact_buttons]:checked').val();
        var show_founder_icon = $('input:checkbox[name=show_founder_icon]:checked').val();
        var show_pact_member = $('input:checkbox[name=show_pact_member]:checked').val();
        var block_pact_invitations = $('input:checkbox[name=block_pact_invitations]:checked').val();
        Ajax.post('alliance', 'updateFurtherSettings', {
            show_contact: (show_contact === 'on' ? true : false),
            show_founder_icon: (show_founder_icon === 'on' ? true : false),
            show_pact_member: (show_pact_member === 'on' ? true : false),
            block_pact_invitations: (block_pact_invitations === 'on' ? true : false)
        }, function () {}, {}, 'update_further_settings');
        return false;
    },
    kick_player: function (player_id) {
        var confirm_kick_dialog = new Dialog({
            title: 'Spieler kicken',
            text: 'Willst du den Spieler wirklich kicken?',
            button_yes: {
                title: 'Ja',
                callback_function: function () {
                    Ajax.post('alliance', 'kick', {
                        'player_id': player_id
                    }, function (data) {
                        $('#alliance_player_' + player_id).fadeOut();
                    }, {}, 'alliance');
                    return confirm_kick_dialog.close();
                }
            },
            button_no: {
                title: 'Nein',
                callback_function: function () {
                    return confirm_kick_dialog.close();
                }
            }
        });
        confirm_kick_dialog.open();
        return false;
    },
    cancel_invitation: function (id) {
        Ajax.post('alliance', 'cancel_invitation', {
            id: id
        }, function (data) {
            $('#invitation_' + id).fadeOut();
        }.bind(id), {}, 'alliance');
    },
    deleteAlliance: function () {
        var confirm_alliance_delete_dialog = new Dialog({
            title: 'Allianz auflösen',
            text: 'Willst du die Allianz wirklich auflösen?',
            button_yes: {
                title: 'Ja',
                callback_function: function () {
                    return submit_form('delete_form', 'alliance', 'delete');
                }
            },
            button_no: {
                title: 'Nein',
                callback_function: function () {
                    return confirm_alliance_delete_dialog.close();
                }
            }
        });
        confirm_alliance_delete_dialog.open();
        return false;
    }
}

var Picomap = {
    position: {},
    tile_size: 400,
    canvas_width: 139,
    canvas_height: 103,
    map_tiles_per_minimap_tile: 25,
    map_tiles_per_minimap_canvas: {},
    scale_factor: 8,
    canvas_adjustment: {
        x: 3,
        y: 2
    },
    image_path: '',
    pico_last_change: null,
    initialize: function (map_x, map_y, image_path) {
        if (arguments.length == 4) {
            this.pico_last_change = arguments[3];
        }
        Picomap.image_path = image_path;
        this.position = {
            x: map_x,
            y: map_y
        };
        this.map_tiles_per_minimap_canvas = {
            x: this.map_tiles_per_minimap_tile / (this.tile_size / this.canvas_width),
            y: this.map_tiles_per_minimap_tile / (this.tile_size / this.canvas_height)
        };
        Picomap.goto(map_x - (this.map_tiles_per_minimap_canvas.x / 2) + this.canvas_adjustment.x, map_y - (this.map_tiles_per_minimap_canvas.y / 2) + this.canvas_adjustment.y);
    },
    goto: function (map_x, map_y) {
        map_x = bound(map_x, 0, GameData.map_size - this.map_tiles_per_minimap_canvas.x);
        map_y = bound(map_y, 0, GameData.map_size - this.map_tiles_per_minimap_canvas.x);
        this.position = {
            x: map_x,
            y: map_y
        };
        var img_x = parseInt(map_x / this.map_tiles_per_minimap_tile);
        var img_y = parseInt(map_y / this.map_tiles_per_minimap_tile);
        var offset_x = map_x % this.map_tiles_per_minimap_tile;
        var offset_y = map_y % this.map_tiles_per_minimap_tile;
        offset = MapTiles.map2Pixel(offset_x, offset_y);
        offset.x = offset.x / this.scale_factor;
        offset.y = offset.y / this.scale_factor;
        var needed_chunks = [];
        needed_chunks.push({
            x: img_x,
            y: img_y
        });
        if ((this.tile_size - offset.x) < this.canvas_width) {
            needed_chunks.push({
                x: img_x + 1,
                y: img_y
            });
        }
        if ((this.tile_size - offset.y) < this.canvas_height) {
            needed_chunks.push({
                x: img_x,
                y: img_y + 1
            });
        }
        if (needed_chunks.length >= 3) {
            needed_chunks.push({
                x: img_x + 1,
                y: img_y + 1
            });
        }
        var minimap = $('#picomap');
        var top = parseInt(minimap.css('top'));
        var left = parseInt(minimap.css('left'));
        var islands_layers = $('#picomap_islands_layer');
        var town_layers = $('#picomap_towns_layer');
        islands_layers.empty();
        town_layers.empty();
        var last_y;
        $.each(needed_chunks, function (i, chunk) {
            if (last_y != 'undefined' && last_y < chunk.y) {
                islands_layers.append($('<br style="clear:both;"/>'));
                town_layers.append($('<br style="clear:both;"/>'));
            }
            var islands_layer_img_src = Picomap.image_path + 'minimap_' + (chunk.x) + '_' + (chunk.y) + '.png';
            var islands_layer = $('<img src="' + islands_layer_img_src + '" alt="" />');
            islands_layers.append(islands_layer);
            var town_layer_img_src = '/img/delivery?action=minimap_towns&x=' + chunk.x + '&y=' + chunk.y + '&player_id=' + Game.player_id + '&alliance_id=' + Game.alliance_id;
            var town_layer = $('<div><img src="' + town_layer_img_src + '&' + Picomap.pico_last_change + '" alt="" /></div>');
            town_layers.append(town_layer);
            last_y = chunk.y;
        });
        minimap.css('left', -1 * offset.x);
        minimap.css('top', -1 * offset.y);
    }
};

var ImageCountdown = {
    count_pictures: 64,
    picture_height: 40,
    duration: 0,
    start_time: 0,
    end_time: 0,
    object: null,
    image_object: null,
    css_options: {},
    css_image_options: {},
    tick_interval: null,
    start: function (object, start_time, end_time, css_options, css_image_options, callback) {
        ImageCountdown.object = object;
        ImageCountdown.css_options = css_options;
        ImageCountdown.css_image_options = css_image_options;
        ImageCountdown.duration = (end_time - start_time) * 1000;
        ImageCountdown.start_time = start_time;
        ImageCountdown.end_time = end_time;
        ImageCountdown.callback = callback;
        var image = $('<div class="image_countdown"><img src="http://static.grepolis.com/images/game/order/order_layer.png"/></div>');
        image.css(ImageCountdown.css_options);
        image.find('img').css(ImageCountdown.css_image_options);
        object.after(image);
        ImageCountdown.image_object = image;
        if (ImageCountdown.tick_interval == null) {
            ImageCountdown.tick_interval = window.setInterval("ImageCountdown.tick()", 1000);
        }
    },
    tick: function () {
        var now = Date.parse(new Date());
        var already = now - ImageCountdown.start_time * 1000;
        var percent = (already * 100) / ImageCountdown.duration;
        var picture_number = Math.round(percent * ImageCountdown.count_pictures / 100);
        ImageCountdown.image_object.find('img').css('top', (picture_number * -parseInt(ImageCountdown.css_image_options.width)) + 'px');
        if (already >= ImageCountdown.duration) {
            picture_number = ImageCountdown.count_pictures;
            ImageCountdown.stop();
            if (ImageCountdown.callback !== undefined) {
                ImageCountdown.callback();
            }
        }
    },
    stop: function () {
        window.clearInterval(ImageCountdown.tick_interval);
        ImageCountdown.tick_interval = null;
        ImageCountdown.start_time = 0;
        ImageCountdown.end_time = 0;
        ImageCountdown.duration = 0;
    }
}

var MapTiles = {
    mapSize: null,
    tileSize: {
        x: 256,
        y: 128
    },
    focussed_town_id: null,
    elm: {},
    initialize: function (mapData, xSize, ySize, islands, map_size, focussed_town_id) {
        this.elm = {
            'tiles': $('#map_tiles'),
            'towns': $('#map_towns'),
            'islands': $('#map_islands')
        };
        this.mapSize = map_size;
        this.mapData = mapData;
        this.islands = islands;
        this.focussed_town_id = focussed_town_id;
        this.xSize = xSize;
        this.ySize = ySize;
        this.tileBuffer = {
            x: 3,
            y: 3
        };
        this.tileCount = {
            x: Math.floor(this.xSize / (this.tileSize.x / 2)) + this.tileBuffer.x,
            y: Math.floor(this.ySize / this.tileSize.y) + this.tileBuffer.y
        };
        this.debug = {
            show_coords_on_map: false,
            map_use_weird_coords: false
        };
        this.cssOffset = {
            x: 0,
            y: 0
        };
    },
    getScrollBorder: function () {
        return {
            xMin: -this.tileSize.x / 2,
            yMin: -this.tileSize.y / 2,
            xMax: this.tileSize.x / 2 * (this.mapSize - this.tileCount.x),
            yMax: this.tileSize.y * (this.mapSize - this.tileCount.y)
        };
    },
    map2Pixel: function (x, y) {
        var top = y * this.tileSize.y,
            left = x * this.tileSize.x / 2;
        if (x % 2 == 1) {
            top += this.tileSize.y / 2;
        }
        return {
            x: left,
            y: top
        };
    },
    pixel2Map: function (x, y) {
        var mapX = x / (this.tileSize.x / 2);
        var mapY = ((mapX % 2 == 1) ? (y - this.tileSize.y / 2) : y) / this.tileSize.y;
        return {
            x: Math.floor(mapX),
            y: Math.floor(mapY)
        };
    },
    getImage: function (x, y) {
        var data = this.mapData.get(x, y);
        if (data === undefined) {
            return {
                img: 'watertiles.png',
                left: 0,
                top: 0
            };
        }
        if (data >> 8 == 0) {
            var left = ((data & 255) % 4) * this.tileSize.x;
            var top = parseInt((data & 255) / 4) * this.tileSize.y;
            return {
                img: 'watertiles.png',
                left: left,
                top: top
            };
        }
        else {
            var island = this.islands[data >> 8];
            var offset = this.map2Pixel((data & 255) % (island.width), parseInt((data & 255) / island.width));
            return {
                img: island.img,
                left: offset.x,
                top: offset.y
            };
        }
    },
    colMove: function (dir) {
        var oldOffset = (dir == 1) ? this.tileCount.x - 1 : 0;
        var newOffset = (dir == 1) ? -1 : this.tileCount.x;
        for (var y = 0; y < this.tileCount.y; y++) {
            var tile = this.$(oldOffset + this.tile.x, y + this.tile.y, true);
            this.setXY(tile, newOffset + this.tile.x, y + this.tile.y);
        }
        this.tile.x += -dir;
        this.mapData.checkReload(this.tile.x, this.tile.y, this.tileCount.x, this.tileCount.y);
    },
    rowMove: function (dir) {
        var oldOffset = (dir == 1) ? this.tileCount.y - 1 : 0;
        var newOffset = (dir == 1) ? -1 : this.tileCount.y;
        for (var x = 0; x < this.tileCount.x; x++) {
            var tile = this.$(x + this.tile.x, oldOffset + this.tile.y, true);
            this.setXY(tile, x + this.tile.x, newOffset + this.tile.y);
        }
        this.tile.y += -dir;
        this.mapData.checkReload(this.tile.x, this.tile.y, this.tileCount.x, this.tileCount.y);
    },
    setTilePixel: function (tile, x, y) {
        var pixel = this.map2Pixel(x, y);
        tile.style.left = pixel.x + this.cssOffset.x + 'px';
        tile.style.top = pixel.y + this.cssOffset.y + 'px';
    },
    setAllTilePixel: function () {
        $('.tile').each(function (i, tile) {
            var id = $(tile).attr('id'),
                tmp = id.split('_'),
                x = parseInt(tmp[1]),
                y = parseInt(tmp[2]);
            if (!isNaN(x) && !isNaN(y)) {
                this.setTilePixel(tile, x, y);
            }
        }.bind(this));
    },
    recreate: function () {
        this.elm.tiles[0].innerHTML = '';
        this.elm.tiles[0].innerText = '';
        for (var y = 0; y < this.tileCount.y; y++) {
            for (var x = 0; x < this.tileCount.x; x++) {
                this.addTile(x, y);
            }
        }
    },
    addTile: function (x, y) {
        var tile = document.createElement('div');
        tile.style.position = 'absolute';
        tile.className = 'tile';
        this.setXY(tile, x + this.tile.x, y + this.tile.y);
        this.elm.tiles.append(tile);
    },
    setXY: function (tile, x, y) {
        tile.id = 'tile_' + x + '_' + y;
        this.setTilePixel(tile, x, y);
        this.updateTile(tile, x, y);
    },
    updateTile: function (tile, x, y) {
        var image = this.getImage(x, y);
        tile.style.backgroundImage = 'url(http://static.grepolis.com/images/game/map/' + image.img + ')';
        tile.style.backgroundPosition = -image.left + 'px ' + -image.top + 'px';
        if (tile.childNodes.length) {
            $(tile).innerHTML = '';
        }
        if (this.debug.show_coords_on_map) {
            tmp = {
                x: x,
                y: y
            };
            tile.innerHTML = tmp.x + '|' + tmp.y;
        }
    },
    updateTownsForCurrentPosition: function () {
        this.updateTowns(this.tile.x, this.tile.y, this.tileCount.x, this.tileCount.y);
        this.updateIslandInfos(this.tile.x, this.tile.y, this.tileCount.x, this.tileCount.y);
    },
    createTownDiv: function (town) {
        var islandOffset = this.map2Pixel(town.x, town.y),
            town_type = WMap.getTownType(town);
        var div_town = $('<div />').attr('id', WMap.getTownType(town) + '_' + town.id).addClass('tile').css({
            'left': this.cssOffset.x + islandOffset.x + town.offset_x + 'px',
            'top': this.cssOffset.y + islandOffset.y + town.offset_y + 'px'
        });
        if (this.focussed_town_id == town.id && town_type == 'town') {
            var div_town_focus = $('<div />').addClass('focussedtown').css({
                'left': div_town.css('left'),
                'top': div_town.css('top')
            });
            this.elm.towns.append(div_town_focus);
        }
        if (town_type == 'town') {
            var left = this.cssOffset.x + parseInt(islandOffset.x) + parseInt(town.offset_x) + parseInt(town.flag_x),
                top = this.cssOffset.y + parseInt(islandOffset.y) + parseInt(town.offset_y) + parseInt(town.flag_y);
            div_flag = $('<div />').attr('id', 'flag_' + town.id).addClass('flag ' + town.css_class).css({
                'left': left,
                'top': top,
                'background-color': '#' + town.flag_color
            });
            if (undefined != town.flag_type) {
                div_flag.css('background-image', 'url(http://static.grepolis.com/images/game/flags/map/flag' + town.flag_type + '.png)');
            }
            this.elm.towns.append(div_flag);
            div_flag_overlay = $('<div />').addClass('flag_overlay').css({
                'left': left,
                'top': top
            });
            this.elm.towns.append(div_flag_overlay);
        }
        if (town_type == 'town') {
            var filename = town_type + '_' + town.dir + '_' + town.size + '.png';
        } else if (town_type == 'free') {
            var filename = 'found.png';
        } else {
            var filename = town_type + '_' + ((town.id + town.offset_x * 23 + town.offset_y * 211) % 5 + 1) + '.png';
        }
        div_town.css('backgroundImage', 'url(http://static.grepolis.com/images/game/map/' + filename + ')');
        this.elm.towns.append(div_town);
        return div_town;
    },
    createIslandDiv: function (island) {
        var offset = this.map2Pixel(island.x, island.y),
            island_type = this.islands[island.type],
            iconoffset = this.map2Pixel(island_type.width, island_type.height);
        var div = $('<div />').attr('id', 'island' + '_' + island.x + '_' + island.y).addClass('islandinfo islandinfo-' + island.type + ' islandinfo-' + island.res).css({
            'left': this.cssOffset.x + offset.x + iconoffset.x / 2 + 'px',
            'top': this.cssOffset.y + offset.y + iconoffset.y / 2 + 'px'
        });
        this.elm.islands.append(div);
        return div;
    },
    updateTowns: function (x, y, width, height) {
        var towns = this.mapData.getTowns(x, y, width, height);
        for (i in towns) {
            var town = towns[i];
            var townDiv = document.getElementById(WMap.getTownType(town) + '_' + town.id);
            if (!townDiv) {
                this.createTownDiv(town);
            }
        }
    },
    updateIslandInfos: function (x, y, width, height) {
        var islandinfos = this.mapData.getIslandInfos(x, y, width, height);
        for (i in islandinfos) {
            var island = islandinfos[i];
            var islandDiv = document.getElementById('island_' + island.x + '_' + island.y);
            if (!islandDiv) {
                this.createIslandDiv(island);
            }
        }
    },
    $: function (x, y) {
        var id = 'tile_' + x + "_" + y;
        var tile = document.getElementById(id);
        if (!tile) {
            console.trace();
            console.error(x + '|' + y);
        }
        return tile;
    }
}

var Quickbar = {
    data: {},
    initIconChooser: function () {
        this.selectCurrentIcon();
        $('#toolbar_icons div').bind('click', function () {
            $('#toolbar_item_image').val($($(this).children('img')).attr('src'))
            $('#toolbar_icons div').removeClass('selected');
            $(this).addClass('selected');
        })
    },
    selectCurrentIcon: function () {
        for (var i = $('#toolbar_icons img').length - 1; i >= 0; i--) {
            if ($($('#toolbar_icons img')[i]).attr('src') == $('#toolbar_item_image').val()) {
                $($('#toolbar_icons div')[i]).addClass('selected')
            } else {
                $($('#toolbar_icons div')[i]).removeClass('selected')
            }
        };
    },
    setData: function (data) {
        Quickbar.data = data;
    },
    initialize: function (data) {
        Quickbar.setData(data);
        $('#enalbe_quickbar').click(function () {
            var input = $(this);
            var enabled = input.attr('checked');
            Ajax.post('quickbar', 'toggle_quickbar', {
                'quickbar_enabled': enabled
            }, function (data) {
                if (enabled) {
                    $('#quickbar').removeClass('decreased_opacity');
                    $('#header .toolbar').show();
                    HumanMessage.success('Die Schnellleiste wurde aktiviert.');
                } else {
                    $('#quickbar').addClass('decreased_opacity');
                    $('#header .toolbar').hide();
                    HumanMessage.success('Die Schnellleiste wurde deaktiviert.');
                }
            });
        });
        $('#quickbar a').click(function () {
            var id = $(this).parent('li').attr('id').replace(/id_/, '');
            var item = Quickbar.data[id];
            Quickbar.show_edit_form(item);
        });
        $('#quickbar').sortable({
            update: function (event, ui) {
                var sort_array_unformated = $(this).sortable('toArray');
                var sort_array = [];
                $.each(sort_array_unformated, function (i, id) {
                    sort_array[i] = parseInt(id.replace(/id_/, ''));
                });
                Ajax.post('quickbar', 'resort', {
                    sort_array: sort_array
                }, function (data) {
                    Quickbar.refreshQuickbar();
                });
            }
        });
        $('#add_item_show').click(function () {
            $('#toolbar_item_id').val('');
            $('#toolbar_item_name').val('');
            $('#toolbar_item_image').val('');
            $('#toolbar_item_url').val('');
            $('#edit_toolbar_item').fadeIn('fast');
            $('#add_data').show();
            $('#item_url').show();
            $('#save_data').hide();
        });
        $('#add_data').click(function () {
            var item = {
                name: $('#toolbar_item_name').val(),
                url: $('#toolbar_item_url').val(),
                image: $('#toolbar_item_image').val()
            };
            if ($('#submenu').html() != '') {
                item.submenu = $('#edit_toolbar_item').serializeArray();
            }
            Ajax.post('quickbar', 'add_item', item, function (data) {
                HumanMessage.success('Der Menüpunkt wurde hinzugefügt.');
                Quickbar.setData(data.quickbar_data);
                Quickbar.refreshQuickbar();
            });
        });
        $('#add_submenu_show').click(function () {
            Quickbar.show_edit_form({
                'name': '',
                'image': ''
            });
            $('#toolbar_item_url').val('');
            $('#add_data').show();
            $('#item_url').hide();
            $('#save_data').hide();
        });
        $('#save_data').click(function () {
            var item = {
                id: $('#toolbar_item_id').val(),
                name: $('#toolbar_item_name').val(),
                url: $('#toolbar_item_url').val(),
                image: $('#toolbar_item_image').val()
            };
            if ($('#submenu').html() != '') {
                item.submenu = $('#edit_toolbar_item').serializeArray();
            }
            Ajax.post('quickbar', 'edit_item', item, function (data) {
                HumanMessage.success('Die Schnellleiste wurde erfolgreich editiert.');
                Quickbar.setData(data.quickbar_data);
                Quickbar.refreshQuickbar();
            });
        });
        $('#remove_data').click(function () {
            var id = $('#toolbar_item_id').val();
            var confirm_delete = confirm('Willst du diesen Menüpunkt wirklich entfernen?');
            if (!confirm_delete) {
                return;
            }
            Ajax.post('quickbar', 'remove_item', {
                'id': id
            }, function (data) {
                HumanMessage.success('Der Menüpunkt wurde entfernt.');
                Quickbar.setData(data.quickbar_data);
                $('#id_' + id).remove();
            });
        });
        $('#reset_quickbar').click(function () {
            var confirm_reset = confirm('Willst du die Schnellleiste wirklich zurücksetzen?');
            if (!confirm_reset) {
                return;
            }
            Ajax.post('quickbar', 'reset_quickbar', {}, function (data) {
                HumanMessage.success('Die Schnellleiste wurde zurückgesetzt.');
                Quickbar.setData(data.quickbar_data);
                Quickbar.refreshQuickbar();
            });
        });
    },
    'show_edit_form': function (item) {
        $('#add_data').hide();
        $('#save_data').show();
        $('#toolbar_item_id').val(item.id);
        $('#toolbar_item_name').val(item.name);
        $('#toolbar_item_image').val(item.image);
        if (item.url == undefined) {
            $('#item_url').hide();
            $('#toolbar_icons').hide();
            var submenu_html = "";
            submenu_html += '<b>' + 'Menüpunkte' + '</b>'
            submenu_html += '<ul>';
            $.each(item, function (id, menu_item) {
                if (typeof menu_item == 'object') {
                    submenu_html += '<li>';
                    submenu_html += '<label>' + 'Name:' + '  </label><input type="text" name="submenu[' + id + '][name]" value="' + menu_item.name + '"/>  ';
                    submenu_html += '<label>' + 'Link:' + '  </label><input type="text" name="submenu[' + id + '][url]" value="' + menu_item.url + '"/>  ';
                    submenu_html += '<a href="#" class="cancel delete_submenu_item"></a><br style="clear:both"/>';
                    submenu_html += '</li>';
                }
            });
            submenu_html += '</ul>';
            submenu_html += '<div style="clear:both;"></div><a href="#" class="add_submenu_item invite_to_ally" style="float:right;"></a>';
            $('#submenu').html(submenu_html).show();
            $('#submenu').find('ul').sortable();
            $('.delete_submenu_item').click(function () {
                $(this).parent('li').remove();
            });
            $('.add_submenu_item').click(function () {
                id = $('#submenu').find('ul li').length + 1;
                submenu_html = "";
                submenu_html += '<li>';
                submenu_html += '<label>' + 'Name:' + '</label><input type="text" name="submenu[' + id + '][name]" value=""/>  ';
                submenu_html += '<label>' + 'Link:' + '</label><input type="text" name="submenu[' + id + '][url]" value=""/>  ';
                submenu_html += '<a href="#" class="cancel delete_submenu_item"></a><br style="clear:both"/>';
                submenu_html += '</li>';
                $('#submenu').find('ul').append(submenu_html);
                $('.delete_submenu_item').click(function () {
                    $(this).parent('li').remove();
                });
                $('#submenu').find('ul').sortable();
            });
        } else {
            $('#toolbar_item_url').val(item.url).show();
            $('#item_url').show();
            $('#toolbar_icons').show();
            $('#submenu').empty();
        }
        Quickbar.selectCurrentIcon();
        $('#edit_toolbar_item').fadeIn('fast');
    },
    toggleInfoText: function () {
        $('#quickbar_toggle_text_button').html($('#quickbar_info_text').is(':visible') ? 'Text einblenden' : 'Text ausblenden');
        $('#quickbar_info_text').slideToggle();
    },
    refreshQuickbar: function () {}
}

function UnitSlider() {
    var container = null;
    var input = null;
    var self = this;
    var button = null;
    var unit_sldr = null;
    this.initialize = function (id, minval, maxval, callback) {
        maxval = parseInt(maxval);
        minval = parseInt(minval);
        callback = callback ||
        function () {};
        var timer;
        input = $('input#' + id);
        if (input.length < 1) {
            input = $("input[name='" + id + "']");
        }
        button = input.prev();
        container = button.prev();
        container.unbind();
        button.unbind();
        var sldr = container.children('.unit_slider');
        unit_sldr = new Slider({
            elementInput: input,
            elementSlider: container.children('.unit_slider'),
            elementDown: container.children('.unit_slider').prev(),
            elementUp: container.children('.unit_slider').next(),
            min: minval,
            max: maxval,
            max_overwrite: true,
            callback: callback
        });
        button.bind('click', {
            msg: id
        }, function (e) {
            self.showSlider(e.data.msg);
        });
        unit_sldr.bind('slidestop', {
            msg: this
        }, function (e) {
            input.change();
        });
    }, this.setMax = function (max) {
        unit_sldr.setValue(0);
        unit_sldr.setMax(max);
    }
    this.showSlider = function (name) {
        this.hideAllSliders(name);
        var input = container.next(input);
        var parent = input.parent();
        if (container.is(':visible') || container.css('display') != 'none') {
            this.hideAllSliders();
        } else {
            parent.addClass('active');
            container.fadeIn();
        }
        container.bind('mouseover', function () {
            $(this).focus();
        });
        container.bind('mouseleave', function () {
            self.hideAllSliders();
            $(this).unbind('mouseover mouseleave');
        });
    }
    this.hideAllSliders = function (id) {
        $('.active .unit_slider_container').fadeOut('fast');
        $('.unit_container').each(function () {
            $(this).removeClass('active');
        });
        setTimeout(function () {
            $('.unit_slider_container').each(function () {
                if (!$(this).parent().is('.active') && $(this).attr('style') != null) {
                    $(this).removeAttr('style');
                }
            })
        }, 500);
    }
}

var TownInfo = {
    type: null,
    town_id: null,
    tabs: null,
    unitInfo: null,
    sameIsland: false,
    espionage_researched: false,
    market_level: null,
    tab_loading: false,
    'init': function (town_id, type, is_ghost_town, element_id) {
        UninhabitedPlaceInfo.close();
        var tabs;
        var divSize = [520, 404];
        this.town_id = town_id;
        this.type = type;
        var div = $('#townWindow');
        if (div.length == 0) {
            div = $('<div id="townWindow"></div>');
            var element = $(element_id);
            div.css({
                'position': 'absolute',
                'width': divSize[0],
                'height': divSize[1],
                'top': (element.outerHeight() - divSize[1]) / 2,
                'left': (element.outerWidth() - divSize[0]) / 2,
                'zIndex': '10'
            });
            div.appendTo(element_id);
        }
        div.show();
        if (type == 'town_info') {
            div.html(tmpl('town_info_tmpl', {}));
            tabs = ['info', 'support', 'attack', 'trading', 'god', 'espionage'];
            $("#town_info_tabs li a").each(function (i) {
                $(this).attr('href', url('town_info', undefined, {
                    action: tabs[i],
                    id: town_id
                }));
                if (tabs[i] == 'info') {
                    $(this).mousePopup(new MousePopup('Allgemeine Informationen'));
                } else if (tabs[i] == 'support') {
                    $(this).mousePopup(new MousePopup('Unterstützen'));
                } else if (tabs[i] == 'attack') {
                    $(this).mousePopup(new MousePopup('Angreifen'));
                } else if (tabs[i] == 'trading') {
                    $(this).mousePopup(new MousePopup('Handeln'));
                } else if (tabs[i] == 'god') {
                    $(this).mousePopup(new MousePopup('Göttliche Kräfte wirken'));
                } else if (tabs[i] == 'espionage') {
                    $(this).mousePopup(new MousePopup('Spionage'));
                }
            });
        } else if (type == 'farm_town_info') {
            div.html(tmpl('farm_town_info_tmpl', {}));
            tabs = ['info', 'attack', 'trading'];
            $("#farm_town_info_tabs li a").each(function (i) {
                $(this).attr('href', url('farm_town_info', undefined, {
                    action: tabs[i],
                    id: town_id
                }));
                if (tabs[i] == 'info') {
                    $(this).mousePopup(new MousePopup('Allgemeine Informationen'));
                } else if (tabs[i] == 'attack') {
                    $(this).mousePopup(new MousePopup('Angreifen'));
                } else if (tabs[i] == 'trading') {
                    $(this).mousePopup(new MousePopup('Handeln'));
                }
            });
        }
        $("#info_tab_window_bg").tabs({
            'spinner': '',
            'cache': false,
            'ajaxOptions': {
                cache: false,
                beforeSend: function () {
                    TownInfo.tab_loading = true;
                    Layout.showAjaxLoader();
                },
                complete: function () {
                    TownInfo.tab_loading = false;
                    Layout.hideAjaxLoader();
                }
            }
        }).bind('tabsselect', function (event, ui) {
            $("#info_tab_window_bg .ui-tabs-panel").empty();
        });
        $("#info_tab_window_bg").bind('tabsload', function (event, ui) {
            $.each(GameData.units, function (unit) {
                $("#" + unit).setPopup(unit);
            });
        });
        this.tabs = tabs;
        if (!TownInfo.espionage_researched) {
            this.disableTab('espionage');
        }
        if (TownInfo.market_level < 1) {
            this.disableTab('trading');
        }
        if (TownInfo.town_id == Game.townId && TownInfo.type == 'town_info') {
            this.disableTab('trading');
            this.disableTab('attack');
            this.disableTab('support');
            this.disableTab('espionage');
        }
        if (is_ghost_town == true) {
            this.disableTab('trading');
            this.disableTab('god');
        }
        if (type == 'farm_town_info') {
            Tutorial.calculateNextStep('farm_town_info');
        }
        return false;
    },
    disableTab: function (tab_name) {
        var index = $.inArray(tab_name, this.tabs);
        if (index > -1) {
            $("#info_tab_window_bg").tabs('disable', index);
        }
    },
    'close': function () {
        if (!TownInfo.tab_loading) {
            if (ColorPicker) {
                ColorPicker.close($('#bb_color_picker'));
            }
            $('#townWindow').remove();
        }
    },
    'bindCapacityCounter': function () {
        function recalcCapacity() {
            function totalCapacity(inputs) {
                var total_capacity = 0;
                var len = inputs.length;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    count = parseInt(input.value, 10);
                    if (!isNaN(input.value) && count > 0) {
                        total_capacity += TownInfo.unitInfo[input.name].capacity * count;
                    }
                }
                return total_capacity;
            }

            function totalPopulation(inputs) {
                var total_population = 0;
                var len = inputs.length;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    count = parseInt(input.value, 10);
                    if (!isNaN(input.value) && count > 0) {
                        total_population += TownInfo.unitInfo[input.name].population * count;
                    }
                }
                return total_population;
            }
            var total_capacity = totalCapacity($('.unit_input_naval'));
            var total_population = totalPopulation($('.unit_input_ground'));
            var q = total_capacity / total_population;
            var progress = q > 1 || isNaN(q) ? 0 : q * -460;
            $('#capacity_current').text(total_population);
            $('#capacity_max').text(total_capacity);
            $('#progress').css({
                backgroundPosition: progress + 'px 0px'
            });
        }
        recalcCapacity();
        $('.index_unit').bind('click', recalcCapacity);
        $('.unit_input').bind('keyup change', recalcCapacity);
    },
    selectAllUnits: function (div) {
        var inputs = div.find('.unit_input');
        $.each(inputs, function (i, input) {
            var unit_id = $(input).attr('id').replace('unit_type_', '');
            var value = ~~$('#' + unit_id).find('.black').text();
            if (value > 0) {
                $(input).attr('value', value);
            }
        });
        TownInfo.bindDurationCounter();
        TownInfo.bindCapacityCounter();
    },
    'bindDurationCounter': function () {
        function recalcDuration() {
            function findSlowestUnit(inputs) {
                var slowest_unit = null;
                var len = inputs.length;
                var input;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    if (!isNaN(input.value) && parseInt(input.value, 10) > 0) {
                        if (slowest_unit === null || slowest_unit.duration < TownInfo.unitInfo[input.name].duration) {
                            slowest_unit = TownInfo.unitInfo[input.name];
                        }
                    }
                }
                return slowest_unit;
            }

            function onlyFlyingUnitsAreSelected() {
                var ground_units = 0;
                var flying_units = 0;
                var inputs = $('.unit_input_ground');
                var len = inputs.length;
                var input;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    if (!isNaN(input.value) && parseInt(input.value, 10) > 0) {
                        if (input.name == 'manticore' || input.name == 'harpy' || input.name == 'pegasus') {
                            flying_units++;
                        } else {
                            ground_units++;
                        }
                    }
                }
                return (flying_units > 0 && ground_units == 0);
            }
            var slowest_unit = findSlowestUnit($('.unit_input_naval'));
            if (slowest_unit === null && (TownInfo.sameIsland || onlyFlyingUnitsAreSelected())) {
                slowest_unit = findSlowestUnit($('.unit_input_ground'));
            }
            if (slowest_unit !== null) {
                var arrival = new Date((slowest_unit.arrival) * 1000);
                var arrival_in_timezone = new Date((slowest_unit.arrival) * 1000 + Timestamp.serverGMTOffset() * 1000);
                $('#duration_container').show();
                $('#duration_error').hide();
                $('#way_duration').text((TownInfo.type == 'town_info' ? '~' : '') + readableSeconds(slowest_unit.duration));
                $('#arrival_time').text((TownInfo.type == 'town_info' ? '~' : '') + readableDate(arrival, 'asUTC'));
                var is_night;
                var night_starts_at_hour = Game.night_starts_at_hour + Game.locale_gmt_offset / 3600;
                if (night_starts_at_hour < 0) {
                    night_starts_at_hour = 24 + night_starts_at_hour;
                }
                if (Game.night_duration == 0) {
                    is_night = false;
                } else if (night_starts_at_hour + Game.night_duration > 24) {
                    is_night = arrival_in_timezone.getUTCHours() <= (night_starts_at_hour + Game.night_duration - 1) % 24 || arrival_in_timezone.getUTCHours() >= night_starts_at_hour;
                } else {
                    is_night = arrival_in_timezone.getUTCHours() <= night_starts_at_hour + Game.night_duration - 1 && arrival_in_timezone.getUTCHours() >= night_starts_at_hour;
                }
                if (TownInfo.type == 'town_info' && is_night) {
                    $('#nightbonus').show();
                } else {
                    $('#nightbonus').hide();
                }
                TownInfoArrivalCountdown.start(slowest_unit.arrival);
            } else {
                $('#duration_container').hide();
                if (!TownInfo.sameIsland) {
                    $('#duration_error').show();
                    $('#duration_error').text('Über das Meer musst du Schiffe mitschicken.');
                }
                TownInfoArrivalCountdown.stop();
            }
        }
        recalcDuration();
        $('.index_unit').bind('click', recalcDuration);
        $('.unit_input').bind('keyup change', recalcDuration);
    },
    'castPower': function (options) {
        var power = options.power;
        this.town_id = options.town_id || this.town_id;
        var castedFromTownView = options.castedFromTownView || false;
        var castedFromGodsOverview = options.castedFromGodsOverview || false;
        $('#towninfo_description div').hide();
        $('#casting_power').show();
        Ajax.post('town_info', 'cast', {
            'power': power,
            'id': this.town_id,
            'castedFromTownView': castedFromTownView
        }, function (data) {
            $('#towninfo_description div').hide();
            $('#power_casted a').attr('href', data['report_url']);
            $('#power_casted').show();
            Layout.updateBar(data['bar']);
            if (data.finished_at != null && castedFromGodsOverview) {
                GodsOverview.updateTownsCastedPowers(TownInfo.town_id, data.casted_power_id, data.finished_at);
            }
        }.bind(this), {
            error: function () {
                Layout.hideAjaxLoader();
                Ajax.request_running['town_info_cast_power'] = false;
                TownInfo.showPowerDescription(power);
            }
        }, 'town_info_cast_power');
    },
    'spy': function () {
        Ajax.post('town_info', 'spy', {
            'id': this.town_id,
            'espionage_iron': $('#unit_order_input').val()
        }, function (data) {
            $('#info_tab_window_bg').tabs('load', 5);
        }.bind(this), {
            error: function () {
                Layout.hideAjaxLoader();
                Ajax.request_running['town_info_spy'] = false;
            }
        }, 'town_info_spy');
    },
    'bind_trade_slider': function (ratio, min, max) {
        var element_slider = $('#trade_slider_slider');
        this.trade_slider = new Slider({
            elementMin: $('#trade_slider_min'),
            elementMax: $('#trade_slider_max'),
            elementDown: $('#trade_slider_down'),
            elementUp: $('#trade_slider_up'),
            elementInput: $('#trade_slider_input'),
            elementSlider: element_slider,
            elementDownFast: $('#trade_slider_ffwd_down'),
            elementUpFast: $('#trade_slider_ffwd_up')
        });
        element_slider.bind('change', function () {
            var input = TownInfo.trade_slider.getValue();
            var output = Math.round(input * ratio);
            $('#trade_slider_output').val(output);
            $('#trade_out').text(output);
            $('.trade_in').text(input);
        });
        this.trade_slider.setMin(min);
        this.trade_slider.setMax(max);
        this.trade_slider.setValue(min);
    },
    'trade': function () {
        Ajax.post('town_info', 'trade', {
            'id': this.town_id,
            'wood': $('#trade_type_wood').val(),
            'stone': $('#trade_type_stone').val(),
            'iron': $('#trade_type_iron').val()
        }, function (data) {
            $("#info_tab_window_bg").tabs('load', $.inArray('trading', this.tabs));
            Layout.updateBar(data['bar']);
        }.bind(this), {}, 'town_info_trade');
    },
    'tradeWithFarmTown': function () {
        Ajax.post('farm_town_info', 'trade', {
            'id': this.town_id,
            'trade_input': TownInfo.trade_slider.getValue()
        }, function (data) {
            $("#info_tab_window_bg").tabs('load', $.inArray('trading', this.tabs));
            Layout.updateBar(data['bar']);
        }.bind(this), {}, 'town_info_trade_with_farm_town');
    },
    'updateTradeCapValue': function () {
        var values = new Array($('#trade_type_wood').val(), $('#trade_type_stone').val(), $('#trade_type_iron').val());
        var sum = parseInt($('#avlbl_cap').val());
        for (var i = 0 - 1; i <= values.length; i++) {
            sum -= parseInt(values[i] || 0, 10);
        };
        $('#left_cap').text(sum);
        $('#left_cap').css('color', sum < 0 ? '#f00' : '#000');
    },
    'showPowerDescription': function (power) {
        $('#towninfo_description .power_info').hide();
        $('#towninfo_description div').hide();
        $('#towninfo_description .power_info.' + power).show();
        $('#towninfo_description .power_info.' + power + ' div').show();
    },
    'setAttackType': function (input_id, type) {
        $('.attack_type').removeClass('attack_type_active');
        $('.attack_type_' + type).addClass('attack_type_active');
        $('#' + input_id).val(type);
    },
    'sendUnits': function (sending_type, popup_type) {
        var params = {};
        $('#send_units_form :input').each(function () {
            var name = $(this).attr('name');
            if (name) {
                params[name] = parseInt($(this).attr('value') || 0, 10);
            }
        });
        params['id'] = this.town_id;
        params['type'] = sending_type;
        tab_to_load = (sending_type == 'support') ? 'support' : 'attack';
        if ($('#attack_type_input').val()) {
            params['type'] = $('#attack_type_input').val();
        }
        if ($('#attacking_strategy_input').val()) {
            params['attacking_strategy'] = $('#attacking_strategy_input').val();
        }
        Ajax.post(popup_type, 'send_units', params, function (data) {
            $("#info_tab_window_bg").tabs('load', $.inArray(tab_to_load, this.tabs));
            if (data.tutorial_to_next_step) {
                Tutorial.calculateNextStep('send_units_complete');
            }
            if (sending_type == 'support') {
                var support_count = $('#town_support_count');
                support_count.text((~~ (support_count.text())) + 1);
            } else {
                var attack_count = $('#town_attack_count');
                attack_count.text((~~ (attack_count.text())) + 1);
            }
        }.bind(this), {}, 'send_units');
    }
};
var TownInfoArrivalCountdown = {
    init_date: null,
    duration_in_sec: 0,
    interval: null,
    start: function (slowest_unit_arrival_at) {
        TownInfoArrivalCountdown.init_date = new Date();
        TownInfoArrivalCountdown.duration_in_sec = slowest_unit_arrival_at - Game.server_time;
        TownInfoArrivalCountdown.stop();
        TownInfoArrivalCountdown.tick();
        TownInfoArrivalCountdown.interval = window.setInterval(TownInfoArrivalCountdown.tick, 1000);
    },
    tick: function () {
        var arrival = new Date((new Date()).getTime() + TownInfoArrivalCountdown.duration_in_sec * 1000);
        $('#arrival_time').text((TownInfo.type == 'town_info' ? '~' : '') + readableDate(arrival, 'asUTC'));
    },
    stop: function () {
        window.clearInterval(TownInfoArrivalCountdown.interval);
    }
}

var Espionage = {
    slider: null,
    init: function (min, max) {
        this.initSlider();
        this.slider.setValue(0);
        this.slider.setMin(min);
        this.slider.setMax(max < 0 ?
        function () {
            $('#unit_order_confirm').remove();
            Espionage.slider.disable(true);
            return 0;
        }.call() : max);
    },
    changeCount: function (e) {
        var count = parseInt(document.getElementById('unit_order_input').value);
        if (isNaN(count)) {
            return;
        }
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
            Espionage.changeCount(Espionage.slider.getValue())
        });
    },
    bindForm: function () {
        var options = {
            beforeSubmit: function () {
                TownInfo.spy();
                return false;
            }
        }
        $('#unit_order_count').ajaxForm(options);
    }
}

var Chat = {
    serviceUrl: '/chat/service/',
    connectionId: '',
    requestId: 0,
    queue: [],
    online: false,
    chatRoomName: '',
    chatClientName: '',
    init: function () {
        if (!Game || !Game.alliance_id) return;
        this.chatRoomName = 'alliance_' + Game.alliance_id;
        this.chatClientName = Game.player_name;
        document.numOpenPolls = 0;
        this.connectionId = (function (l) {
            var s = '',
                chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
            while (l--) s += chars.charAt(Math.floor(Math.random() * chars.length));
            return s;
        })(16);
        $(window).bind('beforeunload', function () {
            document.numOpenPolls = 99;
        });
        ChatUI.init();
        ChatUI.redraw();
    },
    actionPoll: function () {
        this.request({
            'op': 'poll'
        });
    },
    actionStatus: function () {
        this.request({
            'op': 'status'
        });
    },
    actionUnregister: function () {
        this.request({
            'op': 'unregister'
        });
    },
    actionConnect: function () {
        if (!this.isOnline()) {
            this.online = true;
            this.actionStatus();
        }
    },
    actionDisconnect: function () {
        if (this.isOnline()) {
            this.actionUnregister();
            this.online = false;
        }
    },
    actionMessage: function (message) {
        if ('' != message) {
            message = encodeURIComponent(message);
            message = message.replace("'", '%27');
            this.request({
                'op': 'message',
                'to': this.chatRoomName,
                'message': message
            });
        }
    },
    actionClearHistory: function () {
        this.request({
            'op': 'clear'
        });
    },
    isOnline: function () {
        return this.online;
    },
    request: function (operation) {
        if (!this.isOnline() || !operation || undefined == operation.op) {
            return;
        }
        var isStatus = ("status" == operation.op);
        var isPoll = ("poll" == operation.op);
        if (isPoll) {
            if (1 <= document.numOpenPolls) return;
            else document.numOpenPolls++;
        }
        var isMessage = ("message" == operation.op);
        if (isMessage) {
            var message = operation.message;
            if (1000 < message.length) message = message.substring(0, 1000) + "...";
            operation = {
                'op': operation.op,
                'to': operation.to
            }
        }
        var params = $.param($.extend(operation, {
            'cid': this.connectionId,
            'rid': ++this.requestId
        })),
            url = this.serviceUrl + '?' + params;
        $.ajax({
            'type': 'POST',
            'url': url,
            'data': isMessage ? "message=" + message : '',
            'success': function (data, textStatus, XMLHttpRequest) {
                if (isStatus || isPoll) {
                    if (isPoll) document.numOpenPolls--;
                    if (0 >= document.numOpenPolls) {
                        window.setTimeout(this.actionPoll.bind(this), 100);
                    }
                }
                this.handleResponse(data);
            }.bind(this),
            'error': function (XMLHttpRequest, textStatus, errorThrown) {
                if (isPoll) document.numOpenPolls--;
                this.handleResponseError($.trim(XMLHttpRequest.responseText));
            }.bind(this)
        });
    },
    getTimestamp: function () {
        return new Date().getTime();
    },
    handleResponse: function (msg) {
        var data = eval("[" + msg + "]")[0];
        if (undefined == data) {
            return;
        }
        if ('poll' == data.action) {
            for (i in data.queue) {
                this.handleMessage(data.queue[i]);
                ChatUI.notify();
            }
        }
        else if ('status' == data.action) {
            ChatRoomInfo.set(data.room);
            for (i in data.messages) {
                this.handleMessage(data.messages[i]);
            }
            ChatUI.redraw();
        }
    },
    handleMessage: function (m) {
        if (!m || 'undefined' == m.type) return;
        m.content = m.content.replace(/&apos;/g, "'");
        switch (m.type) {
        case 'User':
            this.addTextLine({
                'from': m.from,
                'text': m.content,
                'date': m.at
            });
            break;
        case 'Registered':
            ChatRoomInfo.addClient(m.from);
            this.addTextLine({
                'text': "%s hat den Raum betreten".replace("%s", m.from),
                'date': m.at,
                'isInfo': true
            });
            break;
        case 'Unregistered':
            ChatRoomInfo.removeClient(m.from);
            this.addTextLine({
                'text': "%s hat den Raum verlassen".replace("%s", m.from),
                'date': m.at,
                'isInfo': true
            });
            break;
        case 'Kicked':
            this.addTextLine({
                'text': "Du wurdest von der Allianz ausgeschlossen",
                'date': m.at,
                'isInfo': true
            });
            this.actionDisconnect();
            break;
        }
    },
    handleResponseError: function (msg) {
        switch (msg) {
        case 'player not found':
            this.addTextLine({
                'text': 'Du kannst den Chat nicht benutzen, weil Du in keiner Allianz Mitglied bist.',
                'isInfo': true
            });
            break;
        case 'not allowed':
            this.addTextLine({
                'text': 'Du bist nicht berechtigt den Chat zu benutzen!',
                'isInfo': true
            });
            break;
        case 'invalid request':
            this.addTextLine({
                'text': 'Allgemeiner Fehler',
                'isInfo': true
            });
            break;
        case 'too many connections at once':
            this.addTextLine({
                'text': 'Fehler - Du hast zu viele offene Verbindungen zum Chat. Schließe bitte einige Browser-Tabs und betrete den Chat neu.',
                'isInfo': true
            });
            break;
        case 'servererror':
        case 'null':
            this.addTextLine({
                'text': 'Serverfehler - bitte versuche es in einigen Minuten erneut.',
                'isInfo': true
            });
            break;
        }
    },
    addTextLine: function (data, addToHistory) {
        if (!data || 'undefined' == data.text) return;
        if (data.from == this.chatClientName) data.from = 'Ich';
        if (false != addToHistory) ChatHistory.add(data);
        ChatUI.redraw();
    }
};

var ChatUI = {
    elm: {},
    flags: 0,
    ACTIVE: 0x1,
    INVISIBLE: 0x2,
    UNDOCKED: 0x4,
    init: function () {
        this.loadElements();
        this.leaveEnterChat = new MousePopup('Chat verlassen');
        this.minMaxChat = new MousePopup('Chat minimieren');
        this.elm.onOffSwitch.mousePopup(this.leaveEnterChat);
        this.elm.toggleSwitch.mousePopup(this.minMaxChat);
        this.elm.dockSwitch.mousePopup(new MousePopup('Chat lösen'));
        this.elm.clear.mousePopup(new MousePopup('History löschen'));
        this.elm.textInput.originalHeight = this.elm.textInput.height();
        this.elm.textInputClone = $('<div id="chat-message-text-clone"></div>').css(this.getTFStyle()).appendTo('body');
        this.elm.notify = $('<div id="chat-notify"></div>');
        this.elm.textForm.submit(this.onSendMessage.bind(this));
        this.elm.textInput.bind('keyup.resize', function (ev) {
            var inpClone = ChatUI.elm.textInputClone,
                inp = ChatUI.elm.textInput;
            if (ev.keyCode === 13) {
                if (ev.altKey || ev.ctrlKey) {
                    this.value += '\n';
                } else {
                    ChatUI.elm.textForm.submit();
                    inp.height(inp.originalHeight);
                    return false;
                }
            }
            inpClone[0].innerHTML = '&nbsp;' + inp[0].value.replace(/\n/g, '<br />');
            if (inp.height() !== inpClone.height()) {
                inp.height(Math.max(inpClone.height(), inp.originalHeight));
                if (ChatUI.flags & ChatUI.UNDOCKED) {
                    inp.trigger('autoresize');
                }
            }
        });
        this.elm.onOffSwitch.click(this.onOnOff.bind(this));
        this.elm.toggleSwitch.bind('click', function () {
            ChatUI.toggleChatWindow()
        });
        this.elm.dockSwitch.bind('click', function () {
            ChatUI.toggleDock()
        });
        $(window).resize(function () {
            ChatUI.elm.chatPanel.height(ChatUI.getMaxHeight());
        });
        this.elm.resize.bind('mousedown', function (ev) {
            ChatUI.resize(ev);
            return false;
        })
        this.elm.clear.click(this.onHistoryClear.bind(this));
        this.loadOptions();
        var chatHeight = document.cookie.match(/chtH=(\d+)/);
        (this.flags & this.UNDOCKED) ? this.undock() : this.dock();
        if (this.flags & this.ACTIVE) {
            this.activate();
            this.toggleChatWindow(this.flags & this.INVISIBLE ? {
                off: true
            } : {
                on: true
            });
            var saved_height = (chatHeight ? ~~ (chatHeight[1]) : 80)
            this.elm.chatPanel.height(!(this.flags & this.UNDOCKED) ? Math.min(this.getMaxHeight(), saved_height) : null);
        } else {
            this.inactivate();
        }
        this.elm.textInput.empty().focus();
    },
    getMaxHeight: function () {
        var w = Math.max(80, $(window).height() - 160);
        return w;
    },
    saveOptions: function () {
        document.cookie = 'chtOpt=' + this.flags;
    },
    loadOptions: function () {
        var flags = document.cookie.match(/chtOpt=(\d+)/);
        this.flags = ~~ (flags ? flags[1] : 0);
    },
    getTFStyle: function () {
        var style_list = ['width', 'lineHeight', 'fontSize', 'letterSpacing', 'fontFamily', 'fontWeight', 'textAlign', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
        var style_copy = {};
        for (i in style_list) {
            style_copy[j = style_list[i]] = this.elm.textInput.css(j);
        }
        if (parseInt(style_copy.width) === 0) {
            delete style_copy.width;
        }
        return style_copy;
    },
    loadElements: function () {
        this.elm.chatPanel = $('#chat-history');
        this.elm.roomInfoPanel = $('#chat-roominfo');
        this.elm.textForm = $('#chat-form-message');
        this.elm.textInput = $('#chat-message-text').val('');
        this.elm.onOffSwitch = $('#chat-control-onoff a');
        this.elm.toggleSwitch = $('#chat-control-toggle a');
        this.elm.dockSwitch = $('#chat-control-dock a');
        this.elm.toggleElements = $('.chat-elements');
        this.elm.resize = $('#chat-control-resize');
        this.elm.onOffHidable = $('.chat-elements, #chat-control-clear');
        this.elm.clear = $('#chat-control-clear a');
        this.elm.chatWrapper = $('<div id="chat-wrapper"></div>');
        this.elm.menuLink = $('<li><a href="#" onclick="ChatUI.onOnOff()" >' + 'Chat' + '<span id="chat-control-onoff" class="chat-control"></span></a></li>');
    },
    onSendMessage: function () {
        var message = $.trim(this.elm.textInput.val());
        if (null != message.match(/\S+/g)) {
            Chat.actionMessage(message);
            this.elm.textInput.val('');
        }
        return false;
    },
    onHistoryClear: function () {
        ChatHistory.clear();
        Chat.actionClearHistory();
        this.redraw();
        this.elm.textInput.focus();
    },
    onOnOff: function () {
        if (Chat.isOnline()) {
            this.inactivate()
        } else {
            this.activate();
            this.elm.onOffHidable.show();
            this.toggleChatWindow(this.flags & this.INVISIBLE ? {
                off: true
            } : {
                on: true
            });
        }
        return false;
    },
    activate: function () {
        this.flags |= this.ACTIVE;
        this.saveOptions();
        $(this.flags & this.UNDOCKED ? '#chat-wrapper, #chat-border' : '#chat-border').show();
        this.elm.menuLink.detach();
        this.elm.toggleSwitch.show();
        this.elm.onOffSwitch.addClass('active');
        Chat.actionConnect();
        this.leaveEnterChat.xhtml = 'Chat verlassen'
    },
    inactivate: function () {
        this.flags &= ~this.ACTIVE;
        this.saveOptions();
        $(this.flags & this.UNDOCKED ? '#chat-wrapper' : '#chat-border').hide();
        $('#links ul').append(this.elm.menuLink);
        this.elm.toggleSwitch.hide();
        this.elm.onOffSwitch.removeClass('active');
        Chat.actionDisconnect();
        this.leaveEnterChat.xhtml = 'Chat betreten'
    },
    redraw: function () {
        var items = ChatHistory.get(),
            clients = ChatRoomInfo.getClients(),
            html = '',
            rescroll = this.elm.chatPanel[0].scrollTop === this.elm.chatPanel[0].scrollHeight - this.elm.chatPanel.height();
        for (i in items) {
            html += this.renderTextLine(items[i]);
        }
        this.elm.chatPanel.html('');
        this.elm.chatPanel.append(html);
        if (rescroll) this.rescroll();
        html = '<ul class="game_list">';
        for (i in clients) {
            html += '<li class="chat-roominfo-client ' + (i % 2 ? 'odd' : 'even') + '" title="' + clients[i] + '"><span class="player-icon">' + clients[i] + '</span></li>';
        }
        html += '</ul>';
        this.elm.roomInfoPanel.html(html);
    },
    rescroll: function () {
        this.elm.chatPanel[0].scrollTop = this.elm.chatPanel[0].scrollHeight;
    },
    renderTextLine: function (data) {
        data.date = data.date || Chat.getTimestamp();
        data.from = data.from || '';
        data.isInfo = data.isInfo || false;
        var html = '',
            date = readableDate(new Date(data.date));
        from = data.from + (!data.isInfo ? ':' : '');
        text = data.text.strip().replace(/\n/g, "<br/>");
        html += '<div class="chat-line' + (data.isInfo ? ' chat-line-notification' : '') + '">'
        html += '<span class="chat-line-date">' + date + ' </span>';
        html += '<span class="chat-line-sender">' + from + '</span> ';
        html += '<span class="chat-line-message">' + text + '</span>';
        html += '</div>';
        return html;
    },
    toggleChatWindow: function (options) {
        if (!options) {
            options = {};
            options[this.flags & this.INVISIBLE ? 'on' : 'off'] = true;
        }
        if (options.on) {
            this.elm.toggleElements.show();
            if (this.flags & this.UNDOCKED) {
                this.elm.chatWrapper.detach().appendTo($('body')).css({
                    height: 250,
                    width: null
                });
            }
            this.elm.toggleSwitch.removeClass('active');
            this.minMaxChat.xhtml = 'Chat minimieren';
            this.elm.notify.detach().attr('style', '').hide().stop(true, true);
            this.rescroll();
            this.flags &= ~this.INVISIBLE;
        } else if (options.off) {
            this.elm.toggleElements.hide();
            if (this.flags & this.UNDOCKED) {
                this.elm.chatWrapper.detach().appendTo($('body')).css({
                    height: 23,
                    width: 250
                });
            }
            this.elm.toggleSwitch.addClass('active');
            this.minMaxChat.xhtml = 'Chat maximieren';
            this.flags |= this.INVISIBLE;
        }
        this.saveOptions();
    },
    resize: function (ev) {
        var h = this.elm.chatPanel.height();
        var s_y = ev.pageY,
            e_y = s_y;
        $(document).one('mousemove.once', function () {
            if (!(this.flags && this.INVISIBLE)) {
                ChatUI.toggleChatWindow({
                    on: true
                });
            }
        });
        $(document).one('mouseup', function () {
            $(document).unbind('mousemove');
            document.cookie = 'chtH=' + ChatUI.elm.chatPanel.height();
            return false;
        });
        $(document).bind('mousemove', function (ev) {
            e_y = ev.pageY;
            cPanel = ChatUI.elm.chatPanel;
            cPanel.height(Math.min(Math.max(h + (s_y - e_y), 80), ChatUI.getMaxHeight()));
            cPanel.scrollTop(cPanel[0].scrollHeight);
            return false;
        });
    },
    notify: function (_pos) {
        if (!(this.flags & this.INVISIBLE)) {
            window.clearTimeout(window.notify_timeout);
            return;
        }
        var pos = this.elm.toggleSwitch.position();
        pos.left += 10;
        this.elm.notify.css(_pos || pos).appendTo('#chat-border').show().animate({
            top: pos.top - 14
        }, 600, 'bounce', function () {
            window.notify_timeout = window.setTimeout(function () {
                var pos = ChatUI.elm.toggleSwitch.position();
                pos.left += 10;
                ChatUI.elm.notify.animate({
                    top: pos.top -= 8
                });
                ChatUI.notify(pos);
            }, 1500)
        });
    },
    toggleDock: function () {
        if (this.flags & this.UNDOCKED) {
            this.dock();
            this.elm.dockSwitch.mousePopup(new MousePopup('Chat lösen'));
        } else {
            this.undock();
            this.elm.dockSwitch.mousePopup(new MousePopup('Chat fixieren'));
        }
        if (this.flags & this.INVISIBLE) {
            this.toggleChatWindow({
                off: true
            });
        }
    },
    undock: function () {
        var pos = document.cookie.match(/chtPos=(\d+)x(\d+)/);
        this.elm.chatWrapper.css({
            left: (pos ? ~~pos[1] : 50),
            top: (pos ? ~~pos[2] : 50)
        }).append($('#chat-border').detach()).appendTo('body').show().draggable({
            containment: 'document',
            handle: $('#main-chat-controls'),
            stop: function () {
                document.cookie = 'chtPos=' + parseInt(this.style.left) + 'x' + parseInt(this.style.top);
            }
        });
        this.elm.textInputClone.css(this.getTFStyle());
        this.elm.chatPanel.removeAttr('style');
        this.rescroll();
        this.elm.textInput.bind('autoresize', function () {
            var new_h = ChatUI.elm.toggleElements.outerHeight() - ChatUI.elm.textInput.outerHeight();
            ChatUI.elm.chatPanel.height(new_h);
            ChatUI.rescroll();
        });
        this.flags |= this.UNDOCKED;
        this.saveOptions();
    },
    dock: function () {
        this.elm.chatWrapper.removeAttr('style');
        $('#chat-border').detach().appendTo($('div.dock'));
        this.rescroll();
        this.flags &= ~this.UNDOCKED;
        this.saveOptions();
    }
};

var ChatHistory = {
    items: new Array(),
    add: function (data) {
        if (this.items.length > 0) {
            for (var i = this.items.length - 1; i >= 0; i--) {
                if (this.items[i].date == data.date && this.items[i].text == data.text) return;
            }
        }
        this.items.push(data);
    },
    get: function () {
        return this.items;
    },
    clear: function () {
        this.items = new Array();
    }
};

var ChatRoomInfo = {
    clients: new Array(),
    set: function (data) {
        this.clients = data.clients;
    },
    addClient: function (client) {
        for (i in this.clients) {
            if (client == this.clients[i]) return;
        }
        this.clients.push(client);
    },
    removeClient: function (client) {
        var clientsNew = new Array();
        for (i in this.clients) {
            if (client == this.clients[i]) continue;
            clientsNew.push(this.clients[i]);
        }
        this.clients = clientsNew;
    },
    clear: function () {
        this.clients = new Array();
    },
    getClients: function () {
        return this.clients;
    }
};

var Tabs = function (id) {
    function resizeTab(ele) {
        if (!ele) return;
        var offset = 26,
            tab_height = parseInt(ele.find('ul.game_tab_list').outerHeight()),
            container = ele.find('div.ui-tabs-panel:visible').children().first(),
            i = null;
        for (i in {
            'maxHeight': '',
            'height': ''
        }) {
            if ((this.foo = container.css(i))) {
                var new_height = 'auto';
                if (!isNaN(this.foo = parseInt(this.foo))) {
                    new_height = Math.abs(this.foo - (tab_height - offset));
                }
                container.css({
                    i: new_height
                });
                return;
            }
        }
    }
    $('#' + id).tabs({
        spinner: '',
        cache: false,
        show: function () {
            resizeTab($(this));
            if (jQuery.browser.msie) {
                $(this).parents('td').hide().show();
            }
        },
        load: function () {
            resizeTab($(this));
            if (jQuery.browser.msie) {
                $(this).parents('td').hide().show();
            }
        }
    });
}

var ColorPicker = {
    popups: {
        empty: true
    },
    type: null,
    other_id: 0,
    current_popup: null,
    current_town_player_id: null,
    init: function (current_town_player_id) {
        $('#color_delete').mousePopup(new MousePopup('Aktuelle Farbzuweisung löschen'));
        this.popups = {};
        this.popups.cc = new this.popup('bb_color_picker');
        this.current_town_player_id = current_town_player_id;
        this.current_popup = null;
        this.type = null;
        this.other_id = 0;
        $(window).resize(function () {
            if (p = ColorPicker.current_popup) {
                p.setPosition();
            }
        });
    },
    popup: function (id) {
        var p = $('#' + id);
        p.bind('keydown', function (event) {
            if (event.keyCode == 27) {
                p.hide();
                $('#bb_color_picker').detach().appendTo('#info_tab_window_bg');
            }
        });
        this.toggle = function (ele) {
            ColorPicker.current_popup = this;
            if (p.is(':hidden') && ele) {
                for (x in ColorPicker.popups) {
                    ColorPicker.close(ColorPicker.popups[x]);
                }
                this.setPosition(ele);
                $('#bb_color_picker').detach().appendTo('body');
                p.show();
                p.find('input').val('').focus();
            } else {
                ColorPicker.close(p);
            }
        }, this.setPosition = function (ele) {
            if (!this.b || ele) {
                this.b = $(ele);
            }
            var off = this.b.offset();
            p.css({
                left: off.left - 5,
                top: off.top + 24
            })
        }, this.hide = function () {
            ColorPicker.close(p);
        }, this.get = function () {
            return p;
        }
    },
    close: function (elm) {
        elm.hide();
        $('#bb_color_picker').detach().appendTo('#info_tab_window_bg');
    },
    toggle: function (ele) {
        if (arguments.length == 3) {
            this.type = arguments[1];
            this.other_id = arguments[2];
        }
        var inp = this.popups.cc.get().find('#bb_color_picker_tx')[0];
        inp.onkeyup = function () {
            var inp = $('#bb_color_picker_tx')[0];
            var g = $('#bb_color_picker_preview')[0];
            try {
                g.style.color = inp.value;
            } catch (e) {}
        }
        if (ele === true) {
            if (this.type == 'alliance') {
                ColorPicker.changeAllianceColor(this.other_id, inp.value);
            } else if (this.type == 'player') {
                ColorPicker.changePlayerColor(this.other_id, inp.value);
            }
            this.popups.cc.toggle();
            return false;
        }
        var colors = [$('#bb_color_picker_c0')[0], $('#bb_color_picker_c1')[0], $('#bb_color_picker_c2')[0], $('#bb_color_picker_c3')[0], $('#bb_color_picker_c4')[0], $('#bb_color_picker_c5')[0]];
        colors[0].rgb = [255, 0, 0];
        colors[1].rgb = [255, 255, 0];
        colors[2].rgb = [0, 255, 0];
        colors[3].rgb = [0, 255, 255];
        colors[4].rgb = [0, 0, 255];
        colors[5].rgb = [255, 0, 255];
        for (var i = 0; i <= 5; i++) {
            colors[i].onclick = function () {
                ColorPicker.color_pick_color(this.rgb);
            }
        }
        ColorPicker.color_pick_color(colors[0].rgb);
        this.popups.cc.toggle(ele);
        return false;
    },
    color_pick_color: function (col) {
        for (var l = 0; l < 6; l++) {
            for (var h = 1; h < 6; h++) {
                var cell = $('#bb_color_picker_' + h + l)[0];
                if (!cell) alert('bb_color_picker_' + h + l);
                var ll = l / 3.0;
                var hh = h / 4.5;
                hh = Math.pow(hh, 0.5);
                var light = Math.max(0, 255 * ll - 255);
                var r = Math.floor(Math.max(0, Math.min(255, (col[0] * ll * hh + 255 * (1 - hh)) + light)));
                var g = Math.floor(Math.max(0, Math.min(255, (col[1] * ll * hh + 255 * (1 - hh)) + light)));
                var b = Math.floor(Math.max(0, Math.min(255, (col[2] * ll * hh + 255 * (1 - hh)) + light)));
                cell.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
                cell.rgb = [r, g, b];
                cell.onclick = function () {
                    ColorPicker.color_set_color(this.rgb);
                }
            }
        }
    },
    color_set_color: function (color) {
        var g = $('#bb_color_picker_preview')[0];
        var inp = $('#bb_color_picker_tx')[0];
        g.style.color = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
        var rr = color[0].toString(16);
        var gg = color[1].toString(16);
        var bb = color[2].toString(16);
        rr = rr.length < 2 ? '0' + rr : rr;
        gg = gg.length < 2 ? '0' + gg : gg;
        bb = bb.length < 2 ? '0' + bb : bb;
        inp.value = rr + gg + bb;
    },
    changeAllianceColor: function (id, color) {
        Ajax.post('alliance', 'assign_map_color', {
            alliance_id: id,
            color: color,
            current_town_player_id: ColorPicker.current_town_player_id
        }, function (data) {
            this.type = null;
            this.other_id = 0;
            ColorPicker.changeColorsOnMap(data);
        });
    },
    changePlayerColor: function (id, color) {
        Ajax.post('player', 'assign_map_color', {
            player_id: id,
            color: color
        }, function (data) {
            this.type = null;
            this.other_id = 0;
            ColorPicker.changeColorsOnMap(data);
        });
    },
    removeCurrentAssignment: function () {
        if (this.type == 'alliance') {
            Ajax.post('alliance', 'remove_map_color_assignment', {
                alliance_id: ColorPicker.other_id,
                current_town_player_id: ColorPicker.current_town_player_id
            }, function (data) {
                ColorPicker.changeColorsOnMap(data);
                ColorPicker.popups.cc.toggle();
            });
        } else if (this.type == 'player') {
            Ajax.post('player', 'remove_map_color_assignment', {
                player_id: ColorPicker.other_id
            }, function (data) {
                ColorPicker.changeColorsOnMap(data);
                ColorPicker.popups.cc.toggle();
            });
        }
    },
    changeColorsOnMap: function (data) {
        if (!(ColorPicker.type == 'alliance' && data.has_custom_player_color)) {
            $('#actual_flag').attr('style', 'background-color: #' + data.color + ';');
        }
        ColorPicker.reloadPicomapTownsLayer();
        $.each(data.town_ids, function (id, town_id) {
            var elem = $('#flag_' + town_id);
            if (typeof elem != 'undefined') {
                elem.css({
                    backgroundColor: '#' + data.color
                });
            }
        });
    },
    reloadPicomapTownsLayer: function () {
        var date = new Date();
        $.each($('#picomap_towns_layer div'), function (key, div) {
            var image = $(div).children();
            var url = $(image[0]).attr('src').match(/(\/img\/delivery\?action=minimap_towns&x=\d+&y=\d+&player_id=\d+&alliance_id=\d+)/g);
            $(div).html('<img src="' + url + '&' + date.getTime() + ' alt="" />');
        })
    }
}

var UninhabitedPlaceInfo = {
    unitInfo: null,
    tabs: null,
    target_x: null,
    target_y: null,
    target_number_on_island: null,
    colonize_ship_researched: false,
    init: function (target_x, target_y, target_number_on_island) {
        TownInfo.close();
        var tabs;
        var divSize = [520, 404];
        UninhabitedPlaceInfo.target_x = target_x;
        UninhabitedPlaceInfo.target_y = target_y;
        UninhabitedPlaceInfo.target_number_on_island = target_number_on_island;
        var div = $('#uninhabitedPlaceWindow');
        if (div.length == 0) {
            div = $('<div id="uninhabitedPlaceWindow"></div>');
            div.css({
                'position': 'absolute',
                'width': divSize[0],
                'height': divSize[1],
                'top': ($('#content').outerHeight() - divSize[1]) / 2,
                'left': ($('#content').outerWidth() - divSize[0]) / 2,
                'zIndex': '10'
            });
            div.appendTo("#content");
        }
        div.show();
        div.html(tmpl('uninhabited_place_info_tmpl', {}));
        tabs = ['info', 'colonization'];
        $("#uninhabited_place_info_tabs li a").each(function (i) {
            $(this).attr('href', url('uninhabited_place_info', undefined, {
                action: tabs[i],
                target_x: target_x,
                target_y: target_y,
                target_number_on_island: target_number_on_island
            }));
            if (tabs[i] == 'info') {
                $(this).mousePopup(new MousePopup('Allgemeine Informationen'));
            } else if (tabs[i] == 'colonization') {
                $(this).mousePopup(new MousePopup('Eine neue Stadt gründen'));
            }
        });
        $("#info_tab_window_bg").tabs({
            'spinner': ''
        }).bind('tabsselect', function (event, ui) {
            $("#info_tab_window_bg .ui-tabs-panel").empty();
        });
        $("#info_tab_window_bg").bind('tabsload', function (event, ui) {
            if (ui.index == 1) {
                $('#unit_type_colonize_ship').val(1);
                $('#unit_type_colonize_ship').attr('readonly', true);
                $.each(GameData.units, function (unit) {
                    $("#" + unit).setPopup(unit);
                });
            }
        });
        if (!UninhabitedPlaceInfo.colonize_ship_researched) {
            $("#info_tab_window_bg").tabs('disable', $.inArray('colonization', tabs));
        }
        this.tabs = tabs;
    },
    'sendColonizer': function () {
        var params = {};
        $('#units :input').each(function () {
            var name = $(this).attr('name');
            if (name) {
                params[name] = parseInt($(this).attr('value') || 0, 10);
            }
        });
        params['target_x'] = UninhabitedPlaceInfo.target_x;
        params['target_y'] = UninhabitedPlaceInfo.target_y;
        params['target_number_on_island'] = UninhabitedPlaceInfo.target_number_on_island;
        Ajax.post('uninhabited_place_info', 'send_colonizer', params, function (data) {
            $("#info_tab_window_bg").tabs('load', $.inArray('colonization', this.tabs));
        }.bind(this), {}, 'send_colonizer');
    },
    'bindCapacityCounter': function () {
        function recalcCapacity() {
            function totalCapacity(inputs) {
                var total_capacity = 0;
                var len = inputs.length;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    count = parseInt(input.value, 10);
                    if (!isNaN(input.value) && count > 0) {
                        total_capacity += UninhabitedPlaceInfo.unitInfo[input.name].capacity * count;
                    }
                }
                return total_capacity;
            }

            function totalPopulation(inputs) {
                var total_population = 0;
                var len = inputs.length;
                for (var i = 0; i < len; i++) {
                    input = inputs[i];
                    count = parseInt(input.value, 10);
                    if (!isNaN(input.value) && count > 0) {
                        total_population += UninhabitedPlaceInfo.unitInfo[input.name].population * count;
                    }
                }
                return total_population;
            }
            var total_capacity = totalCapacity($('.unit_input_naval'));
            var total_population = totalPopulation($('.unit_input_ground'));
            $('#capacity_current').text(total_population);
            $('#capacity_max').text(total_capacity);
        }
        recalcCapacity();
        $('.index_unit').bind('click', recalcCapacity);
        $('.unit_input').bind('keyup', recalcCapacity);
    },
    'close': function () {
        $('#uninhabitedPlaceWindow').remove();
    }
};

var BBCodes = {
    target: null,
    popups: {
        empty: true
    },
    current_popup: null,
    init: function (options) {
        this.target = $(options.target);
        if (this.popups.empty) {
            this.popups.ts = new this.popup('bb_sizes');
            this.popups.tc = new this.popup('bb_town_chooser');
            this.popups.rc = new this.popup('bb_report_chooser')
            this.popups.cc = new this.popup('bb_color_picker');
            this.popups.ac = new this.popup('bb_award_chooser');
            delete this.popups.empty
        } else {
            for (p in this.popups) {}
        }
        $(window).resize(function () {
            if (p = BBCodes.current_popup) {
                p.setPosition();
            }
        });
        $('#bb_town_chooser_town_input').autocomplete('/autocomplete', {
            'minChars': 3,
            'max': 500,
            'extraParams': {
                'what': 'game_town'
            },
            'formatItem': function (row) {
                return row[1] + ' (' + row[2] + ')';
            }
        }).result(function (result, row) {
            BBCodes.town_chooser_chosen(row);
        });
        $('#bb_report_chooser_report_input').autocomplete('/autocomplete', {
            'minChars': 3,
            'max': 500,
            'extraParams': {
                'what': 'game_report'
            },
            'formatItem': function (row) {
                return row[1] + ' (' + row[2] + ')';
            }
        }).result(function (result, row) {
            BBCodes.report_chooser_chosen(row);
        });
    },
    popup: function (id) {
        var p = $('#' + id).detach().appendTo('body');
        p.bind('keydown', function (event) {
            if (event.keyCode == 27) {
                p.hide();
            }
        });
        this.toggle = function (ele) {
            BBCodes.current_popup = this;
            if (p.is(':hidden') && ele) {
                for (x in BBCodes.popups) {
                    BBCodes.popups[x].hide();
                }
                this.setPosition(ele);
                p.show();
                p.find('input').val('').focus();
            } else {
                p.hide();
                BBCodes.target.focus();
            }
        }, this.setPosition = function (ele) {
            if (!this.b) {
                this.b = $(ele);
            }
            var off = this.b.offset();
            p.css({
                left: off.left - 5,
                top: off.top + 24
            })
        }, this.hide = function () {
            p.hide();
        }, this.get = function () {
            return p;
        }
    },
    insert: function (start_tag, end_tag, force_place_outside) {
        var input = this.target[0];
        var scroll_pos = input.scrollTop;
        input.focus();
        if (typeof document.selection != 'undefined') {
            var range = document.selection.createRange();
            var ins_text = range.text;
            range.text = start_tag + ins_text + end_tag;
            range = document.selection.createRange();
            if (ins_text.length > 0 || true == force_place_outside) {
                range.moveStart('character', start_tag.length + ins_text.length + end_tag.length);
            } else {
                range.move('character', -end_tag.length);
            }
            range.select();
        }
        else if (typeof input.selectionStart != 'undefined') {
            var start = input.selectionStart;
            var end = input.selectionEnd;
            var ins_text = input.value.substring(start, end);
            input.value = input.value.substr(0, start) + start_tag + ins_text + end_tag + input.value.substr(end);
            var pos;
            if (ins_text.length > 0 || true === force_place_outside) {
                pos = start + start_tag.length + ins_text.length + end_tag.length;
            } else {
                pos = start + start_tag.length;
            }
            input.selectionStart = pos;
            input.selectionEnd = pos;
        }
        input.scrollTop = scroll_pos;
        return false;
    },
    textSize: function (ele) {
        this.popups.ts.toggle(ele);
    },
    town_chooser: function (ele) {
        this.popups.tc.toggle(ele);
        return false;
    },
    town_chooser_chosen: function (row) {
        this.insert('[town]' + row[0], '[/town]', true);
        this.town_chooser();
    },
    report_chooser: function (ele) {
        this.popups.rc.toggle(ele);
        return false;
    },
    report_chooser_chosen: function (row) {
        this.insert('[report]' + row[0], '[/report]', true);
        this.report_chooser();
    },
    award_chooser: function (ele) {
        this.popups.ac.toggle(ele);
        return false;
    },
    award_changed: function (what) {
        var type = $('#bb_award_chooser_award_type').val();
        var world_id = $('#bb_award_chooser_award_world').val();
        var award_id = $('#bb_award_chooser_award_award').val();
        if (type == '') {
            $('#bb_award_chooser_award_world').hide();
            return;
        }
        if (what == 'world' && world_id == '') {
            $('#bb_award_chooser_award_award').hide();
            return;
        }
        if (what == 'award' && award_id == '') {
            return;
        }
        var params = {
            type: type
        };
        if (what == 'world') {
            params.world_id = world_id;
        } else if (what == 'award') {
            params.world_id = world_id;
            params.award_id = award_id;
        }
        Ajax.post('index', 'get_awards', params, function (data) {
            if (data.code) {
                BBCodes.insert('[award]' + data.code, '[/award]');
                BBCodes.award_chooser();
                $("#bb_award_chooser_award_type option[value='']").attr('selected', 'selected');
                $('#bb_award_chooser_award_world').hide();
                $('#bb_award_chooser_award_award').hide();
            } else if (data.world_ids) {
                $('#bb_award_chooser_award_world').children().remove();
                $('#bb_award_chooser_award_world').append(new Option('- bitte auswählen -', ''));
                $.each(data.world_ids, function (i, world_id) {
                    $('#bb_award_chooser_award_world').append(new Option(world_id, world_id));
                });
                $('#bb_award_chooser_award_world').show();
            } else if (data.award_ids) {
                $('#bb_award_chooser_award_award').children().remove();
                $('#bb_award_chooser_award_award').append(new Option('- bitte auswählen -', ''));
                $.each(data.award_ids, function (award_id, award_name) {
                    $('#bb_award_chooser_award_award').append(new Option(award_name, award_id));
                });
                $('#bb_award_chooser_award_award').show();
            }
        }, {}, 'award');
    },
    color_picker_toggle: function (ele) {
        var inp = this.popups.cc.get().find('#bb_color_picker_tx')[0];
        inp.onkeyup = function () {
            var inp = $('#bb_color_picker_tx')[0];
            var g = $('#bb_color_picker_preview')[0];
            try {
                g.style.color = inp.value;
            } catch (e) {}
        }
        if (ele === true) {
            BBCodes.insert('[color=' + inp.value + ']', '[/color]');
            this.popups.cc.toggle();
            return false;
        }
        var colors = [$('#bb_color_picker_c0')[0], $('#bb_color_picker_c1')[0], $('#bb_color_picker_c2')[0], $('#bb_color_picker_c3')[0], $('#bb_color_picker_c4')[0], $('#bb_color_picker_c5')[0]];
        colors[0].rgb = [255, 0, 0];
        colors[1].rgb = [255, 255, 0];
        colors[2].rgb = [0, 255, 0];
        colors[3].rgb = [0, 255, 255];
        colors[4].rgb = [0, 0, 255];
        colors[5].rgb = [255, 0, 255];
        for (var i = 0; i <= 5; i++) {
            colors[i].onclick = function () {
                BBCodes.color_pick_color(this.rgb);
            }
        }
        BBCodes.color_pick_color(colors[0].rgb);
        this.popups.cc.toggle(ele);
        return false;
    },
    color_pick_color: function (col) {
        for (var l = 0; l < 6; l++) {
            for (var h = 1; h < 6; h++) {
                var cell = $('#bb_color_picker_' + h + l)[0];
                if (!cell) alert('bb_color_picker_' + h + l);
                var ll = l / 3.0;
                var hh = h / 4.5;
                hh = Math.pow(hh, 0.5);
                var light = Math.max(0, 255 * ll - 255);
                var r = Math.floor(Math.max(0, Math.min(255, (col[0] * ll * hh + 255 * (1 - hh)) + light)));
                var g = Math.floor(Math.max(0, Math.min(255, (col[1] * ll * hh + 255 * (1 - hh)) + light)));
                var b = Math.floor(Math.max(0, Math.min(255, (col[2] * ll * hh + 255 * (1 - hh)) + light)));
                cell.style.backgroundColor = 'rgb(' + r + ',' + g + ',' + b + ')';
                cell.rgb = [r, g, b];
                cell.onclick = function () {
                    BBCodes.color_set_color(this.rgb);
                }
            }
        }
    },
    color_set_color: function (color) {
        var g = $('#bb_color_picker_preview')[0];
        var inp = $('#bb_color_picker_tx')[0];
        g.style.color = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
        var rr = color[0].toString(16);
        var gg = color[1].toString(16);
        var bb = color[2].toString(16);
        rr = rr.length < 2 ? '0' + rr : rr;
        gg = gg.length < 2 ? '0' + gg : gg;
        bb = bb.length < 2 ? '0' + bb : bb;
        inp.value = '#' + rr + gg + bb;
    }
}