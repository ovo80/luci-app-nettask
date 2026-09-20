'use strict';
'require view';
'require dom';
'require form';
'require fs';
'require ui';

/*
 * Uploaded scripts live in /etc/nettask/filetab and the schedule lives in the
 * "crontab" sections of /etc/config/nettask, both unchanged from the previous
 * implementation, so /etc/nettask/cron.sh keeps working as it did.
 *
 * Privileged work is done by /usr/libexec/nettask-action with a fixed argument
 * list (see basic.js). "install" and "test" need a file name, which is written
 * to /etc/nettask/.request - a root-only file the helper validates and removes
 * - instead of being passed as a process argument.
 */

const UPLOAD_DIR = '/etc/nettask/filetab';
const STAGING = '/tmp/nettask-upload';
const REQUEST = '/etc/nettask/.request';

function checkResult(res) {
	if (res.code !== 0) {
		const msg = (res.stderr || res.stdout || '').trim();

		throw new Error(msg || _('操作失败，退出码 %d').format(res.code));
	}

	return (res.stdout || '').trim();
}

function formatSize(size) {
	const units = [ 'B', 'kB', 'MB', 'GB', 'TB' ];
	let value = Number(size) || 0;
	let unit = 0;

	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}

	return '%s %s'.format(unit ? value.toFixed(1) : value, units[unit]);
}

function formatMode(mode) {
	const bits = (Number(mode) & parseInt('777', 8)).toString(8);

	return '0' + ('000' + bits).slice(-3);
}

function formatTime(mtime) {
	const date = new Date((Number(mtime) || 0) * 1000);
	const pad = function(n) {
		return (n < 10 ? '0' : '') + n;
	};

	return '%s-%s-%s %s:%s:%s'.format(pad(date.getFullYear()), pad(date.getMonth() + 1),
		pad(date.getDate()), pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds()));
}

function listUploads() {
	return L.resolveDefault(fs.list(UPLOAD_DIR), []).then(function(entries) {
		const files = [];

		(entries || []).forEach(function(e) {
			if (e.type !== 'file')
				return;

			files.push({
				name: e.name,
				path: UPLOAD_DIR + '/' + e.name,
				size: e.size,
				mtime: e.mtime,
				mode: e.mode
			});
		});

		files.sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});

		return files;
	});
}

