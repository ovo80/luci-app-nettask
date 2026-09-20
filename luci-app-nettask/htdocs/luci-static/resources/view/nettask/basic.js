'use strict';
'require view';
'require form';
'require fs';
'require ui';

/*
 * The user scripts stay plain files below /etc/nettask, exactly like the
 * previous CBI implementation used them, so the shell side of this package
 * (init.d/nettask, cron.sh, bucc, ping.sh) keeps working unchanged.
 *
 * Privileged work is done by /usr/libexec/nettask-action. Every call below
 * passes a fixed argument list to fs.exec(), which hands it to execv(2) - no
 * shell is involved, so nothing here can be parsed as shell syntax. The helper
 * validates its arguments again before it acts on them.
 */

function checkResult(res) {
	if (res.code !== 0) {
		const msg = (res.stderr || res.stdout || '').trim();

		throw new Error(msg || _('操作失败，退出码 %d').format(res.code));
	}

	return (res.stdout || '').trim();
}

function runDuanStatus() {
	return fs.exec('/usr/libexec/nettask-action', [ 'status', '/etc/nettask/duan.sh' ]).then(checkResult);
}

function runDuanStart() {
	return fs.exec('/usr/libexec/nettask-action', [ 'start', '/etc/nettask/duan.sh' ]).then(checkResult);
}

function runDuanStop() {
	return fs.exec('/usr/libexec/nettask-action', [ 'stop', '/etc/nettask/duan.sh' ]).then(checkResult);
}

function runApply() {
	return fs.exec('/usr/libexec/nettask-action', [ 'apply' ]).then(checkResult);
}

const HINT_EDIT = _('温馨提示：#号后面的内容为注释，如果对脚本进行了修改（或首次编辑），请先保存后再运行');

const TABS = [
	[ 'now', _('立刻执行'),
		_('单击下方按钮即可立即运行/停止脚本，支持死循环，但是需要避免空操作，以免造成资源浪费！！') ],
	[ 'boot', _('启动时执行'),
		_('此脚本在系统启动时自动执行（可选）') ],
	[ 'button', _('按下按钮时执行'),
		_('当前插件会覆盖默认按钮事件，短按按钮执行此脚本（注意：轻按一下快速松开即可，不要超过1秒，否则会重启路由器，超过五秒会重置路由器！！）') ],
	[ 'network', _('断网时执行'),
		_('此脚本在网络断开时执行（可选），此脚本应该注意避免死循环，否则可能会反复创建进程') ],
	[ 'timing', _('定时执行'),
		_('此脚本在规定时间内执行（可选），此脚本应该注意避免死循环，否则可能会反复创建进程') ]
];

const SCRIPTS = [
	{ tab: 'now', name: 'duan', file: '/etc/nettask/duan.sh' },
	{ tab: 'boot', name: 'word', file: '/etc/nettask/word.sh',
		hint: _('温馨提示：保存后此脚本会立即运行一次，而后只会在系统启动初始化阶段运行') },
	{ tab: 'button', name: 'button', file: '/etc/nettask/button.sh' },
	{ tab: 'network', name: 'network', file: '/etc/nettask/network.sh' },
	{ tab: 'timing', name: 'timing', file: '/etc/nettask/timing.sh' }
];

