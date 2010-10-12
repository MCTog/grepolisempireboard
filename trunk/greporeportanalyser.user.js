//==UserScript==
//@name           grepoReportAnalyser
//@namespace      reportanalyser.grepolis
//@include        http://*.grepolis.com/game/report*
//@version        0.0.1
//@history		     0.0.1 Dev Version - Still growing
//==/UserScript==

(function () {

	var uW;
	if (typeof unsafeWindow === 'object'){
		uW = unsafeWindow;
	} else {
		uW = window;
	}

	// get jQuery
	var $ = uW.jQuery;


	// console function
	var l = function (msg) 
	{
		try {
			if ( typeof GM_log !== 'undefined' )
				GM_log( msg );
			else
			{
				if (  typeof opera.postError !== 'undefined' )
					opera.postError( msg );
				else
					uW.console.log(msg);
			}
		}
		catch (e) {};
	}

	function setVal( name, value )
	{
		l( "Setting "+name+" to "+ value );
		GM_setValue( name, value );
	}

//	New unique object
	if (!grepoReportAnalyser) var grepoReportAnalyser = {};

	grepoReportAnalyser =
	{
			Grepolis:		 {},
			DB:				 {},

			StartTime:		 0,
			EndTime:		 0,
			MainID:			 'grepoReportAnalyser',

			/* Script metas */
			ScriptName:		 'Grepolis Report Analyser',
			Version:		 "0.0.1",
			HomePage:		 '',
			ScriptURL:		 '',
			UserScriptsID:	 9999999,
			UnitData : 
			{ 
				militia : {defence:null,attack:2},
				sword   : {defence:{wood:  95,stone:   0,iron:  85},attack:5},
				slinger : {defence:{wood:  55,stone: 100,iron:  40},attack:23},
				archer  : {defence:{wood: 120,stone:   0,iron:  75},attack:8},
				hoplite : {defence:{wood:   0,stone:  75,iron: 150},attack:16},
				rider   : {defence:{wood: 240,stone: 120,iron: 360},attack:55},
				chariot : {defence:{wood: 200,stone: 440,iron: 320},attack:56},
				catapult: {defence:{wood:1200,stone:1200,iron:1200},attack:100},
				minotaur:{defence:{wood:1400,stone:600,iron:3100},attack:420},
				manticore:{defence:{wood:4400,stone:3000,iron:3400},attack:945},
				zyklop:{defence:{wood:2000,stone:4200,iron:3360},attack:756},
				harpy:{defence:{wood:1600,stone:400,iron:1360},attack:266},
				medusa:{defence:{wood:1500,stone:3800,iron:2200},attack:425},
				centaur:{defence:{wood:1740,stone:300,iron:700},attack:156},
				pegasus:{defence:{wood:2800,stone:360,iron:80},attack:100},
				big_transporter:{defence:{wood:500,stone:500,iron:400},attack:20},
				bireme:{defence:{wood:800,stone:700,iron:180},attack:24},
				attack_ship:{defence:{wood:1300,stone:300,iron:800},attack:200},
				demolition_ship:{defence:{wood:500,stone:750,iron:150},attack:20},
				small_transporter:{defence:{wood:800,stone:0,iron:400},attack:20},
				trireme:{defence:{wood:2000,stone:1300,iron:900},attack:180},
				colonize_ship:{defence:{wood:10000,stone:10000,iron:10000},attack:0},
				sea_monster:{defence:{wood:5400,stone:2800,iron:3800},attack:1000}
			},

	};


	grepoReportAnalyser.Init = function()
	{
		this.StartTime = new Date().getTime();
		this.HomePage		 = 'http://userscripts.org/scripts/show/'+this.UserScriptsID;
		this.ScriptURL		 = 'http://userscripts.org/scripts/source/'+this.UserScriptsID+'.user.js';

		this.DB.Init(this);
		this.DB.Load();
	};

	grepoReportAnalyser.DB =
	{
			_Parent:			 null,
			Prefix:				 '',
			Movements:		 {},
			SupportingConqueror:		 {},
			config:			 {},
	};

	grepoReportAnalyser.DB.Init = function(parent, host)
	{
		this._Parent = parent;
		if (host == undefined) host = uW.location.host;

		var prefix = host;
		prefix = prefix.replace('.grepolis.', '-');
		prefix = prefix.replace('.', '-');
		this.Prefix = prefix;
	};

	grepoReportAnalyser.DB.Serialize = function(data)
	{
		return uneval(data);
	};

	grepoReportAnalyser.DB.UnSerialize = function(data)
	{
		return eval(data);
	};

	function getVar(varname, vardefault) {
		var res = GM_getValue(grepoReportAnalyser.DB.host+varname);
		if (res == undefined) {
			return vardefault;
		}
		return res;
	}

	function setVar(varname, varvalue) {
		GM_setValue(grepoReportAnalyser.DB.host+varname, varvalue);
		l(varname + "=" + varvalue);

	}

	grepoReportAnalyser.DB.Load = function()
	{		
		if (1) {
			this.Movements = this.UnSerialize(getVar("Movements", ""));
			this.SupportingConqueror = this.UnSerialize(getVar("SupportingConqueror", ""));
			this.config = this.UnSerialize(getVar("config", ""));
		}
		if (this.Movements == null || this.Movements == undefined || this.Movements == "")
		{
			this.Movements = new Object();
		}

		if (this.SupportingConqueror == null || this.SupportingConqueror == undefined || this.SupportingConqueror == "")
		{
			this.SupportingConqueror = new Object();
		}

		if (this.config == undefined || this.config == null || this.config == "" || ("".config == "NaN"))
		{
			this.config = new Object();
		}

		// Check if main arrays exists
		if (this.config.cfg == undefined) { this.config.cfg = new Object(); }
		if (this.config["xxx"] == undefined) { this.config["xxx"] = {}; }
	};

	grepoReportAnalyser.DB.Save = function()
	{
		setVar("config", this.Serialize(this.config));
		setVar("Movements", this.Serialize(this.Movements));
	};

	grepoReportAnalyser.ReportObject = function()
	{
		var Report = new Object;

		Report.id = "";
		Report.rp = undefined;
		Report.ra = 0;
		Report.ty = undefined;
		Report.ft = undefined;
		Report.fp = undefined;
		Report.fa = undefined;
		Report.tt = undefined;
		Report.tp = undefined;
		Report.ta = undefined;
		Report.po = 0;
		Report.units={};

		return Report;		
	};

	grepoReportAnalyser.ParseReport = function(data)
	{
		var report = grepoReportAnalyser.ReportObject();
		$(data).find("#report_report_header .game_arrow_left").attr("href").match(/\?id=(.+)\&action/);
		report.id=RegExp.$1;
		var id = uW.Game.player_id+":"+report.id; 

		if (grepoReportAnalyser.DB.Movements[id] == undefined)
		{
			report.rp = uW.Game.player_id;
			report.po=0;

			var sendingTown=$(data).find("#report_sending_town");
			var receivingTown = $(data).find("#report_receiving_town");
			report.ft=$(sendingTown).find(".town_name a").html();
			report.fp=$(sendingTown).find(".town_owner a").html();
			report.fa=$(sendingTown).find(".town_owner_ally a").html();
			report.tt=$(receivingTown).find(".town_name a").html();
			report.tp=$(receivingTown).find(".town_owner a").html();
			report.ta=$(receivingTown).find(".town_owner_ally a").html();

			if ($(data).find("#report_report_header").html().match(/unterst.tzt/))
			{
				report.ty="S";
				$(data).find("#report_game_body .report_unit").each(function(index){
					{
						var result = $(this).attr("style").match(/.*\/units\/(.+)_.0x.0.png/);
						if (result)
						{
							report.units[RegExp.$1] = $(this).find(".place_unit_white").html();
						}
					}
				});
			}
			else
			{
				report.ty="A";
				$(data).find("#report_game_body .report_side_attacker_unit > .report_unit").each(function(index)
						{
					var result = $(this).attr("style").match(/.*\/units\/(.+)_.0x.0.png/);
					if (result)
					{
						report.units[RegExp.$1] = $(this).find(".place_unit_white").html();
					}
						});
			}

			grepoReportAnalyser.DB.Movements[id]=report;
		}
	};

	grepoReportAnalyser.ParseReportList = function()
	{
		$("#report_list li").each( function(index) 
				{ 
			var reportId = $(this).find("input:checkbox").val(); 
			var id = uW.Game.player_id+":"+reportId; 

			if (grepoReportAnalyser.DB.Movements[id] == undefined)
			{
				var report = grepoReportAnalyser.ReportObject();
				var subject = $(this).find(".report_subject a").html();
				var reportURL = $(this).find(".report_subject a").attr("href");

				var result = subject.match(/> (.+) \((.+)\) unterst.tzt (.+)/);
				if (subject.match(/> (.+) \((.+)\) unterst.tzt (.+)/))
				{
					$.ajax({
						url: reportURL,
						async: false,
						success: grepoReportAnalyser.ParseReport
					});
				}
				else
				{
					var resultSupport = subject.match(/> (.+) \((.+)\) greift deine (.+) an/);
					if ( !subject.match(/> (.+) \((.+)\) greift deine (.+) an/))
					{
						if (subject.match(/> (.+) \((.+)\) greift (.+) an/))
						{
							$.ajax({
								url: reportURL,
								async: false,
								success: grepoReportAnalyser.ParseReport
							});
						}
					}
				}
			}
				}
		);
	};

	grepoReportAnalyser.Init();
	if (document.location.href.match("report.id=")) {
		grepoReportAnalyser.ParseReport($(".game_border").html());
	}
	else {
		grepoReportAnalyser.ParseReportList();
	}
	grepoReportAnalyser.DB.Save();

}());