return view.extend({
	load: function() {
		return listUploads();
	},

	render: function(files) {
		this.files = files;

		const uploadBlock = E('div', { 'class': 'cbi-section' }, [
			E('h3', _('上传脚本')),
			E('p', { 'class': 'cbi-section-descr' },
				_('支持上传多个脚本以及多个计划任务，在本地编辑后直接上传即可运行，使用此功能时应该避免脚本进入死循环，否则可能引起严重问题。')),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': ui.createHandlerFn(this, 'handleUpload')
				}, _('上传脚本文件'))
			]),
			E('div', { 'id': 'nettask-files' }, this.renderFileTable())
		]);

		const m = new form.Map('nettask', _('计划任务列表'),
			_('在这里为已上传的脚本安排执行时间，保存后会重建 /etc/crontabs/root 中的相关条目。'));
		const s = m.section(form.TableSection, 'crontab', _('计划任务'));
		s.addremove = true;
		s.nodescriptions = true;
		s.anonymous = true;

		const shellname = s.option(form.ListValue, 'shellname', _('脚本名称'));
		shellname.value('default', _('-- 请选择 --'));
		this.files.forEach(function(f) {
			shellname.value(f.name);
		});
		shellname.default = 'default';

		const minute = s.option(form.Value, 'minute', _('分（0~59）'));
		minute.default = '0';

		const hour = s.option(form.Value, 'shi', _('时（0~23）'));
		hour.default = '6';

		const day = s.option(form.Value, 'day', _('日（1~31）'));
		day.default = '*';

		const month = s.option(form.Value, 'month', _('月（1~12）'));
		month.default = '*';

		const week = s.option(form.Value, 'week', _('周（1~7）'));
		week.default = '*';

		const state = s.option(form.ListValue, 'type', _('启用/停用'));
		state.value('0', _('停用'));
		state.value('1', _('启用'));
		state.default = '0';

		this.map = m;

		return m.render().then(function(mapEl) {
			return E([ uploadBlock, mapEl ]);
		});
	},

	renderFileTable: function() {
		const rows = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, _('文件名')),
				E('th', { 'class': 'th' }, _('大小')),
				E('th', { 'class': 'th' }, _('修改时间')),
				E('th', { 'class': 'th' }, _('权限')),
				E('th', { 'class': 'th' }, _('操作'))
			])
		];

		if (!this.files.length) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'colspan': 5 }, _('还没有上传任何脚本。'))
			]));
		}
		else {
			this.files.forEach(function(file) {
				rows.push(E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td' }, file.name),
					E('td', { 'class': 'td' }, formatSize(file.size)),
					E('td', { 'class': 'td' }, formatTime(file.mtime)),
					E('td', { 'class': 'td' }, formatMode(file.mode)),
					E('td', { 'class': 'td' }, [
						E('button', {
							'class': 'cbi-button cbi-button-apply',
							'click': ui.createHandlerFn(this, 'handleTest', file)
						}, _('试运行')),
						' ',
						E('button', {
							'class': 'cbi-button cbi-button-remove',
							'click': ui.createHandlerFn(this, 'handleRemove', file)
						}, _('移除'))
					])
				]));
			}, this);
		}

		return E('table', { 'class': 'table' }, rows);
	},

	refresh: function() {
		return listUploads().then(L.bind(function(files) {
			this.files = files;

			const container = document.getElementById('nettask-files');

			if (container)
				dom.content(container, this.renderFileTable());

			return files;
		}, this));
	},

	handleUpload: function() {
		return ui.uploadFile(STAGING).then(L.bind(function(reply) {
			return fs.write(REQUEST, reply.name + '\n').then(function() {
				return fs.exec('/usr/libexec/nettask-action', [ 'install' ]).then(checkResult);
			});
		}, this)).then(L.bind(function(name) {
			ui.addNotification(null, E('p', {}, _('脚本 %s 已上传。').format(name)), 'info');

			return this.refresh();
		}, this)).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('上传失败：%s').format(e.message)));
		});
	},

	handleTest: function(file) {
		return fs.write(REQUEST, file.name + '\n').then(function() {
			return fs.exec('/usr/libexec/nettask-action', [ 'test' ]);
		}).then(function(res) {
			const output = ((res.stdout || '') + (res.stderr || '')).trim();

			ui.showModal(_('%s 的试运行结果').format(file.name), [
				E('pre', { 'style': 'max-height:50vh; overflow:auto; white-space:pre-wrap' },
					output || _('（脚本没有任何输出）')),
				E('div', { 'class': 'right' }, [
					E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('关闭'))
				])
			]);
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('试运行失败：%s').format(e.message)));
		});
	},

	handleRemove: function(file) {
		const match = this.files.filter(function(f) {
			return f.name === file.name;
		})[0];

		if (!match)
			return Promise.reject(new Error(_('该文件已不存在。')));

		return ui.showModal(_('移除脚本'), [
			E('p', {}, _('确定要移除 %s 吗？').format(match.name)),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.hideModal }, _('取消')),
				' ',
				E('button', {
					'class': 'btn cbi-button cbi-button-negative',
					'click': ui.createHandlerFn(this, function() {
						return fs.remove(match.path).then(L.bind(function() {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('已移除 %s。').format(match.name)), 'info');

							return this.refresh();
						}, this)).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, _('移除失败：%s').format(e.message)));
						});
					})
				}, _('移除'))
			])
		]);
	},

	handleSave: function() {
		return this.map.save().then(function() {
			return fs.exec('/usr/libexec/nettask-action', [ 'sync-cron' ]).then(checkResult);
		}).then(function() {
			ui.addNotification(null, E('p', {}, _('计划任务已保存并同步到 /etc/crontabs/root。')), 'info');
		}).catch(function(e) {
			ui.addNotification(null, E('p', {}, _('保存失败：%s').format(e.message)));
		});
	},

	handleSaveApply: null,
	handleReset: null
});