return view.extend({
	load: function() {
		const tasks = SCRIPTS.map(function(spec) {
			return L.resolveDefault(fs.read(spec.file), '').then(function(content) {
				return [ spec.name, content ];
			});
		});

		tasks.push(L.resolveDefault(runDuanStatus(), '0').then(function(out) {
			return [ '__running', out === '1' ];
		}));

		return Promise.all(tasks).then(function(results) {
			const state = { scripts: {}, duanRunning: false };

			results.forEach(function(r) {
				if (r[0] === '__running')
					state.duanRunning = r[1];
				else
					state.scripts[r[0]] = r[1];
			});

			return state;
		});
	},

	render: function(state) {
		const m = new form.Map('nettask', _('自定义脚本'),
			_('这是一个由用户自由编写 shell 脚本的界面工具，支持立即执行、开机执行、定时执行、断网执行和按下物理按键时执行。'));
		const s = m.section(form.TypedSection, 'nettask');

		s.anonymous = true;

		TABS.forEach(function(t) {
			s.tab(t[0], t[1], t[2]);
		});

		SCRIPTS.forEach(function(spec) {
			const o = s.taboption(spec.tab, form.TextValue, '_script_' + spec.name, null,
				spec.hint || HINT_EDIT);

			o.rows = 18;
			o.wrap = false;
			o.monospace = true;

			/*
			 * The script body is a file, not a uci option, so it is read and
			 * written directly. parse() invokes write() only when the textarea
			 * content differs from cfgvalue(), which preserves the "cmp -s"
			 * behaviour of the old implementation.
			 */
			o.cfgvalue = function() {
				return state.scripts[spec.name] || '';
			};
			o.remove = function() {
				return Promise.resolve();
			};
			o.write = function(section_id, value) {
				return fs.write(spec.file, String(value).replace(/\r\n/g, '\n'));
			};
		});

		const wordFlag = s.taboption('boot', form.Flag, 'word', _('启用脚本'), _('取消时将停用该脚本'));
		const buttonFlag = s.taboption('button', form.Flag, 'button', _('启用脚本'), _('取消时将停用该脚本'));
		const networkFlag = s.taboption('network', form.Flag, 'network', _('启用脚本'), _('取消时将停用该脚本'));

		const nettime = s.taboption('network', form.Value, 'nettime', _('时间间隔(秒)'),
			_('您希望多久检测一次网络状态？提示：此值应为 >= 1 的整数'));
		nettime.default = '30';
		nettime.datatype = 'uinteger';

		const timingFlag = s.taboption('timing', form.Flag, 'timi', _('启用脚本'), _('取消时将停用该脚本'));

		const minute = s.taboption('timing', form.Value, 'minute', _('分（0~59）'));
		minute.default = '0';

		const hour = s.taboption('timing', form.Value, 'shi', _('时（0~23）'));
		hour.default = '8';

		const day = s.taboption('timing', form.Value, 'day', _('日（1~31）'));
		day.default = '*';

		const month = s.taboption('timing', form.Value, 'month', _('月（1~12）'));
		month.default = '*';

		const week = s.taboption('timing', form.Value, 'week', _('周（1~7）'),
			_('在以上输入框中，您可以输入指定时间来定时运行脚本。如果不想指定特定值，可以使用 "*" 表示"任何数"。<br><br>例如：周的值为 "*" 表示每周的每天都会执行；"1,2,3" 表示周一、周二和周三；"1-3" 表示从周一到周三；"*/30" 表示每小时的 0 分和 30 分。<br><br>请注意，只有当每个时间条件都满足时，脚本才会执行，并请使用英文输入法输入所有符号。'));
		week.default = '*';

		/*
		 * A single button that reflects and toggles the state of duan.sh.
		 * Setting onclick replaces the default "save the whole map" action, so
		 * running or stopping a script writes nothing else.
		 */
		const runBtn = s.taboption('now', form.Button, '_run_now', null,
			_('单击下方按钮即可立即运行/停止脚本'));

		runBtn.rmempty = false;
		runBtn.remove = function() {
			return Promise.resolve();
		};
		runBtn.inputtitle = state.duanRunning ? _('停止脚本') : _('执行脚本');
		runBtn.inputstyle = state.duanRunning ? 'negative' : 'positive';
		runBtn.onclick = function(ev) {
			const btn = ev.currentTarget;
			const stop = state.duanRunning;

			btn.disabled = true;

			return (stop ? runDuanStop() : runDuanStart()).then(function() {
				state.duanRunning = !stop;

				btn.textContent = state.duanRunning ? _('停止脚本') : _('执行脚本');
				btn.className = 'cbi-button cbi-button-%s'.format(state.duanRunning ? 'negative' : 'positive');

				ui.addNotification(null, E('p', {},
					state.duanRunning ? _('脚本已在后台运行。') : _('脚本已停止。')), 'info');
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, _('操作失败：%s').format(e.message)));
			}).finally(function() {
				btn.disabled = false;
			});
		};

		this.map = m;

		return m.render();
	},

	handleSave: function() {
		return this.map.save().then(function() {
			return runApply();
		}).then(function() {
			ui.addNotification(null, E('p', {}, _('配置已保存，脚本服务已重新启动。')), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('保存失败：%s').format(e.message)));
		});
	},

	handleSaveApply: null,
	handleReset: null
});
